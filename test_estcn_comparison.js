// ESTCN 비교 테스트
// ESTCN 입력 조건 (이미지에서 추출):
// p1 = 125 kPa = 1.25 bar
// T1 = 300 K
// Vs = 2414 m/s
// pe = 34.37 MPa = 343.7 bar
// ar = 27 (area ratio)

// estcn-calculator.js 로드
const fs = require('fs');
eval(fs.readFileSync('./SHyST_Experiment_Logger/estcn-calculator.js', 'utf8'));

console.log('='.repeat(80));
console.log('ESTCN vs Our Implementation Comparison Test');
console.log('='.repeat(80));
console.log('');

// ESTCN 조건
const params = {
    gas: 'air',
    p1: 125000,      // Pa
    T1: 300,         // K
    Vs: 2414,        // m/s
    pe: 34.37e6,     // Pa
    ar: 27           // area ratio
};

console.log('Input Parameters:');
console.log(`  gas: ${params.gas}`);
console.log(`  p1: ${params.p1} Pa (${params.p1/1e5} bar)`);
console.log(`  T1: ${params.T1} K`);
console.log(`  Vs: ${params.Vs} m/s`);
console.log(`  pe: ${params.pe} Pa (${params.pe/1e5} bar)`);
console.log(`  ar: ${params.ar}`);
console.log('');

// 우리 코드 실행
const result = calculateShockTunnel(params);

console.log('');
console.log('='.repeat(80));
console.log('COMPARISON TABLE');
console.log('='.repeat(80));
console.log('');

// ESTCN 결과 (이미지에서 추출)
const estcn = {
    state1: {
        p: 125000,
        T: 300,
        rho: 1.45152,
        h: 302075,
        s: 6796.3,
        gam: 1.39053,
        Cp: 1022.1,
        a: 345.998
    },
    state2: {
        p: 7.3156e6,
        T: 2630.41,
        rho: 9.68285,
        h: 3.1503e6,
        s: 8128.65,
        gam: 1.28907,
        Cp: 1280.85,
        a: 971.095,
        V2: 361.874,
        Vg: 2052.13
    },
    state5: {
        p: 5.94876e7,
        T: 4551.26,
        rho: 44.3175,
        h: 6.43295e6,
        s: 8446.72,
        gam: 1.28602,
        Cp: 1326.08,
        a: 1277.77,
        Vr: 573.6
    },
    state5s: {
        p: 3.437e7,
        T: 4160.97,
        rho: 28.207,
        h: 5.73115e6,
        s: 8446.72,
        gam: 1.2852,
        Cp: 1319.62,
        a: 1215.36
    },
    state6: {
        p: 1.93221e7,
        T: 3787.56,
        rho: 17.5341,
        h: 5.06369e6,
        s: 8446.72,
        gam: 1.28474,
        Cp: 1312.73,
        a: 1155.39,
        V: 1155.39,
        M: 0.999999
    },
    state7: {
        p: 93702.4,
        T: 1283.58,
        rho: 0.254313,
        h: 1.37891e6,
        s: 8446.72,
        gam: 1.31935,
        Cp: 1185.91,
        a: 696.505,
        V: 2950.34,
        M: 4.23591
    },
    H5s_H1: 5.42908e6
};

// 비교 함수
function compare(name, estcn_val, our_val, unit = '') {
    const diff = our_val - estcn_val;
    const pct = (diff / estcn_val * 100).toFixed(2);
    const status = Math.abs(parseFloat(pct)) < 1 ? '✅' : Math.abs(parseFloat(pct)) < 5 ? '🟡' : '🔴';
    
    console.log(`${name.padEnd(20)} | ESTCN: ${estcn_val.toExponential(4)} ${unit} | Ours: ${our_val.toExponential(4)} ${unit} | Diff: ${pct}% ${status}`);
}

