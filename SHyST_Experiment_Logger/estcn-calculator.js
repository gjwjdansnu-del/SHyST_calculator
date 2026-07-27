// ============================================
// ESTCN-style Shock Tunnel Calculator
// 
// Based on: ESTCj (Equilibrium Shock Tube Conditions)
// Reference: Jacobs et al., Mechanical Engineering Report 2011/02
//
// Flow solvers follow ESTCN/ESTCj conservation and iteration logic.
// Thermodynamics use a fixed-composition NASA-polynomial model rather than
// ESTCN's Eilmer/CEA equilibrium-gas backend.
// ============================================

// ============================================
// CONSTANTS
// ============================================

const ESTCN_R_universal = 8314.51; // Universal gas constant [J/kmol·K]

// Gas molecular weights [kg/kmol]
const ESTCN_GAS_MW = {
    air: 28.9660,
    n2: 28.0134,
    o2: 31.9988,
    co2: 44.0100,
    he: 4.0026,
    ar: 39.9480,
    h2: 2.0160
};

// Enthalpy datum used by the ESTCN reference output.
// A constant datum does not affect shock/expansion energy differences, but it
// must be applied continuously and internal energy must use the same datum.
const ESTCN_H_OFFSET = 300000; // J/kg
const ESTCN_T_MIN_NASA = 200;  // Lower validity limit of the NASA polynomials [K]

// ESTCN delegates transport properties to its selected gas model. For the
// browser build, use a compact CoolProp-generated table in its validated
// single-phase gas range, with Sutherland's law as the explicit fallback.
let ESTCN_COOLPROP_TABLE = typeof globalThis !== 'undefined'
    ? globalThis.SHYST_COOLPROP_VISCOSITY_TABLE
    : null;
if (!ESTCN_COOLPROP_TABLE && typeof require === 'function') {
    try {
        ESTCN_COOLPROP_TABLE = require('./coolprop-viscosity-table.js');
    } catch (_) {
        // The generated table is optional for non-browser embedding.
    }
}

// NASA 7-coefficient polynomial coefficients
// cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4
// h/RT = a1 + a2*T/2 + a3*T^2/3 + a4*T^3/4 + a5*T^4/5 + a6/T
// s/R = a1*ln(T) + a2*T + a3*T^2/2 + a4*T^3/3 + a5*T^4/4 + a7
const ESTCN_NASA_COEFFS = {
    n2: {
        low: {  // 200-1000K
            a: [3.298677e0, 1.408240e-3, -3.963222e-6, 5.641515e-9, -2.444855e-12, -1.020900e3, 3.950372e0]
        },
        high: { // 1000-6000K
            a: [2.926640e0, 1.487977e-3, -5.684761e-7, 1.009704e-10, -6.753351e-15, -9.227977e2, 5.980528e0]
        }
    },
    o2: {
        low: {
            a: [3.78245636e0, -2.99673416e-3, 9.84730201e-6, -9.68129509e-9, 3.24372837e-12, -1.06394356e3, 3.65767573e0]
        },
        high: {
            a: [3.28253784e0, 1.48308754e-3, -7.57966669e-7, 2.09470555e-10, -2.16717794e-14, -1.08845772e3, 5.45323129e0]
        }
    },
    co2: {
        low: {  // 200-1000K
            a: [2.356773e0, 8.984596e-3, -7.123562e-6, 2.459190e-9, -1.436995e-13, -4.837197e4, 9.901052e0]
        },
        high: { // 1000-6000K
            a: [4.636594e0, 2.741319e-3, -9.958285e-7, 1.603730e-10, -9.161034e-15, -4.902493e4, -1.935348e0]
        }
    },
    he: {
        low: { a: [2.5, 0, 0, 0, 0, -7.453750e2, 9.287239e-1] },
        high: { a: [2.5, 0, 0, 0, 0, -7.453750e2, 9.287239e-1] }
    },
    ar: {
        low: { a: [2.5, 0, 0, 0, 0, -7.453750e2, 4.379674e0] },
        high: { a: [2.5, 0, 0, 0, 0, -7.453750e2, 4.379674e0] }
    },
    h2: {
        low: { a: [2.34433112e0, 7.98052075e-3, -1.94781510e-5, 2.01572094e-8, -7.37611761e-12, -9.17935173e2, 6.83010238e-1] },
        high: { a: [3.33727920e0, -4.94024731e-5, 4.99456778e-7, -1.79566394e-10, 2.00255376e-14, -9.50158922e2, -3.20502331e0] }
    }
};

// Dry-air mole fractions. NASA dimensionless polynomials mix linearly in mole
// fraction; the declared dry-air molecular weight is retained for R.
const ESTCN_AIR_COMPONENTS = [
    { gas: 'n2', moleFraction: 0.78084 },
    { gas: 'o2', moleFraction: 0.20946 },
    { gas: 'ar', moleFraction: 0.00934 },
    { gas: 'co2', moleFraction: 0.00036 }
];

// Sutherland's law constants for viscosity
const ESTCN_SUTHERLAND = {
    air: { mu_ref: 1.716e-5, T_ref: 273.15, S: 110.4 },
    n2: { mu_ref: 1.663e-5, T_ref: 273.15, S: 107.0 },
    o2: { mu_ref: 1.919e-5, T_ref: 273.15, S: 139.0 },
    co2: { mu_ref: 1.370e-5, T_ref: 273.15, S: 222.0 },
    he: { mu_ref: 1.864e-5, T_ref: 273.15, S: 79.4 },
    ar: { mu_ref: 2.125e-5, T_ref: 273.15, S: 144.0 },
    h2: { mu_ref: 8.411e-6, T_ref: 273.15, S: 97.0 }
};

