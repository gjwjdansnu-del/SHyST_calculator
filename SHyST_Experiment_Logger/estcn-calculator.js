// ============================================
// ESTCN-style Shock Tunnel Calculator
// 
// Based on: ESTCj (Equilibrium Shock Tube Conditions)
// Reference: Jacobs et al., Mechanical Engineering Report 2011/02
//
// This implementation follows the exact same logic as ESTCN/ESTCj
// using NASA polynomial thermodynamics instead of CEA2.
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

// NASA 7-coefficient polynomial coefficients
// cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4
// h/RT = a1 + a2*T/2 + a3*T^2/3 + a4*T^3/4 + a5*T^4/5 + a6/T
// s/R = a1*ln(T) + a2*T + a3*T^2/2 + a4*T^3/3 + a5*T^4/4 + a7
const ESTCN_NASA_COEFFS = {
    // Air (using N2 as primary component)
    air: {
        low: {  // 200-1000K
            a: [3.298677e0, 1.408240e-3, -3.963222e-6, 5.641515e-9, -2.444855e-12, -1.020900e3, 3.950372e0]
        },
        high: { // 1000-6000K
            a: [2.926640e0, 1.487977e-3, -5.684761e-7, 1.009704e-10, -6.753351e-15, -9.227977e2, 5.980528e0]
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
    }
};

// Sutherland's law constants for viscosity
const ESTCN_SUTHERLAND = {
    air: { mu_ref: 1.716e-5, T_ref: 273.15, S: 110.4 },
    co2: { mu_ref: 1.370e-5, T_ref: 273.15, S: 222.0 }
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
        return newState;
    }
    
    // Get NASA coefficients for current temperature
    _getNASACoeffs() {
        const coeffs = ESTCN_NASA_COEFFS[this.gasType];
        if (!coeffs) return ESTCN_NASA_COEFFS.air.high.a;
        return (this.T < 1000) ? coeffs.low.a : coeffs.high.a;
    }
    
    // Calculate Cp/R from NASA polynomial
    _calcCpOverR() {
        const a = this._getNASACoeffs();
        const T = this.T;
        return a[0] + a[1]*T + a[2]*T*T + a[3]*T*T*T + a[4]*T*T*T*T;
    }
    
    // Calculate h/RT from NASA polynomial
    _calcHOverRT() {
        const a = this._getNASACoeffs();
        const T = this.T;
        const T2 = T * T;
        const T3 = T2 * T;
        const T4 = T3 * T;
        return a[0] + a[1]*T/2 + a[2]*T2/3 + a[3]*T3/4 + a[4]*T4/5 + a[5]/T;
    }
    
    // Calculate s°/R from NASA polynomial (standard state entropy)
    _calcSOverR() {
        const a = this._getNASACoeffs();
        const T = this.T;
        const T2 = T * T;
        const T3 = T2 * T;
        const T4 = T3 * T;
        return a[0]*Math.log(T) + a[1]*T + a[2]*T2/2 + a[3]*T3/3 + a[4]*T4/4 + a[6];
    }
    
    // Calculate viscosity using Sutherland's law
    _calcViscosity() {
        const params = ESTCN_SUTHERLAND[this.gasType] || ESTCN_SUTHERLAND.air;
        const { mu_ref, T_ref, S } = params;
        return mu_ref * Math.pow(this.T / T_ref, 1.5) * (T_ref + S) / (this.T + S);
    }
    
    // Update all derived properties from (p, T)
    _updateFromPT() {
        // Density from ideal gas law
        this.rho = this.p / (this.R * this.T);
        
        // ============================================
        // 200K 이하: 이상 기체 가정 (ESTCN 방식)
        // 상온(300K) 물성을 그대로 사용
        // ============================================
        if (this.T < 200) {
            // 이상 기체 물성 (상온 기준, ESTCN과 동일)
            if (this.gasType === 'air') {
                this.Cp = 1022.1;    // J/kg·K (상온 값)
                this.gam = 1.39053;  // 상온 값
            } else if (this.gasType === 'co2') {
                this.Cp = 846.0;     // J/kg·K (상온 값)
                this.gam = 1.289;    // 상온 값
            } else {
                this.Cp = 1022.1;
                this.gam = 1.39053;
            }
            
            this.Cv = this.Cp - this.R;
            
            // 이상 기체 엔탈피: h = Cp * T (기준점 0K)
            this.h = this.Cp * this.T;
            
            // Internal energy: e = h - R*T = Cv * T
            this.e = this.Cv * this.T;
            
            // 이상 기체 엔트로피: s = Cp*ln(T/T_ref) - R*ln(p/p_ref)
            // 200K에서의 엔트로피를 기준으로 연속성 유지
            const T_boundary = 200;
            const p_ref = 101325;
            
            // 200K에서의 NASA polynomial 엔트로피 계산
            const a = ESTCN_NASA_COEFFS[this.gasType].low.a;
            const T_b = T_boundary;
            const sOverR_200 = a[0]*Math.log(T_b) + a[1]*T_b + a[2]*T_b*T_b/2 + a[3]*T_b*T_b*T_b/3 + a[4]*T_b*T_b*T_b*T_b/4 + a[6];
            const s_200_at_pref = this.R * sOverR_200;
            
            // 200K 기준으로 이상 기체 엔트로피 계산
            this.s = s_200_at_pref + this.Cp * Math.log(this.T / T_boundary) - this.R * Math.log(this.p / p_ref);
            
            // Speed of sound
            this.a = Math.sqrt(this.gam * this.R * this.T);
            
            // Viscosity (Sutherland's law still works at low T)
            this.mu = this._calcViscosity();
            
            return;
        }
        
        // ============================================
        // 200K 이상: NASA polynomial 사용
        // ============================================
        
        // Cp from NASA polynomial
        const CpOverR = this._calcCpOverR();
        this.Cp = CpOverR * this.R;
        
        // Cv = Cp - R
        this.Cv = this.Cp - this.R;
        
        // gamma = Cp / Cv
        this.gam = this.Cp / this.Cv;
        
        // Enthalpy from NASA polynomial: h = (h/RT) * R * T
        const hOverRT = this._calcHOverRT();
        this.h = hOverRT * this.R * this.T;
        
        // Internal energy: e = h - p/rho = h - R*T
        this.e = this.h - this.R * this.T;
        
        // Entropy: s = R * (s°/R - ln(p/p_ref))
        const sOverR = this._calcSOverR();
        const p_ref = 101325;  // Reference pressure [Pa]
        this.s = this.R * (sOverR - Math.log(this.p / p_ref));
        
        // Speed of sound
        this.a = Math.sqrt(this.gam * this.R * this.T);
        
        // Viscosity
        this.mu = this._calcViscosity();
    }
    
    // Update all derived properties from (rho, T)
    _updateFromRhoT() {
        // Pressure from ideal gas law
        this.p = this.rho * this.R * this.T;
        
        // Rest is same as _updateFromPT
        const CpOverR = this._calcCpOverR();
        this.Cp = CpOverR * this.R;
        this.Cv = this.Cp - this.R;
        this.gam = this.Cp / this.Cv;
        
        const hOverRT = this._calcHOverRT();
        this.h = hOverRT * this.R * this.T;
        this.e = this.h - this.R * this.T;
        
        const sOverR = this._calcSOverR();
        const p_ref = 101325;
        this.s = this.R * (sOverR - Math.log(this.p / p_ref));
        
        this.a = Math.sqrt(this.gam * this.R * this.T);
        this.mu = this._calcViscosity();
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
     * Uses Newton-Raphson iteration to find T such that s(p, T) = s_target.
     * 
     * Note: For T < 200K, ideal gas assumption is used (ESTCN method).
     */
    set_ps(p, s_target) {
        this.p = p;
        
        // Initial guess: use current temperature
        let T = this.T;
        if (T < 50 || T > 10000) T = 300;
        
        const tol = 1e-6;
        const maxIter = 100;  // Increased for low temperature convergence
        
        for (let iter = 0; iter < maxIter; iter++) {
            this.T = T;
            this._updateFromPT();
            
            const s_calc = this.s;
            const error = s_calc - s_target;
            
            if (Math.abs(error / s_target) < tol) {
                return;  // Converged
            }
            
            // Numerical derivative ds/dT
            const dT = Math.max(T * 0.001, 0.1);  // Minimum step for low T
            this.T = T + dT;
            this._updateFromPT();
            const s_plus = this.s;
            const ds_dT = (s_plus - s_calc) / dT;
            
            if (Math.abs(ds_dT) < 1e-15) {
                console.warn('set_ps: ds_dT too small');
                break;
            }
            
            // Newton-Raphson update
            let T_new = T - error / ds_dT;
            
            // Limit step size to 50% of current value
            const delta = T_new - T;
            if (Math.abs(delta) > 0.5 * T) {
                T_new = T + Math.sign(delta) * 0.5 * T;
            }
            
            // Clamp to valid range (allow down to 50K for high Mach expansions)
            T_new = Math.max(50, Math.min(10000, T_new));
            T = T_new;
        }
        
        // Final update
        this.T = T;
        this._updateFromPT();
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
    
    if (H0 < h) {
        console.error('expand_from_stagnation: H0 < h, cannot expand');
        return [new_state, 0];
    }
    
    const V = Math.sqrt(2.0 * (H0 - h));
    
    return [new_state, V];
}

/**
 * Find throat condition (M = 1) by isentropic expansion from stagnation.
 * 
 * @param {GasState} state0 - Stagnation state (reservoir)
 * @returns {Object} {state6, V6, mflux6} - Throat state, velocity, mass flux
 */
function expansion_to_throat(state0) {
    // Find pressure ratio that gives M = 1
    function error_at_throat(x) {
        const [state, V] = expand_from_stagnation(x, state0);
        return (V / state.a) - 1.0;  // M - 1 = 0
    }
    
    // Secant method to find p6/p0
    let x1 = 0.6;  // Initial guess (ideal gas: p*/p0 ≈ 0.528 for gamma=1.4)
    let x2 = 0.5;
    
    let f1 = error_at_throat(x1);
    let f2 = error_at_throat(x2);
    
    for (let iter = 0; iter < 30; iter++) {
        if (Math.abs(f2) < 1e-6) break;
        
        const slope = (f2 - f1) / (x2 - x1);
        if (Math.abs(slope) < 1e-15) break;
        
        const x3 = x2 - f2 / slope;
        x1 = x2;
        f1 = f2;
        x2 = Math.max(0.01, Math.min(0.99, x3));
        f2 = error_at_throat(x2);
    }
    
    const [state6, V6] = expand_from_stagnation(x2, state0);
    const mflux6 = state6.rho * V6;  // Mass flux per unit area
    
    return { state6, V6, mflux6, p_ratio: x2 };
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
    const H0 = state0.h;  // Stagnation enthalpy
    
    // Find pressure ratio that gives correct mass flux
    function error_in_mass_flux(p_ratio) {
        const [state, V] = expand_from_stagnation(p_ratio, state0);
        const mflux = state.rho * V * area_ratio;
        return (mflux - mflux_throat) / mflux_throat;
    }
    
    // Secant method - start from low pressure (supersonic branch)
    let x1 = 0.01;
    let x2 = 0.02;
    
    let f1 = error_in_mass_flux(x1);
    let f2 = error_in_mass_flux(x2);
    
    for (let iter = 0; iter < 50; iter++) {
        if (Math.abs(f2) < 1e-6) break;
        
        const slope = (f2 - f1) / (x2 - x1);
        if (Math.abs(slope) < 1e-15) break;
        
        const x3 = x2 - f2 / slope;
        x1 = x2;
        f1 = f2;
        x2 = Math.max(1e-6, Math.min(0.5, x3));  // Stay on supersonic branch
        f2 = error_in_mass_flux(x2);
    }
    
    const [state7, V7] = expand_from_stagnation(x2, state0);
    
    return { state7, V7, p_ratio: x2 };
}

/**
 * Isentropic expansion to a given Mach number.
 * 
 * @param {GasState} state0 - Stagnation state (reservoir)
 * @param {number} M_target - Target Mach number
 * @returns {Object} {state7, V7} - Exit state and velocity
 */
function expansion_to_mach(state0, M_target) {
    // Find pressure ratio that gives target Mach number
    function error_in_mach(p_ratio) {
        const [state, V] = expand_from_stagnation(p_ratio, state0);
        const M = V / state.a;
        return M - M_target;
    }
    
    // Initial guess from ideal gas relation
    const gam = state0.gam;
    const p_ratio_ideal = Math.pow(1 + (gam - 1) / 2 * M_target * M_target, -gam / (gam - 1));
    
    // Secant method
    let x1 = p_ratio_ideal * 0.9;
    let x2 = p_ratio_ideal * 1.1;
    
    let f1 = error_in_mach(x1);
    let f2 = error_in_mach(x2);
    
    for (let iter = 0; iter < 30; iter++) {
        if (Math.abs(f2) < 1e-6) break;
        
        const slope = (f2 - f1) / (x2 - x1);
        if (Math.abs(slope) < 1e-15) break;
        
        const x3 = x2 - f2 / slope;
        x1 = x2;
        f1 = f2;
        x2 = Math.max(1e-8, Math.min(0.99, x3));
        f2 = error_in_mach(x2);
    }
    
    const [state7, V7] = expand_from_stagnation(x2, state0);
    
    return { state7, V7, p_ratio: x2 };
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
    let state5s = state5;
    let V5s = 0;
    
    if (pe && pe !== state5.p) {
        console.log('Start calculation of isentropic relaxation.');
        state5s = state5.clone();
        
        // Isentropic expansion from state5 to pe
        // State 5 is stagnation (u = 0), so we use expand_from_stagnation
        const p_ratio = pe / state5.p;
        const [expanded_state, V_expanded] = expand_from_stagnation(p_ratio, state5);
        
        state5s = expanded_state;
        V5s = V_expanded;
        
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
    
    // Calculate pitot pressure (for reference)
    // Pitot = p * (1 + (gamma-1)/2 * M^2)^(gamma/(gamma-1)) for subsonic
    // For supersonic, need to account for normal shock
    let pitot7;
    if (M7_calc > 1) {
        // Rayleigh pitot formula for supersonic flow
        const g = state7.gam;
        const M = M7_calc;
        const term1 = Math.pow((g + 1) * M * M / 2, g / (g - 1));
        const term2 = Math.pow((2 * g * M * M - (g - 1)) / (g + 1), 1 / (1 - g));
        pitot7 = state7.p * term1 * term2;
    } else {
        const g = state7.gam;
        const M = M7_calc;
        pitot7 = state7.p * Math.pow(1 + (g - 1) / 2 * M * M, g / (g - 1));
    }
    
    console.log('State 7: Nozzle-exit condition');
    state7.write_state();
    console.log(`  V7: ${V7.toFixed(2)} m/s, M7: ${M7_calc.toFixed(5)}, mflux7: ${mflux7.toFixed(1)} kg/s/m²`);
    console.log(`  pitot: ${pitot7.toExponential(5)} Pa, pitot7_on_p5s: ${(pitot7 / state5s.p).toFixed(6)}`);
    console.log('');
    
    console.log('Done with reflected shock tube calculation.');
    console.log('='.repeat(60));
    
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
        reflected_shock_speed: Vr
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
    window.calcReynoldsUnit = calcReynoldsUnit;
    window.calcTotalEnthalpy = calcTotalEnthalpy;
}
