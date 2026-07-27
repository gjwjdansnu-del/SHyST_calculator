'use strict';

const assert = require('node:assert/strict');
const {
    GasState,
    calculateShockTunnel,
    expansion_to_mach,
    expansion_to_area_ratio,
    expansion_to_throat,
    pitot_condition,
    thermodynamicResiduals
} = require('./estcn-calculator.js');

function nearlyEqual(actual, expected, relativeTolerance, message) {
    const scale = Math.max(Math.abs(expected), 1);
    assert.ok(
        Math.abs(actual - expected) / scale <= relativeTolerance,
        `${message}: expected ${expected}, received ${actual}`
    );
}

function quietCalculation(params) {
    const originalLog = console.log;
    console.log = () => {};
    try {
        return calculateShockTunnel(params);
    } finally {
        console.log = originalLog;
    }
}

for (const gas of ['air', 'n2', 'o2', 'co2', 'he', 'ar', 'h2']) {
    const below = new GasState(gas);
    below.set_pT(101325, 199.999999);
    const above = new GasState(gas);
    above.set_pT(101325, 200.000001);

    assert.ok(Math.abs(above.h - below.h) < 0.1, `${gas}: enthalpy discontinuity at 200 K`);
    assert.ok(Math.abs(above.s - below.s) < 1e-3, `${gas}: entropy discontinuity at 200 K`);

    for (const state of [below, above]) {
        const residual = thermodynamicResiduals(state);
        assert.ok(Math.abs(residual.enthalpyIdentity) < 1e-13, `${gas}: h != e + p/rho`);
        assert.ok(state.Cp > state.R, `${gas}: Cp must exceed R`);
        assert.ok(state.mu > 0, `${gas}: viscosity must be positive`);
    }
}

const air = new GasState('air');
const nitrogen = new GasState('n2');
const helium = new GasState('he');
assert.notEqual(air.R, nitrogen.R, 'Air and N2 must retain distinct molecular weights');
assert.notEqual(air.R, helium.R, 'Air and He must not share gas properties');

const cryogenicAir = new GasState('air');
cryogenicAir.set_pT(1000, 67);
nearlyEqual(cryogenicAir.mu, 4.741638277994412e-6, 1e-12, '67 K CoolProp table value');
assert.match(cryogenicAir.viscosityModel, /CoolProp/, 'Low-temperature air must use CoolProp');

const denseCryogenicAir = new GasState('air');
denseCryogenicAir.set_pT(20000, 67);
assert.equal(
    denseCryogenicAir.viscosityModel,
    'Sutherland fallback',
    'Out-of-table low-temperature pressure must not silently extrapolate CoolProp'
);

const exp144 = quietCalculation({
    gas: 'air',
    p1: 120000,
    T1: 300.15,
    Vs: 1118.07,
    pe: 8605910,
    M7: 6.76
});

nearlyEqual(exp144.state2.p, 1446280, 0.01, 'exp#144 p2');
nearlyEqual(exp144.state2.T, 861.83, 0.01, 'exp#144 T2');
nearlyEqual(exp144.state5.p, 7678910, 0.01, 'exp#144 p5');
nearlyEqual(exp144.state5.T, 1462.56, 0.01, 'exp#144 T5');
nearlyEqual(exp144.state7.T, 162.326, 0.03, 'exp#144 T7');
nearlyEqual(exp144.state7.V, 1720.62, 0.01, 'exp#144 V7');
nearlyEqual(exp144.state7.M, 6.76, 1e-6, 'exp#144 M7');
assert.equal(exp144.state5s.u, 0, 'State 5s must be quiescent');
assert.ok(exp144.state7.pitot > exp144.state7.p, 'Pitot pressure must exceed static pressure');

for (const name of ['state1', 'state2', 'state5', 'state5s', 'state6', 'state7']) {
    assert.ok(
        Math.abs(exp144.diagnostics[name].enthalpyIdentity) < 1e-13,
        `${name}: h != e + p/rho`
    );
}
assert.ok(
    Math.abs(exp144.diagnostics.state7.totalEnthalpyRelativeError) < 1e-12,
    'Nozzle total enthalpy must be conserved'
);
assert.ok(
    Math.abs(exp144.diagnostics.state7.entropyRelativeError) < 1e-6,
    'Nozzle entropy must be conserved'
);

const reservoir = new GasState('air');
reservoir.set_pT(5.0e6, 1500);
const throat = expansion_to_throat(reservoir);
const area = 10;
const exit = expansion_to_area_ratio(reservoir, area, throat.mflux6);
nearlyEqual(
    exit.state7.rho * exit.V7 * area,
    throat.mflux6,
    1e-6,
    'Nozzle area-ratio mass flux'
);

const machExit = expansion_to_mach(reservoir, 4);
nearlyEqual(machExit.V7 / machExit.state7.a, 4, 1e-6, 'Mach expansion');
const pitot = pitot_condition(machExit.state7, machExit.V7);
assert.ok(pitot.p > machExit.state7.p, 'Variable-property pitot pressure');

console.log('ESTCN calculator regression tests passed.');