// ============================================
// GAS STATE CLASS (Similar to ESTCN's Gas object)
// ============================================

class GasState {
    constructor(gasType = 'air') {
        // Normalize gas type
        const normalized = (gasType || 'air').toString().toLowerCase().trim();
        if (normalized.includes('co2') || normalized.includes('co₂')) {
            this.gasType = 'co2';
        } else if (normalized === 'n2' || normalized.includes('nitrogen') || normalized.includes('질소')) {
            this.gasType = 'n2';
        } else if (normalized === 'o2' || normalized.includes('oxygen') || normalized.includes('산소')) {
            this.gasType = 'o2';
        } else if (normalized === 'he' || normalized.includes('helium') || normalized.includes('헬륨')) {
            this.gasType = 'he';
        } else if (normalized === 'ar' || normalized.includes('argon') || normalized.includes('아르곤')) {
            this.gasType = 'ar';
        } else if (normalized === 'h2' || normalized.includes('hydrogen') || normalized.includes('수소')) {
            this.gasType = 'h2';
        } else {
            this.gasType = 'air';
        }
        
        this.mw = ESTCN_GAS_MW[this.gasType];
        this.R = ESTCN_R_universal / this.mw;  // Specific gas constant [J/kg·K]
        
        // State variables
        this.p = 101325;    // Pressure [Pa]
        this.T = 300;       // Temperature [K]
        this.rho = 0;       // Density [kg/m³]
        this.e = 0;         // Internal energy [J/kg]
        this.h = 0;         // Enthalpy [J/kg] = e + p/rho
        this.s = 0;         // Entropy [J/kg·K]
        this.a = 0;         // Speed of sound [m/s]
        this.gam = 1.4;     // Ratio of specific heats
        this.Cp = 0;        // Specific heat at constant pressure [J/kg·K]
        this.Cv = 0;        // Specific heat at constant volume [J/kg·K]
        this.mu = 0;        // Dynamic viscosity [Pa·s]
        this.viscosityModel = 'uninitialized';
    }
    
    // Clone this state
    clone() {
        const newState = new GasState(this.gasType);
        newState.p = this.p;
        newState.T = this.T;
        newState.rho = this.rho;
        newState.e = this.e;
        newState.h = this.h;
        newState.s = this.s;
        newState.a = this.a;
        newState.gam = this.gam;
        newState.Cp = this.Cp;
        newState.Cv = this.Cv;
        newState.mu = this.mu;
        newState.viscosityModel = this.viscosityModel;
        return newState;
    }
    
    // Get NASA coefficients for current temperature
    _getNASACoeffs(T = this.T) {
        const range = T < 1000 ? 'low' : 'high';
        if (this.gasType !== 'air') {
            return ESTCN_NASA_COEFFS[this.gasType][range].a;
        }

        const mixed = new Array(7).fill(0);
        for (const component of ESTCN_AIR_COMPONENTS) {
            const coeffs = ESTCN_NASA_COEFFS[component.gas][range].a;
            for (let i = 0; i < mixed.length; i++) {
                mixed[i] += component.moleFraction * coeffs[i];
            }
        }
        return mixed;
    }
    
    // Calculate Cp/R from NASA polynomial
    _calcCpOverR() {
        const a = this._getNASACoeffs(this.T);
        const T = this.T;
        return a[0] + a[1]*T + a[2]*T*T + a[3]*T*T*T + a[4]*T*T*T*T;
    }
    
    // Calculate h/RT from NASA polynomial
    _calcHOverRT() {
        const a = this._getNASACoeffs(this.T);
        const T = this.T;
        const T2 = T * T;
        const T3 = T2 * T;
        const T4 = T3 * T;
        return a[0] + a[1]*T/2 + a[2]*T2/3 + a[3]*T3/4 + a[4]*T4/5 + a[5]/T;
    }
    
    // Calculate s°/R from NASA polynomial (standard state entropy)
    _calcSOverR() {
        const a = this._getNASACoeffs(this.T);
        const T = this.T;
        const T2 = T * T;
        const T3 = T2 * T;
        const T4 = T3 * T;
        return a[0]*Math.log(T) + a[1]*T + a[2]*T2/2 + a[3]*T3/3 + a[4]*T4/4 + a[6];
    }
    
    // Calculate viscosity. CoolProp values are bilinearly interpolated in
    // temperature and log-pressure; this is compact and stable for dilute gas.
    _calcViscosity() {
        const table = ESTCN_COOLPROP_TABLE;
        if (this.gasType === 'air' && table) {
            const temperatures = table.temperatureK;
            const pressures = table.pressurePa;
            const inTemperatureRange =
                this.T >= temperatures[0] && this.T <= temperatures[temperatures.length - 1];
            const inPressureRange =
                this.p > 0 && this.p <= pressures[pressures.length - 1];

            if (inTemperatureRange && inPressureRange) {
                const bracket = (axis, value) => {
                    if (value <= axis[0]) return [0, 0, 0];
                    for (let i = 0; i < axis.length - 1; i++) {
                        if (value <= axis[i + 1]) {
                            return [i, i + 1, (value - axis[i]) / (axis[i + 1] - axis[i])];
                        }
                    }
                    const last = axis.length - 1;
                    return [last, last, 0];
                };

                const [t0, t1, ft] = bracket(temperatures, this.T);
                // Below 10 Pa, viscosity is already in the dilute-gas limit.
                const logPressure = Math.log(Math.max(this.p, pressures[0]));
                const logAxis = pressures.map(Math.log);
                const [p0, p1, fp] = bracket(logAxis, logPressure);
                const values = table.viscosityPaS;
                const mu0 = values[t0][p0] + fp * (values[t0][p1] - values[t0][p0]);
                const mu1 = values[t1][p0] + fp * (values[t1][p1] - values[t1][p0]);
                this.viscosityModel = `CoolProp ${table.coolPropVersion} ${table.fluid} table`;
                return mu0 + ft * (mu1 - mu0);
            }
        }

        const params = ESTCN_SUTHERLAND[this.gasType] || ESTCN_SUTHERLAND.air;
        const { mu_ref, T_ref, S } = params;
        this.viscosityModel = 'Sutherland fallback';
        return mu_ref * Math.pow(this.T / T_ref, 1.5) * (T_ref + S) / (this.T + S);
    }