console.log('STATE 1 (Pre-shock):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state1.p, result.state1.p);
compare('T [K]', estcn.state1.T, result.state1.t);
compare('rho [kg/m³]', estcn.state1.rho, result.state1.rho);
compare('h [J/kg]', estcn.state1.h, result.state1.h);
compare('s [J/kg·K]', estcn.state1.s, result.state1.s);
compare('gamma', estcn.state1.gam, result.state1.gamma);
compare('Cp [J/kg·K]', estcn.state1.Cp, result.state1.Cp);
compare('a [m/s]', estcn.state1.a, result.state1.a);
console.log('');

console.log('STATE 2 (Post-incident-shock):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state2.p, result.state2.p);
compare('T [K]', estcn.state2.T, result.state2.t);
compare('rho [kg/m³]', estcn.state2.rho, result.state2.rho);
compare('h [J/kg]', estcn.state2.h, result.state2.h);
compare('s [J/kg·K]', estcn.state2.s, result.state2.s);
compare('gamma', estcn.state2.gam, result.state2.gamma);
compare('Cp [J/kg·K]', estcn.state2.Cp, result.state2.Cp);
compare('a [m/s]', estcn.state2.a, result.state2.a);
compare('V2 [m/s]', estcn.state2.V2, result.state2.V2);
compare('Vg [m/s]', estcn.state2.Vg, result.state2.Vg);
console.log('');

console.log('STATE 5 (Reflected-shock):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state5.p, result.state5.p);
compare('T [K]', estcn.state5.T, result.state5.t);
compare('rho [kg/m³]', estcn.state5.rho, result.state5.rho);
compare('h [J/kg]', estcn.state5.h, result.state5.h);
compare('s [J/kg·K]', estcn.state5.s, result.state5.s);
compare('gamma', estcn.state5.gam, result.state5.gamma);
compare('Cp [J/kg·K]', estcn.state5.Cp, result.state5.Cp);
compare('a [m/s]', estcn.state5.a, result.state5.a);
compare('Vr [m/s]', estcn.state5.Vr, result.state5.Vr);
console.log('');

console.log('STATE 5s (Equilibrium):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state5s.p, result.state5s.p);
compare('T [K]', estcn.state5s.T, result.state5s.t);
compare('rho [kg/m³]', estcn.state5s.rho, result.state5s.rho);
compare('h [J/kg]', estcn.state5s.h, result.state5s.h);
compare('s [J/kg·K]', estcn.state5s.s, result.state5s.s);
compare('gamma', estcn.state5s.gam, result.state5s.gamma);
compare('Cp [J/kg·K]', estcn.state5s.Cp, result.state5s.Cp);
compare('a [m/s]', estcn.state5s.a, result.state5s.a);
console.log('');

console.log('STATE 6 (Throat, M=1):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state6.p, result.state6.p);
compare('T [K]', estcn.state6.T, result.state6.t);
compare('rho [kg/m³]', estcn.state6.rho, result.state6.rho);
compare('h [J/kg]', estcn.state6.h, result.state6.h);
compare('s [J/kg·K]', estcn.state6.s, result.state6.s);
compare('gamma', estcn.state6.gam, result.state6.gamma);
compare('Cp [J/kg·K]', estcn.state6.Cp, result.state6.Cp);
compare('a [m/s]', estcn.state6.a, result.state6.a);
compare('V [m/s]', estcn.state6.V, result.state6.V);
compare('M', estcn.state6.M, result.state6.M);
console.log('');

console.log('STATE 7 (Nozzle exit, ar=27):');
console.log('-'.repeat(80));
compare('p [Pa]', estcn.state7.p, result.state7.p);
compare('T [K]', estcn.state7.T, result.state7.t);
compare('rho [kg/m³]', estcn.state7.rho, result.state7.rho);
compare('h [J/kg]', estcn.state7.h, result.state7.h);
compare('s [J/kg·K]', estcn.state7.s, result.state7.s);
compare('gamma', estcn.state7.gam, result.state7.gamma);
compare('Cp [J/kg·K]', estcn.state7.Cp, result.state7.Cp);
compare('a [m/s]', estcn.state7.a, result.state7.a);
compare('V [m/s]', estcn.state7.V, result.state7.V);
compare('M', estcn.state7.M, result.state7.M);
console.log('');

console.log('ENTHALPY:');
console.log('-'.repeat(80));
compare('H5s-H1 [J/kg]', estcn.H5s_H1, result.state5s.H5s_H1);
console.log('');

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log('✅ = within 1% (excellent)');
console.log('🟡 = within 1-5% (acceptable)');
console.log('🔴 = over 5% (needs investigation)');
console.log('');