    _nasaPropertiesAt(T) {
        const a = this._getNASACoeffs(T);
        const T2 = T * T;
        const T3 = T2 * T;
        const T4 = T3 * T;
        const cpOverR = a[0] + a[1]*T + a[2]*T2 + a[3]*T3 + a[4]*T4;
        const hOverRT = a[0] + a[1]*T/2 + a[2]*T2/3 + a[3]*T3/4 + a[4]*T4/5 + a[5]/T;
        const sOverR = a[0]*Math.log(T) + a[1]*T + a[2]*T2/2 + a[3]*T3/3 + a[4]*T4/4 + a[6];
        return {
            Cp: cpOverR * this.R,
            h: hOverRT * this.R * T + ESTCN_H_OFFSET,
            sStandard: sOverR * this.R
        };
    }

    _thermoPropertiesAt(T, p) {
        const p_ref = 101325;
        if (T >= ESTCN_T_MIN_NASA) {
            const nasa = this._nasaPropertiesAt(T);
            return {
                Cp: nasa.Cp,
                h: nasa.h,
                s: nasa.sStandard - this.R * Math.log(p / p_ref)
            };
        }

        // Below the NASA validity limit, continue from 200 K using a
        // calorically-perfect segment anchored to the NASA h and s values.
        // This preserves h and s exactly at the boundary.
        const boundary = this._nasaPropertiesAt(ESTCN_T_MIN_NASA);
        return {
            Cp: boundary.Cp,
            h: boundary.h + boundary.Cp * (T - ESTCN_T_MIN_NASA),
            s: boundary.sStandard
                + boundary.Cp * Math.log(T / ESTCN_T_MIN_NASA)
                - this.R * Math.log(p / p_ref)
        };
    }
    
    // Update all derived properties from (p, T)
    _updateFromPT() {
        if (!(this.p > 0) || !(this.T > 0)) {
            throw new Error(`GasState requires positive p and T (p=${this.p}, T=${this.T})`);
        }

        this.rho = this.p / (this.R * this.T);
        const thermo = this._thermoPropertiesAt(this.T, this.p);
        this.Cp = thermo.Cp;
        this.Cv = this.Cp - this.R;
        this.gam = this.Cp / this.Cv;
        this.h = thermo.h;
        this.e = this.h - this.p / this.rho;
        this.s = thermo.s;
        this.a = Math.sqrt(this.gam * this.R * this.T);
        this.mu = this._calcViscosity();
    }
    
    // Update all derived properties from (rho, T)
    _updateFromRhoT() {
        if (!(this.rho > 0) || !(this.T > 0)) {
            throw new Error(`GasState requires positive rho and T (rho=${this.rho}, T=${this.T})`);
        }
        this.p = this.rho * this.R * this.T;
        this._updateFromPT();
    }
    
    // ============================================
    // PUBLIC METHODS (Similar to ESTCN's Gas methods)
    // ============================================
    
    /**
     * Set state from pressure and temperature
     * This is the most common way to initialize a state.
     */
    set_pT(p, T) {
        this.p = p;
        this.T = T;
        this._updateFromPT();
    }
    
    /**
     * Set state from density and temperature
     * Used in shock calculations where rho and T are the iteration variables.
     */
    set_rhoT(rho, T) {
        this.rho = rho;
        this.T = T;
        this._updateFromRhoT();
    }
    
    /**
     * Set state from pressure and entropy (isentropic process)
     * This is the key function for isentropic expansions.
     * Uses a bracketed logarithmic-temperature solve for s(p,T)=s_target.
     */
    set_ps(p, s_target) {
        if (!(p > 0) || !Number.isFinite(s_target)) {
            throw new Error(`set_ps requires positive pressure and finite entropy (p=${p}, s=${s_target})`);
        }
        this.p = p;
        const entropyAt = (T) => this._thermoPropertiesAt(T, p).s;
        let lo = 5;
        let hi = 10000;
        const fLo = entropyAt(lo) - s_target;
        const fHi = entropyAt(hi) - s_target;
        if (fLo > 0 || fHi < 0) {
            throw new Error(`set_ps could not bracket temperature for p=${p}, s=${s_target}`);
        }

        for (let iter = 0; iter < 100; iter++) {
            const mid = Math.sqrt(lo * hi);
            const fMid = entropyAt(mid) - s_target;
            if (Math.abs(fMid) <= Math.max(1e-7 * Math.abs(s_target), 1e-5)) {
                lo = mid;
                hi = mid;
                break;
            }
            if (fMid > 0) {
                hi = mid;
            } else {
                lo = mid;
            }
        }

        this.T = Math.sqrt(lo * hi);
        this._updateFromPT();
        const relativeError = Math.abs(this.s - s_target) / Math.max(Math.abs(s_target), 1);
        if (relativeError > 1e-6) {
            throw new Error(`set_ps entropy residual too large: ${relativeError}`);
        }
    }
    
    /**
     * Print state to console (for debugging)
     */
    write_state() {
        console.log(`  p: ${this.p.toExponential(4)} Pa, T: ${this.T.toFixed(2)} K, rho: ${this.rho.toFixed(5)} kg/m³`);
        console.log(`  e: ${this.e.toFixed(0)} J/kg, h: ${this.h.toFixed(0)} J/kg, a: ${this.a.toFixed(1)} m/s, s: ${this.s.toFixed(1)} J/(kg·K)`);
        console.log(`  R: ${this.R.toFixed(3)} J/(kg·K), gam: ${this.gam.toFixed(4)}, Cp: ${this.Cp.toFixed(1)} J/(kg·K)`);
    }
}

// ============================================
// FLOW PROCESS FUNCTIONS (From ESTCN gas_flow.py)
// ============================================

/**
 * Compute post-shock conditions for ideal gas (initial guess)
 * 
 * @param {GasState} state1 - Pre-shock state
 * @param {number} Vs - Shock velocity [m/s]
 * @param {GasState} state2 - Post-shock state (will be modified)
 * @returns {Array} [V2, Vg] - Post-shock velocity in shock frame, lab frame velocity
 */
function shock_ideal(state1, Vs, state2) {
    const M1 = Vs / state1.a;
    const V1 = Vs;
    const gam = state1.gam;
    const R = state1.R;
    
    // Ideal gas normal shock relations
    const rho2_rho1 = (gam + 1.0) * M1 * M1 / (2.0 + (gam - 1.0) * M1 * M1);
    const p2_p1 = (2.0 * gam * M1 * M1 - (gam - 1.0)) / (gam + 1.0);
    
    state2.rho = state1.rho * rho2_rho1;
    state2.p = state1.p * p2_p1;
    state2.T = state2.p / (R * state2.rho);
    
    const V2 = V1 / rho2_rho1;  // From continuity
    const Vg = V1 - V2;  // Lab frame velocity
    
    state2.a = state1.a * Math.sqrt(state2.T / state1.T);
    state2.R = state1.R;
    state2.gam = state1.gam;
    
    return [V2, Vg];
}

/**
 * Limit the magnitude of delta to a fraction of the original value.
 * Prevents Newton iterations from going wild.
 */
function my_limiter(delta, orig, frac = 0.5) {
    const sign = delta >= 0 ? 1 : -1;
    const abs_delta = Math.min(Math.abs(delta), frac * Math.abs(orig));
    return sign * abs_delta;
}

/**
 * Compute post-shock conditions using high-temperature gas properties.
 * This is the core shock calculation function from ESTCN.
 * 
 * Uses Newton-Raphson iteration with (rho, T) as variables.
 * Constraints: momentum conservation, energy conservation.
 * 
 * @param {GasState} state1 - Pre-shock state
 * @param {number} Vs - Shock velocity [m/s]
 * @param {GasState} state2 - Post-shock state (will be modified)
 * @returns {Array} [V2, Vg] - Post-shock velocity in shock frame, lab frame velocity
 */
function normal_shock(state1, Vs, state2) {
    if (!(Vs > state1.a)) {
        throw new Error(`Shock speed must be supersonic relative to state 1 (Vs=${Vs}, a1=${state1.a})`);
    }
    // Initial guess via ideal gas relations
    let [V2, Vg] = shock_ideal(state1, Vs, state2);
    
    // Update state2 with real gas properties
    state2.set_pT(state2.p, state2.T);
    
    // We assume p1 and T1 are correct
    const V1 = Vs;
    state1.set_pT(state1.p, state1.T);
    
    // Conservation quantities (in shock-stationary frame)
    const momentum = state1.p + state1.rho * V1 * V1;
    const total_enthalpy = state1.h + 0.5 * V1 * V1;
    
    // Constraint function
    function Fvector(rho2, T2) {
        state2.set_rhoT(rho2, T2);
        const V2_calc = V1 * state1.rho / rho2;  // Mass conservation
        
        const f1 = momentum - state2.p - state2.rho * V2_calc * V2_calc;  // Momentum
        const f2 = total_enthalpy - state2.h - 0.5 * V2_calc * V2_calc;  // Energy
        
        return [f1, f2];
    }
    
    // Newton-Raphson iteration
    const rho_tol = 1.0e-3;  // kg/m³
    const T_tol = 0.25;      // K
    
    for (let count = 0; count < 25; count++) {
        const rho_save = state2.rho;
        const T_save = state2.T;
        const [f1_save, f2_save] = Fvector(rho_save, T_save);
        
        // Numerical Jacobian
        const d_rho = rho_save * 0.01;
        const d_T = T_save * 0.01;
        
        let [f1, f2] = Fvector(rho_save + d_rho, T_save);
        const df1drho = (f1 - f1_save) / d_rho;
        const df2drho = (f2 - f2_save) / d_rho;
        
        [f1, f2] = Fvector(rho_save, T_save + d_T);
        const df1dT = (f1 - f1_save) / d_T;
        const df2dT = (f2 - f2_save) / d_T;
        
        // Solve 2x2 linear system: A * [drho, dT]^T = -[f1, f2]^T
        const det = df1drho * df2dT - df1dT * df2drho;
        if (Math.abs(det) < 1e-30) {
            console.warn('normal_shock: Jacobian singular');
            break;
        }
        
        let rho_delta = (-f1_save * df2dT + f2_save * df1dT) / det;
        let T_delta = (-f2_save * df1drho + f1_save * df2drho) / det;
        
        // Limit step size
        rho_delta = my_limiter(rho_delta, rho_save);
        T_delta = my_limiter(T_delta, T_save);
        
        const rho_new = rho_save + rho_delta;
        const T_new = T_save + T_delta;
        
        state2.set_rhoT(rho_new, T_new);
        
        // Check convergence
        if (Math.abs(rho_delta) < rho_tol && Math.abs(T_delta) < T_tol) {
            break;
        }
    }
    
    // Final velocities from continuity
    V2 = V1 * state1.rho / state2.rho;
    Vg = V1 - V2;
    
    return [V2, Vg];
}

/**
 * Compute reflected shock conditions.
 * The reflected shock brings the gas to rest (u5 = 0) at the end wall.
 * 
 * @param {GasState} state2 - Post-incident-shock state
 * @param {number} Vg - Lab-frame velocity of gas in state 2
 * @param {GasState} state5 - Reflected shock state (will be modified)
 * @returns {number} Vr - Reflected shock velocity in lab frame
 */
function reflected_shock(state2, Vg, state5) {
    // Initial guess: strong shock in ideal gas
    const density_ratio = (state2.gam + 1.0) / (state2.gam - 1.0);
    let Vr_a = Vg / density_ratio;
    
    // The gas approaches the reflected shock at velocity (Vr + Vg) in shock frame
    let [V5, Vjunk] = normal_shock(state2, Vr_a + Vg, state5);
    
    // Objective: V5 = Vr (gas at rest in lab frame)
    // f = V5 - Vr should be zero
    let f_a = V5 - Vr_a;
    
    // Secant method iteration
    let Vr_b = 1.1 * Vr_a;
    [V5, Vjunk] = normal_shock(state2, Vr_b + Vg, state5);
    let f_b = V5 - Vr_b;
    
    // Ensure f_b is the better guess
    if (Math.abs(f_a) < Math.abs(f_b)) {
        [f_a, f_b] = [f_b, f_a];
        [Vr_a, Vr_b] = [Vr_b, Vr_a];
    }
    
    let count = 0;
    while (Math.abs(f_b) > 0.5 && count < 25) {
        const slope = (f_b - f_a) / (Vr_b - Vr_a);
        const Vr_c = Vr_b - f_b / slope;
        
        [V5, Vjunk] = normal_shock(state2, Vr_c + Vg, state5);
        const f_c = V5 - Vr_c;
        
        if (Math.abs(f_c) < Math.abs(f_b)) {
            Vr_b = Vr_c;
            f_b = f_c;
        } else {
            Vr_a = Vr_c;
            f_a = f_c;
        }
        count++;
    }
    
    if (count >= 25) {
        console.warn('reflected_shock: iteration did not converge');
    }
    
    // Final update
    [V5, Vjunk] = normal_shock(state2, Vr_b + Vg, state5);
    
    return Vr_b;
}

/**
 * Isentropic expansion from stagnation condition to a given pressure ratio.
 * 
 * @param {number} p_over_p0 - Pressure ratio p/p0
 * @param {GasState} state0 - Stagnation state
 * @returns {Array} [new_state, V] - Expanded state and flow velocity
 */
function expand_from_stagnation(p_over_p0, state0) {
    if (!(p_over_p0 > 0) || p_over_p0 > 1.0) {
        throw new Error(`expand_from_stagnation requires 0 < p/p0 <= 1 (received ${p_over_p0})`);
    }
    const new_state = state0.clone();
    
    // Set new pressure while keeping entropy constant
    new_state.set_ps(state0.p * p_over_p0, state0.s);
    
    // Verify entropy is conserved
    const s_error = Math.abs(new_state.s - state0.s) / Math.abs(state0.s);
    if (s_error > 0.001) {
        console.warn(`expand_from_stagnation: entropy not conserved, error = ${s_error}`);
    }
    
    // Calculate velocity from energy conservation
    // H0 = h + 0.5*V^2  =>  V = sqrt(2*(H0 - h))
    const H0 = state0.h;  // Stagnation enthalpy (V0 = 0)
    const h = new_state.h;
    
    const enthalpyDrop = H0 - h;
    if (enthalpyDrop < -Math.max(1e-6 * Math.abs(H0), 1e-3)) {
        throw new Error(`expand_from_stagnation produced h > H0 by ${-enthalpyDrop} J/kg`);
    }

    const V = Math.sqrt(2.0 * Math.max(0, enthalpyDrop));
    
    return [new_state, V];
}

/**
 * Find throat condition (M = 1) by isentropic expansion from stagnation.
 * 
 * @param {GasState} state0 - Stagnation state (reservoir)
 * @returns {Object} {state6, V6, mflux6} - Throat state, velocity, mass flux
 */
function expansion_to_throat(state0) {
    const result = expansion_to_mach(state0, 1.0);
    const state6 = result.state7;
    const V6 = result.V7;
    const mflux6 = state6.rho * V6;  // Mass flux per unit area
    
    return { state6, V6, mflux6, p_ratio: result.p_ratio };
}

/**
 * Isentropic expansion to a given area ratio (nozzle exit).
 * Uses mass flux conservation: rho * V * A = constant
 * 
 * @param {GasState} state0 - Stagnation state (reservoir)
 * @param {number} area_ratio - Exit area / throat area
 * @param {number} mflux_throat - Mass flux at throat [kg/s/m²]
 * @returns {Object} {state7, V7} - Exit state and velocity
 */
function expansion_to_area_ratio(state0, area_ratio, mflux_throat) {
    if (!(area_ratio > 1) || !Number.isFinite(area_ratio)) {
        throw new Error(`Nozzle area ratio must be greater than 1 (received ${area_ratio})`);
    }

    const error_in_mass_flux = (p_ratio) => {
        const [state, V] = expand_from_stagnation(p_ratio, state0);
        const mflux = state.rho * V * area_ratio;
        return (mflux - mflux_throat) / mflux_throat;
    };

    const throat = expansion_to_mach(state0, 1.0);
    let low = Math.max(1e-8, throat.p_ratio * 1e-4);
    let high = throat.p_ratio;
    if (error_in_mass_flux(low) > 0 || error_in_mass_flux(high) < 0) {
        throw new Error(`Could not bracket supersonic solution for area ratio ${area_ratio}`);
    }

    for (let iter = 0; iter < 100; iter++) {
        const mid = Math.sqrt(low * high);
        const error = error_in_mass_flux(mid);
        if (Math.abs(error) < 1e-8) {
            low = mid;
            high = mid;
            break;
        }
        if (error > 0) {
            high = mid;
        } else {
            low = mid;
        }
    }

    const p_ratio = Math.sqrt(low * high);
    const [state7, V7] = expand_from_stagnation(p_ratio, state0);
    return { state7, V7, p_ratio };
}

/**
 * Isentropic expansion to a given Mach number.
 * Solves pressure ratio with the selected variable-Cp gas model.
 * 
 * @param {GasState} state0 - Stagnation state (reservoir)
 * @param {number} M_target - Target Mach number
 * @returns {Object} {state7, V7} - Exit state and velocity
 */
function expansion_to_mach(state0, M_target) {
    if (!(M_target > 0) || !Number.isFinite(M_target)) {
        throw new Error(`Target Mach number must be positive (received ${M_target})`);
    }

    // ESTCN uses the perfect-gas relation only as an initial estimate. The
    // actual pressure ratio is solved with the selected gas model so entropy,
    // total enthalpy and Mach number are satisfied simultaneously.
    const gammaGuess = state0.gam;
    const idealGuess = Math.pow(
        1 + 0.5 * (gammaGuess - 1) * M_target * M_target,
        -gammaGuess / (gammaGuess - 1)
    );

    const evaluate = (pRatio) => {
        const [state, V] = expand_from_stagnation(pRatio, state0);
        return { state, V, mach: V / state.a };
    };

    let low = Math.max(1e-10, idealGuess * 0.01);
    let high = Math.min(1.0, idealGuess * 100);
    let atLow = evaluate(low);
    let atHigh = evaluate(high);

    while (atLow.mach < M_target && low > 1e-10) {
        low = Math.max(1e-10, low * 0.1);
        atLow = evaluate(low);
    }
    while (atHigh.mach > M_target && high < 1.0) {
        high = Math.min(1.0, high * 2);
        atHigh = evaluate(high);
    }
    if (atLow.mach < M_target || atHigh.mach > M_target) {
        throw new Error(`Could not bracket pressure ratio for Mach ${M_target}`);
    }

    let result = atHigh;
    for (let iter = 0; iter < 100; iter++) {
        const mid = Math.sqrt(low * high);
        result = evaluate(mid);
        const error = result.mach - M_target;
        if (Math.abs(error) < 1e-8) {
            low = mid;
            high = mid;
            break;
        }
        if (error > 0) {
            low = mid;
        } else {
            high = mid;
        }
    }

    const p_ratio = Math.sqrt(low * high);
    result = evaluate(p_ratio);
    return { state7: result.state, V7: result.V, p_ratio };
}

/**
 * Bring a flowing state to rest isentropically using the same thermodynamic
 * model as the static state.
 */
function total_condition(state1, V1) {
    if (!(V1 >= 0) || !Number.isFinite(V1)) {
        throw new Error(`total_condition requires a finite non-negative velocity (received ${V1})`);
    }
    const targetEnthalpy = state1.h + 0.5 * V1 * V1;
    const targetEntropy = state1.s;
    if (V1 === 0) return state1.clone();

    const gammaGuess = state1.gam;
    const machGuess = V1 / state1.a;
    const idealPressureRatio = Math.pow(
        1 + 0.5 * (gammaGuess - 1) * machGuess * machGuess,
        gammaGuess / (gammaGuess - 1)
    );

    const evaluate = (pressureRatio) => {
        const state = state1.clone();
        state.set_ps(state1.p * pressureRatio, targetEntropy);
        return { state, residual: state.h - targetEnthalpy };
    };

    let low = 1.0;
    let high = Math.max(1.1, idealPressureRatio * 2);
    let atHigh = evaluate(high);
    while (atHigh.residual < 0 && high < 1e12) {
        high *= 10;
        atHigh = evaluate(high);
    }
    if (atHigh.residual < 0) {
        throw new Error('Could not bracket total-condition pressure');
    }

    let result = atHigh;
    for (let iter = 0; iter < 100; iter++) {
        const mid = Math.sqrt(low * high);
        result = evaluate(mid);
        if (Math.abs(result.residual) <= Math.max(1e-8 * Math.abs(targetEnthalpy), 1e-3)) {
            low = mid;
            high = mid;
            break;
        }
        if (result.residual > 0) {
            high = mid;
        } else {
            low = mid;
        }
    }
    return evaluate(Math.sqrt(low * high)).state;
}

/**
 * Pitot state: process supersonic flow through a normal shock and then bring
 * the subsonic stream to rest isentropically.
 */
function pitot_condition(state1, V1) {
    if (V1 > state1.a) {
        const postShock = new GasState(state1.gasType);
        postShock.set_pT(state1.p, state1.T);
        const [V2] = normal_shock(state1.clone(), V1, postShock);
        return total_condition(postShock, V2);
    }
    return total_condition(state1, V1);
}

function thermodynamicResiduals(state, stagnationEnthalpy = null, V = 0, referenceEntropy = null) {
    const identityScale = Math.max(Math.abs(state.h), 1);
    const enthalpyIdentity = (state.h - (state.e + state.p / state.rho)) / identityScale;
    const totalEnthalpy = state.h + 0.5 * V * V;
    return {
        enthalpyIdentity,
        totalEnthalpy,
        totalEnthalpyRelativeError: stagnationEnthalpy === null
            ? null
            : (totalEnthalpy - stagnationEnthalpy) / Math.max(Math.abs(stagnationEnthalpy), 1),
        entropyRelativeError: referenceEntropy === null
            ? null
            : (state.s - referenceEntropy) / Math.max(Math.abs(referenceEntropy), 1)
    };
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

/**
 * Calculate all states for a reflected shock tunnel.
 * This is the main entry point, equivalent to ESTCN's --task=stn
 * 
 * @param {Object} params - Input parameters
 * @param {string} params.gas - Gas type ('air' or 'co2')
 * @param {number} params.p1 - Initial pressure [Pa]
 * @param {number} params.T1 - Initial temperature [K]
 * @param {number} params.Vs - Incident shock speed [m/s]
 * @param {number} params.pe - Equilibrium pressure after reflection [Pa] (optional)
 * @param {number} params.M7 - Target Mach number at nozzle exit (optional)
 * @param {number} params.ar - Area ratio (optional, alternative to M7)
 * @returns {Object} All calculated states
 */
function calculateShockTunnel(params) {
    const { gas, p1, T1, Vs, pe, M7, ar } = params;
    
    console.log('='.repeat(60));
    console.log('ESTCN-style Shock Tunnel Calculation');
    console.log('='.repeat(60));
    console.log(`Input: gas=${gas}, p1=${p1} Pa, T1=${T1} K, Vs=${Vs} m/s`);
    if (pe) console.log(`       pe=${pe} Pa`);
    if (M7) console.log(`       M7=${M7}`);
    if (ar) console.log(`       ar=${ar}`);
    console.log('');
    
    // ========================================
    // State 1: Pre-shock condition
    // ========================================
    console.log('State 1: pre-shock condition');
    const state1 = new GasState(gas);
    state1.set_pT(p1, T1);
    state1.write_state();
    console.log('');
    
    // ========================================
    // State 2: Post-incident-shock condition
    // ========================================
    console.log('Start incident-shock calculation.');
    const state2 = new GasState(gas);
    state2.set_pT(p1, T1);  // Initialize
    
    const [V2, Vg] = normal_shock(state1, Vs, state2);
    
    console.log('State 2: post-shock condition.');
    state2.write_state();
    console.log(`  V2: ${V2.toFixed(3)} m/s, Vg: ${Vg.toFixed(3)} m/s`);
    console.log('');
    
    // ========================================
    // State 5: Reflected-shock condition
    // ========================================
    console.log('Start reflected-shock calculation.');
    const state5 = new GasState(gas);
    state5.set_pT(state2.p, state2.T);  // Initialize
    
    const Vr = reflected_shock(state2, Vg, state5);
    
    console.log('State 5: reflected-shock condition.');
    state5.write_state();
    console.log(`  Vr: ${Vr.toFixed(3)} m/s`);
    console.log('');
    
    // ========================================
    // State 5s: Equilibrium condition (isentropic relaxation to pe)
    // ========================================
    let state5s = state5.clone();
    const V5s = 0;
    
    if (pe && pe !== state5.p) {
        console.log('Start calculation of isentropic relaxation.');
        
        // ESTCN treats 5s as a new, quiescent nozzle-reservoir condition:
        // measured pressure pe with the entropy of state 5.
        state5s.set_ps(pe, state5.s);
        
        console.log('State 5s: equilibrium condition (relaxation to pe)');
        state5s.write_state();
    } else {
        console.log('State 5s: same as State 5 (no relaxation pressure specified)');
        state5s = state5.clone();
    }
    
    // Enthalpy difference (H5s - H1)
    const H5s_H1 = state5s.h - state1.h;
    console.log(`Enthalpy difference (H5s - H1): ${H5s_H1.toExponential(5)} J/kg`);
    console.log(`                              = ${(H5s_H1 / 1e6).toFixed(4)} MJ/kg`);
    console.log('');
    
    // ========================================
    // State 6: Nozzle throat (M = 1)
    // ========================================
    console.log('Start isentropic relaxation to throat (Mach 1)');
    const { state6, V6, mflux6 } = expansion_to_throat(state5s);
    
    const M6 = V6 / state6.a;
    console.log('State 6: Nozzle-throat condition (relaxation to M=1)');
    state6.write_state();
    console.log(`  V6: ${V6.toFixed(2)} m/s, M6: ${M6.toFixed(6)}, mflux6: ${mflux6.toFixed(1)} kg/s/m²`);
    console.log('');
    
    // ========================================
    // State 7: Nozzle exit
    // ========================================
    let state7, V7;
    
    if (M7) {
        console.log(`Start isentropic relaxation to nozzle exit (M=${M7})`);
        const result = expansion_to_mach(state5s, M7);
        state7 = result.state7;
        V7 = result.V7;
    } else if (ar) {
        console.log(`Start isentropic relaxation to nozzle exit (area ratio=${ar})`);
        const result = expansion_to_area_ratio(state5s, ar, mflux6);
        state7 = result.state7;
        V7 = result.V7;
    } else {
        // Default: use M = 6
        console.log('Start isentropic relaxation to nozzle exit (default M=6)');
        const result = expansion_to_mach(state5s, 6.0);
        state7 = result.state7;
        V7 = result.V7;
    }
    
    const M7_calc = V7 / state7.a;
    const mflux7 = state7.rho * V7;
    
    const state7Pitot = pitot_condition(state7, V7);
    const pitot7 = state7Pitot.p;
    
    console.log('State 7: Nozzle-exit condition');
    state7.write_state();
    console.log(`  V7: ${V7.toFixed(2)} m/s, M7: ${M7_calc.toFixed(5)}, mflux7: ${mflux7.toFixed(1)} kg/s/m²`);
    console.log(`  pitot: ${pitot7.toExponential(5)} Pa, pitot7_on_p5s: ${(pitot7 / state5s.p).toFixed(6)}`);
    console.log('');
    
    console.log('Done with reflected shock tube calculation.');
    console.log('='.repeat(60));

    const diagnostics = {
        state1: thermodynamicResiduals(state1),
        state2: thermodynamicResiduals(state2),
        state5: thermodynamicResiduals(state5),
        state5s: thermodynamicResiduals(state5s),
        state6: thermodynamicResiduals(state6, state5s.h, V6, state5s.s),
        state7: thermodynamicResiduals(state7, state5s.h, V7, state5s.s)
    };
    
    // ========================================
    // Return all results
    // ========================================
    return {
        state1: {
            p: state1.p,
            T: state1.T,
            rho: state1.rho,
            h: state1.h,
            e: state1.e,
            s: state1.s,
            a: state1.a,
            gam: state1.gam,
            Cp: state1.Cp,
            R: state1.R,
            mu: state1.mu,
            u: 0,
            M: 0
        },
        state2: {
            p: state2.p,
            T: state2.T,
            rho: state2.rho,
            h: state2.h,
            e: state2.e,
            s: state2.s,
            a: state2.a,
            gam: state2.gam,
            Cp: state2.Cp,
            R: state2.R,
            mu: state2.mu,
            u: Vg,
            V2: V2,
            Vg: Vg,
            M: Vg / state2.a
        },
        state5: {
            p: state5.p,
            T: state5.T,
            rho: state5.rho,
            h: state5.h,
            e: state5.e,
            s: state5.s,
            a: state5.a,
            gam: state5.gam,
            Cp: state5.Cp,
            R: state5.R,
            mu: state5.mu,
            u: 0,
            Vr: Vr,
            M: 0
        },
        state5s: {
            p: state5s.p,
            T: state5s.T,
            rho: state5s.rho,
            h: state5s.h,
            e: state5s.e,
            s: state5s.s,
            a: state5s.a,
            gam: state5s.gam,
            Cp: state5s.Cp,
            R: state5s.R,
            mu: state5s.mu,
            u: V5s,
            M: V5s / state5s.a,
            H5s_H1: H5s_H1,
            H5s_H1_MJ: H5s_H1 / 1e6
        },
        state6: {
            p: state6.p,
            T: state6.T,
            rho: state6.rho,
            h: state6.h,
            e: state6.e,
            s: state6.s,
            a: state6.a,
            gam: state6.gam,
            Cp: state6.Cp,
            R: state6.R,
            mu: state6.mu,
            u: V6,
            V: V6,
            M: M6,
            mflux: mflux6
        },
        state7: {
            p: state7.p,
            T: state7.T,
            rho: state7.rho,
            h: state7.h,
            e: state7.e,
            s: state7.s,
            a: state7.a,
            gam: state7.gam,
            Cp: state7.Cp,
            R: state7.R,
            mu: state7.mu,
            viscosityModel: state7.viscosityModel,
            Re_unit: calcReynoldsUnit(state7.rho, V7, state7.mu),
            u: V7,
            V: V7,
            M: M7_calc,
            mflux: mflux7,
            pitot: pitot7,
            pitot_on_p5s: pitot7 / state5s.p
        },
        // Summary
        enthalpy_MJ: H5s_H1 / 1e6,
        shock_speed: Vs,
        reflected_shock_speed: Vr,
        diagnostics
    };
}

/**
 * Calculate unit Reynolds number
 * Re/m = rho * V / mu
 */
function calcReynoldsUnit(rho, V, mu) {
    return rho * V / mu;
}

/**
 * Calculate total enthalpy
 * h_total = h + 0.5 * V^2
 */
function calcTotalEnthalpy(h, V) {
    return h + 0.5 * V * V;
}

// ============================================
// EXPORT FOR USE IN APP.JS
// ============================================

// Make functions available globally
if (typeof window !== 'undefined') {
    window.GasState = GasState;
    window.calculateShockTunnel = calculateShockTunnel;
    window.normal_shock = normal_shock;
    window.reflected_shock = reflected_shock;
    window.expand_from_stagnation = expand_from_stagnation;
    window.expansion_to_throat = expansion_to_throat;
    window.expansion_to_mach = expansion_to_mach;
    window.expansion_to_area_ratio = expansion_to_area_ratio;
    window.total_condition = total_condition;
    window.pitot_condition = pitot_condition;
    window.thermodynamicResiduals = thermodynamicResiduals;
    window.calcReynoldsUnit = calcReynoldsUnit;
    window.calcTotalEnthalpy = calcTotalEnthalpy;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GasState,
        calculateShockTunnel,
        normal_shock,
        reflected_shock,
        expand_from_stagnation,
        expansion_to_throat,
        expansion_to_mach,
        expansion_to_area_ratio,
        total_condition,
        pitot_condition,
        thermodynamicResiduals,
        calcReynoldsUnit,
        calcTotalEnthalpy
    };
}
