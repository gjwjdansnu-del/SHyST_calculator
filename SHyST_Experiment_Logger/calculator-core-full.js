// ============================================
// APL Shock Tunnel Calculator - JavaScript
// 해석해 계산 + 시뮬레이션 연동 + 노즐 팽창 (State 7)
// ============================================

// 물성치 정의
const R_universal = 8314.51; // 일반 기체 상수 [J/kmol·K]

// 서덜랜드 법칙 상수
const SUTHERLAND = {
    air: { mu_ref: 1.716e-5, T_ref: 273.15, S: 110.4 },
    co2: { mu_ref: 1.370e-5, T_ref: 273.15, S: 222.0 },
    n2:  { mu_ref: 1.663e-5, T_ref: 273.15, S: 107.0 },
    ar:  { mu_ref: 2.125e-5, T_ref: 273.15, S: 144.4 },
    he:  { mu_ref: 1.865e-5, T_ref: 273.15, S: 79.4 },
    h2:  { mu_ref: 8.411e-6, T_ref: 273.15, S: 72.0 }
};

// 서덜랜드 법칙으로 점성계수 계산
function calcViscosity(T, gasType) {
    const params = SUTHERLAND[gasType] || SUTHERLAND.air;
    const { mu_ref, T_ref, S } = params;
    return mu_ref * Math.pow(T / T_ref, 1.5) * (T_ref + S) / (T + S);
}

// 가스 데이터 (기준 gamma는 300K 기준)
const GAS_DATA = {
    air:  { mw: 28.9660, gamma: 1.4020, name: 'Air' },
    he:   { mw: 4.0026,  gamma: 1.6670, name: 'Helium' },
    h2:   { mw: 2.0160,  gamma: 1.4050, name: 'Hydrogen' },
    co2:  { mw: 44.0100, gamma: 1.2970, name: 'CO₂' },
    ar:   { mw: 39.9480, gamma: 1.6670, name: 'Argon' },
    n2:   { mw: 28.0134, gamma: 1.4000, name: 'Nitrogen' }
};

// NASA 7-coefficient polynomial 계수
// cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4
// h/RT = a1 + a2*T/2 + a3*T^2/3 + a4*T^3/4 + a5*T^4/5 + a6/T
// s/R = a1*ln(T) + a2*T + a3*T^2/2 + a4*T^3/3 + a5*T^4/4 + a7

const NASA_COEFFS = {
    // N2 (질소) - NASA Glenn coefficients
    n2: {
        low: {  // 200-1000K
            Tmin: 200, Tmax: 1000,
            a: [3.298677e0, 1.408240e-3, -3.963222e-6, 5.641515e-9, -2.444855e-12, -1.020900e3, 3.950372e0]
        },
        high: { // 1000-6000K
            Tmin: 1000, Tmax: 6000,
            a: [2.926640e0, 1.487977e-3, -5.684761e-7, 1.009704e-10, -6.753351e-15, -9.227977e2, 5.980528e0]
        }
    },
    
    // O2 (산소)
    o2: {
        low: {  // 200-1000K
            Tmin: 200, Tmax: 1000,
            a: [3.782456e0, -2.996734e-3, 9.847302e-6, -9.681295e-9, 3.243728e-12, -1.063944e3, 3.657676e0]
        },
        high: { // 1000-6000K
            Tmin: 1000, Tmax: 6000,
            a: [3.660960e0, 6.563658e-4, -1.411496e-7, 2.057979e-11, -1.299134e-15, -1.215977e3, 3.415362e0]
        }
    },
    
    // Air (실제로는 N2를 사용 - Air의 주성분)
    air: {
        low: {  // 200-1000K
            Tmin: 200, Tmax: 1000,
            a: [3.298677e0, 1.408240e-3, -3.963222e-6, 5.641515e-9, -2.444855e-12, -1.020900e3, 3.950372e0]
        },
        high: { // 1000-6000K
            Tmin: 1000, Tmax: 6000,
            a: [2.926640e0, 1.487977e-3, -5.684761e-7, 1.009704e-10, -6.753351e-15, -9.227977e2, 5.980528e0]
        }
    },
    
    // He (헬륨 - 단원자)
    he: {
        low: {  // 200-6000K (단원자는 온도 무관)
            Tmin: 200, Tmax: 6000,
            a: [2.5, 0, 0, 0, 0, -7.453750e2, 9.287239e-1]
        },
        high: {
            Tmin: 200, Tmax: 6000,
            a: [2.5, 0, 0, 0, 0, -7.453750e2, 9.287239e-1]
        }
    },
    
    // Ar (아르곤 - 단원자)
    ar: {
        low: {
            Tmin: 200, Tmax: 6000,
            a: [2.5, 0, 0, 0, 0, -7.453750e2, 4.379674e0]
        },
        high: {
            Tmin: 200, Tmax: 6000,
            a: [2.5, 0, 0, 0, 0, -7.453750e2, 4.379674e0]
        }
    },
    
    // H2 (수소)
    h2: {
        low: {  // 200-1000K
            Tmin: 200, Tmax: 1000,
            a: [2.344331e0, 7.980521e-3, -1.947815e-5, 2.015721e-8, -7.376117e-12, -9.179351e2, 6.830102e-1]
        },
        high: { // 1000-6000K
            Tmin: 1000, Tmax: 6000,
            a: [2.932865e0, 8.266079e-4, -1.464023e-7, 1.541003e-11, -6.888048e-16, -8.130656e2, -1.024328e0]
        }
    },
    
    // CO2 (이산화탄소)
    co2: {
        low: {  // 200-1000K
            Tmin: 200, Tmax: 1000,
            a: [2.356773e0, 8.984596e-3, -7.123562e-6, 2.459190e-9, -1.436995e-13, -4.837197e4, 9.901052e0]
        },
        high: { // 1000-6000K
            Tmin: 1000, Tmax: 6000,
            a: [4.636594e0, 2.741319e-3, -9.958285e-7, 1.603730e-10, -9.161034e-15, -4.902493e4, -1.935348e0]
        }
    }
};

// NASA 다항식으로 cp/R 계산
function calcCpOverR_NASA(T, gasType) {
    const coeffs = NASA_COEFFS[gasType];
    if (!coeffs) return null;
    
    // 온도 범위에 따라 계수 선택
    const a = (T < 1000) ? coeffs.low.a : coeffs.high.a;
    
    // cp/R = a1 + a2*T + a3*T^2 + a4*T^3 + a5*T^4
    const T2 = T * T;
    const T3 = T2 * T;
    const T4 = T3 * T;
    
    const cpOverR = a[0] + a[1]*T + a[2]*T2 + a[3]*T3 + a[4]*T4;
    
    // 디버깅: 이상한 값 체크
    if (T > 1500 && (cpOverR < 3 || cpOverR > 6)) {
        console.warn(`Unusual cpOverR for ${gasType} at ${T}K: ${cpOverR}`);
        console.log('Coefficients:', a);
        console.log('Terms:', a[0], a[1]*T, a[2]*T2, a[3]*T3, a[4]*T4);
    }
    
    return cpOverR;
}

// NASA 다항식으로 h/RT 계산 (무차원 엔탈피)
function calcHOverRT_NASA(T, gasType) {
    const coeffs = NASA_COEFFS[gasType];
    if (!coeffs) return null;
    
    const a = (T < 1000) ? coeffs.low.a : coeffs.high.a;
    
    // h/RT = a1 + a2*T/2 + a3*T^2/3 + a4*T^3/4 + a5*T^4/5 + a6/T
    const T2 = T * T;
    const T3 = T2 * T;
    const T4 = T3 * T;
    
    return a[0] + a[1]*T/2 + a[2]*T2/3 + a[3]*T3/4 + a[4]*T4/5 + a[5]/T;
}

// NASA 다항식으로 s°/R 계산 (무차원 엔트로피, 표준 상태)
function calcSOverR_NASA(T, gasType) {
    const normalizedType = (gasType || '').toString().toLowerCase().trim();
    let gasKey = 'air';
    
    if (normalizedType.includes('air')) {
        gasKey = 'air';
    } else if (normalizedType.includes('co2') || normalizedType.includes('co₂')) {
        gasKey = 'co2';
    }
    
    const coeffs = NASA_COEFFS[gasKey];
    if (!coeffs) return null;
    
    const a = (T < 1000) ? coeffs.low.a : coeffs.high.a;
    
    // s°/R = a1*ln(T) + a2*T + a3*T²/2 + a4*T³/3 + a5*T⁴/4 + a7
    const T2 = T * T;
    const T3 = T2 * T;
    const T4 = T3 * T;
    
    return a[0]*Math.log(T) + a[1]*T + a[2]*T2/2 + a[3]*T3/3 + a[4]*T4/4 + a[6];
}

// 엔트로피 계산 [J/kg·K] (NASA 다항식)
function calcEntropy(T, p, gasType, mw, p_ref = 101325) {
    const normalizedType = (gasType || '').toString().toLowerCase().trim();
    let gasKey = 'air';
    
    if (normalizedType.includes('air')) {
        gasKey = 'air';
    } else if (normalizedType.includes('co2') || normalizedType.includes('co₂')) {
        gasKey = 'co2';
    }
    
    const R_specific = R_universal / mw;
    const sOverR = calcSOverR_NASA(T, gasKey);
    
    if (sOverR === null || !isFinite(sOverR)) {
        // NASA 계수가 없으면 간단한 근사
        const cp = calcCpFromT(T, gasType, mw);
        return cp * Math.log(T) - R_specific * Math.log(p / p_ref);
    }
    
    // s(T, p) = R × s°(T) - R × ln(p/p_ref)
    return R_specific * (sOverR - Math.log(p / p_ref));
}

// 엔탈피로부터 온도 역산 (Newton-Raphson)
function calcTFromH(h_target, gasType, mw, T_guess = 300, X_He = null) {
    const isMix = X_He !== null;
    let T = T_guess;
    const tol = 1e-6;
    const maxIter = 20;
    
    for (let iter = 0; iter < maxIter; iter++) {
        const h = isMix ? calcEnthalpy_mix(T, X_He, mw) : calcEnthalpy(T, gasType, mw);
        const error = h - h_target;
        
        if (Math.abs(error / h_target) < tol) {
            return T;
        }
        
        // 수치 미분
        const delta = 1e-3;
        const h_plus = isMix ? calcEnthalpy_mix(T + delta, X_He, mw) : calcEnthalpy(T + delta, gasType, mw);
        const dh_dT = (h_plus - h) / delta;
        
        if (Math.abs(dh_dT) < 1e-10) {
            console.warn('calcTFromH: dh_dT too small');
            break;
        }
        
        T = T - error / dh_dT;
        
        // 온도 범위 제한
        T = Math.max(200, Math.min(6000, T));
    }
    
    return T;
}

// 온도에 따른 cp 계산 [J/kg·K] (NASA 다항식)
function calcCpFromT(T, gasType, mw) {
    // 대소문자 무시 및 공백 제거
    const normalizedType = (gasType || '').toString().toLowerCase().trim();
    let gasKey = 'air'; // 기본값
    
    if (normalizedType.includes('air')) {
        gasKey = 'air';
    } else if (normalizedType.includes('co2') || normalizedType.includes('co₂')) {
        gasKey = 'co2';
    }
    
    const R_specific = R_universal / mw;  // J/kg·K
    const cpOverR = calcCpOverR_NASA(T, gasKey);
    
    if (cpOverR === null || !isFinite(cpOverR) || cpOverR <= 1) {
        // NASA 계수가 없거나 이상한 값이면 기본값
        const gamma = GAS_DATA[gasKey] ? GAS_DATA[gasKey].gamma : 1.4;
        return gamma / (gamma - 1) * R_specific;
    }
    
    const cp = cpOverR * R_specific;
    if (!isFinite(cp)) {
        const gamma = GAS_DATA[gasKey] ? GAS_DATA[gasKey].gamma : 1.4;
        return gamma / (gamma - 1) * R_specific;
    }
    
    return cp;
}

// 온도에 따른 gamma 계산 (NASA 다항식 기반)
function calcGammaFromT(T, gasType) {
    // 대소문자 무시 및 공백 제거
    const normalizedType = (gasType || '').toString().toLowerCase().trim();
    let gasKey = 'air'; // 기본값
    
    if (normalizedType.includes('air')) {
        gasKey = 'air';
    } else if (normalizedType.includes('co2') || normalizedType.includes('co₂')) {
        gasKey = 'co2';
    }
    
    const cpOverR = calcCpOverR_NASA(T, gasKey);
    
    if (cpOverR === null || !isFinite(cpOverR) || cpOverR <= 1) {
        return GAS_DATA[gasKey] ? GAS_DATA[gasKey].gamma : 1.4;
    }
    
    // gamma = cp/cv = cp/(cp - R) = cpOverR / (cpOverR - 1)
    const gamma = cpOverR / (cpOverR - 1);
    
    if (!isFinite(gamma) || gamma < 1 || gamma > 2) {
        return GAS_DATA[gasKey] ? GAS_DATA[gasKey].gamma : 1.4;
    }
    
    return gamma;
}

// 온도에 따른 cv 계산 [J/kg·K]
function calcCvFromT(T, gasType, mw) {
    const cp = calcCpFromT(T, gasType, mw);
    const R_specific = R_universal / mw;
    return cp - R_specific;
}

// 엔탈피 계산 [J/kg] (NASA 다항식)
function calcEnthalpy(T, gasType, mw) {
    const R_specific = R_universal / mw;
    const hOverRT = calcHOverRT_NASA(T, gasType);
    
    if (hOverRT === null || !isFinite(hOverRT)) {
        // NASA 계수가 없으면 간단한 근사
        const cp = calcCpFromT(T, gasType, mw);
        if (!isFinite(cp)) {
            console.error('Invalid cp for', gasType, T);
            return 0;
        }
        return cp * T;
    }
    
    const h = hOverRT * R_specific * T;
    if (!isFinite(h)) {
        console.error('Invalid enthalpy for', gasType, T, hOverRT);
        return calcCpFromT(T, gasType, mw) * T;
    }
    
    return h;
}


// Air/He 혼합가스 물성치 계산 (기준 온도 300K)
// 주의: 혼합 가스는 온도 의존성이 복잡하므로 기준 gamma 반환
// 실제 계산에서는 calcGammaFromT_mix 사용
function calcMixtureProperties(X_He) {
    const X_Air = 1 - X_He;
    const gas1 = GAS_DATA.air;
    const gas2 = GAS_DATA.he;
    
    // 혼합 분자량
    const mw_mix = X_He * gas2.mw + X_Air * gas1.mw;
    
    // 질량 분율
    const Y_He = (X_He * gas2.mw) / mw_mix;
    const Y_Air = 1 - Y_He;
    
    // 개별 기체상수
    const R_Air = R_universal / gas1.mw;
    const R_He = R_universal / gas2.mw;
    
    // 개별 비열 (300K 기준)
    const cp_Air = gas1.gamma / (gas1.gamma - 1) * R_Air;
    const cp_He = gas2.gamma / (gas2.gamma - 1) * R_He;
    const cv_Air = R_Air / (gas1.gamma - 1);
    const cv_He = R_He / (gas2.gamma - 1);
    
    // 혼합 비열
    const cp_mix = Y_Air * cp_Air + Y_He * cp_He;
    const cv_mix = Y_Air * cv_Air + Y_He * cv_He;
    
    // 혼합 비열비 (기준값)
    const gamma_mix = cp_mix / cv_mix;
    
    return { 
        mw: mw_mix, 
        gamma: gamma_mix, 
        name: `Air/He (He ${(X_He * 100).toFixed(2)}%)`,
        X_He: X_He  // 혼합 비율 저장
    };
}

// 혼합 가스의 온도 의존 cp/R 계산 (NASA 다항식)
function calcCpOverR_mix(T, X_He) {
    const X_Air = 1 - X_He;
    
    // 몰분율 기준으로 혼합
    const cpOverR_Air = calcCpOverR_NASA(T, 'air');
    const cpOverR_He = calcCpOverR_NASA(T, 'he');
    
    if (cpOverR_Air === null || cpOverR_He === null) {
        return null;
    }
    
    const cpOverR_mix = X_Air * cpOverR_Air + X_He * cpOverR_He;
    
    if (!isFinite(cpOverR_mix) || cpOverR_mix <= 1) {
        console.error('Invalid cpOverR_mix:', cpOverR_mix, 'T:', T, 'X_He:', X_He);
        return null;
    }
    
    return cpOverR_mix;
}

// 혼합 가스의 온도 의존 gamma 계산 (NASA 다항식)
function calcGammaFromT_mix(T, X_He) {
    const cpOverR_mix = calcCpOverR_mix(T, X_He);
    
    if (cpOverR_mix === null || !isFinite(cpOverR_mix) || cpOverR_mix <= 1) {
        // 기본값 사용
        const X_Air = 1 - X_He;
        const gamma_Air = GAS_DATA.air.gamma;
        const gamma_He = GAS_DATA.he.gamma;
        
        // 간단한 혼합 (몰분율 기준)
        const mw_mix = X_He * GAS_DATA.he.mw + X_Air * GAS_DATA.air.mw;
        const Y_He = (X_He * GAS_DATA.he.mw) / mw_mix;
        const Y_Air = 1 - Y_He;
        
        const R_Air = R_universal / GAS_DATA.air.mw;
        const R_He = R_universal / GAS_DATA.he.mw;
        const cv_Air = R_Air / (gamma_Air - 1);
        const cv_He = R_He / (gamma_He - 1);
        const cv_mix = Y_Air * cv_Air + Y_He * cv_He;
        const R_mix = Y_Air * R_Air + Y_He * R_He;
        
        return (cv_mix + R_mix) / cv_mix;
    }
    
    // gamma = cp/cv = cp/(cp - R) = cpOverR / (cpOverR - 1)
    const gamma_mix = cpOverR_mix / (cpOverR_mix - 1);
    
    if (!isFinite(gamma_mix) || gamma_mix < 1 || gamma_mix > 2) {
        console.error('Invalid gamma_mix:', gamma_mix, 'cpOverR_mix:', cpOverR_mix);
        // 기본값으로 대체
        return 1.4;
    }
    
    return gamma_mix;
}

// 혼합 가스의 엔탈피 계산 (NASA 다항식)
function calcEnthalpy_mix(T, X_He, mw_mix) {
    const X_Air = 1 - X_He;
    const Y_He = (X_He * GAS_DATA.he.mw) / mw_mix;
    const Y_Air = 1 - Y_He;
    
    // 질량 분율 기준으로 혼합
    const h_Air = calcEnthalpy(T, 'air', GAS_DATA.air.mw);
    const h_He = calcEnthalpy(T, 'he', GAS_DATA.he.mw);
    
    if (!isFinite(h_Air) || !isFinite(h_He)) {
        console.error('Invalid enthalpy in mix:', h_Air, h_He, T);
        // 간단한 근사로 대체
        const R_mix = R_universal / mw_mix;
        const gamma_mix = calcGammaFromT_mix(T, X_He);
        const cp_mix = gamma_mix / (gamma_mix - 1) * R_mix;
        return cp_mix * T;
    }
    
    const h_mix = Y_Air * h_Air + Y_He * h_He;
    
    if (!isFinite(h_mix)) {
        console.error('Invalid mixed enthalpy:', h_mix);
        const R_mix = R_universal / mw_mix;
        const gamma_mix = calcGammaFromT_mix(T, X_He);
        const cp_mix = gamma_mix / (gamma_mix - 1) * R_mix;
        return cp_mix * T;
    }
    
    return h_mix;
}

// 혼합 가스의 cp 계산 [J/kg·K]
function calcCpFromT_mix(T, X_He, mw_mix) {
    const X_Air = 1 - X_He;
    const Y_He = (X_He * GAS_DATA.he.mw) / mw_mix;
    const Y_Air = 1 - Y_He;
    
    const cp_Air = calcCpFromT(T, 'air', GAS_DATA.air.mw);
    const cp_He = calcCpFromT(T, 'he', GAS_DATA.he.mw);
    
    return Y_Air * cp_Air + Y_He * cp_He;
}


// 가스 물성치 반환
function getGasProperties(gasType, X_He = 0.5) {
    // 대소문자 무시 및 공백 제거
    const normalizedType = (gasType || '').toString().toLowerCase().trim();
    
    // mix 타입 체크
    if (normalizedType === 'mix') {
        return calcMixtureProperties(X_He);
    }
    
    // Air 또는 CO2만 허용 (대소문자 무시)
    let gasKey = null;
    if (normalizedType.includes('air')) {
        gasKey = 'air';
    } else if (normalizedType.includes('co2') || normalizedType.includes('co₂')) {
        gasKey = 'co2';
    }
    
    if (!gasKey) {
        console.warn(`Unknown gas type: "${gasType}", defaulting to Air`);
        gasKey = 'air';
    }
    
    const gas = GAS_DATA[gasKey];
    return { mw: gas.mw, gamma: gas.gamma, name: gas.name };
}


// 마하수로부터 필요한 p4 계산
function calcP4FromMach(M, p1, t1, t4, drivenProps, driverProps) {
    const g1 = drivenProps.gamma;
    const mw1 = drivenProps.mw;
    const R1 = R_universal / mw1;
    
    const g4 = driverProps.gamma;
    const mw4 = driverProps.mw;
    const R4 = R_universal / mw4;
    
    const a1 = Math.sqrt(g1 * R1 * t1);
    const a4 = Math.sqrt(g4 * R4 * t4);
    
    const gp1 = g1 + 1;
    const gm4 = g4 - 1;
    
    const p2_p1 = 1 + (2 * g1 / gp1) * (M * M - 1);
    
    const term = 1 - (gm4 * (a1 / a4) * (p2_p1 - 1)) / Math.sqrt(2 * g1 * (2 * g1 + gp1 * (p2_p1 - 1)));
    
    if (term <= 0) return Infinity;
    
    const p4_p1 = p2_p1 * Math.pow(term, -2 * g4 / gm4);
    
    return p4_p1 * p1;
}


// 뉴턴-랩슨 방법으로 마하수 찾기
function findMachFromP4(targetP4, p1, t1, t4, drivenProps, driverProps, initialM = 3.0, tol = 1e-6, maxIter = 100) {
    let M = initialM;
    const dM = 0.001;
    let iterations = [];
    
    for (let i = 0; i < maxIter; i++) {
        const p4Calc = calcP4FromMach(M, p1, t1, t4, drivenProps, driverProps);
        const error = p4Calc - targetP4;
        const relError = Math.abs(error / targetP4);
        
        iterations.push({
            iter: i + 1,
            M: M,
            p4: p4Calc,
            error: relError
        });
        
        if (relError < tol) {
            return { M: M, converged: true, iterations: iterations };
        }
        
        const p4Plus = calcP4FromMach(M + dM, p1, t1, t4, drivenProps, driverProps);
        const dp4_dM = (p4Plus - p4Calc) / dM;
        
        if (Math.abs(dp4_dM) < 1e-10) {
            break;
        }
        
        let M_new = M - error / dp4_dM;
        M = Math.max(1.01, Math.min(20, M_new));
    }
    
    return { M: M, converged: false, iterations: iterations };
}


// State 7 (노즐 팽창 후 상태) 계산 - 등엔트로피 과정 (보존 법칙 기반)
function calcState7(state5, M7, drivenProps, drivenGas) {
    const isMix = drivenProps.X_He !== undefined;
    const mw = drivenProps.mw;
    const R = R_universal / mw;
    
    // State 5가 정체 상태 (u5 = 0)
    const T0 = state5.t;  // 토탈 온도
    const P0 = state5.p;  // 토탈 압력
    const s0 = state5.s;  // 엔트로피
    
    // 토탈 엔탈피 (정체 상태)
    const h0_total = isMix ? calcEnthalpy_mix(T0, drivenProps.X_He, mw) : calcEnthalpy(T0, drivenGas, mw);
    
    // 초기 추정 (일정 gamma 가정)
    const g5 = isMix ? calcGammaFromT_mix(T0, drivenProps.X_He) : calcGammaFromT(T0, drivenGas);
    let T7 = T0 / (1 + (g5 - 1) / 2 * M7 * M7);
    
    // 반복 계산 (토탈 엔탈피 보존)
    for (let iter = 0; iter < 10; iter++) {
        const g7 = isMix ? calcGammaFromT_mix(T7, drivenProps.X_He) : calcGammaFromT(T7, drivenGas);
        const a7 = Math.sqrt(g7 * R * T7);
        const u7 = M7 * a7;
        
        // 토탈 엔탈피 보존: h0_total = h7 + 0.5 * u7^2
        const h7_static_target = h0_total - 0.5 * u7 * u7;
        
        if (h7_static_target <= 0) {
            console.error('Invalid h7_static_target:', h7_static_target, 'h0_total:', h0_total, 'u7:', u7);
            break;
        }
        
        // h로부터 T 역산
        const T7_new = calcTFromH(h7_static_target, drivenGas, mw, T7, isMix ? drivenProps.X_He : null);
        
        if (!isFinite(T7_new) || T7_new <= 0 || T7_new > T0) {
            console.error('Invalid T7_new:', T7_new);
            break;
        }
        
        if (Math.abs(T7_new - T7) / T7 < 1e-6) {
            T7 = T7_new;
            break;
        }
        
        T7 = 0.5 * (T7 + T7_new); // 완화
    }
    
    // 최종 물성치
    const g7 = isMix ? calcGammaFromT_mix(T7, drivenProps.X_He) : calcGammaFromT(T7, drivenGas);
    
    if (!isFinite(g7) || g7 < 1 || g7 > 2) {
        console.error('Invalid g7:', g7, 'T7:', T7);
        return null;
    }
    
    const a7 = Math.sqrt(g7 * R * T7);
    const u7 = M7 * a7;
    
    // 엔트로피 보존으로 압력 계산: s(T7, P7) = s0
    // s0 = s7 → P7 계산
    let P7 = P0 * Math.pow(T7 / T0, g7 / (g7 - 1));  // 초기 추정
    
    for (let iter = 0; iter < 10; iter++) {
        const normalizedType = (drivenGas || '').toString().toLowerCase().trim();
        const gasKey = normalizedType.includes('co2') ? 'co2' : 'air';
        const s7_calc = calcEntropy(T7, P7, gasKey, mw);
        const error = s7_calc - s0;
        
        if (Math.abs(error / s0) < 1e-8) break;
        
        // 수치 미분
        const delta = P7 * 1e-6;
        const s7_plus = calcEntropy(T7, P7 + delta, gasKey, mw);
        const ds_dP = (s7_plus - s7_calc) / delta;
        
        if (Math.abs(ds_dP) > 1e-15) {
            P7 = P7 - error / ds_dP;
            P7 = Math.max(1, Math.min(P0, P7));
        }
    }
    
    if (!isFinite(P7) || P7 <= 0) {
        console.error('Invalid P7:', P7);
        return null;
    }
    
    const rho7 = P7 / (R * T7);
    const cp7 = isMix ? calcCpFromT_mix(T7, drivenProps.X_He, mw) : calcCpFromT(T7, drivenGas, mw);
    const h7_static = cp7 * T7;
    const h7_total = h7_static + 0.5 * u7 * u7;
    const normalizedType = (drivenGas || '').toString().toLowerCase().trim();
    const gasKey = normalizedType.includes('co2') ? 'co2' : 'air';
    const s7 = calcEntropy(T7, P7, gasKey, mw);
    
    // 점성계수 (서덜랜드 법칙)
    const mu = calcViscosity(T7, drivenGas);
    
    if (!isFinite(mu) || mu <= 0) {
        console.error('Invalid mu:', mu);
        return null;
    }
    
    // 단위 레이놀즈수 [1/m] = ρ * u / μ
    const Re_unit = rho7 * u7 / mu;
    const Re_unit_e6 = Re_unit / 1e6;  // ×10^6/m 단위
    
    return {
        M: M7,
        p: P7,
        t: T7,
        rho: rho7,
        a: a7,
        u: u7,
        h: h7_static,
        h_total: h7_total / 1e6,  // MJ/kg
        s: s7,
        R: R,
        gamma: g7,
        cp: cp7,
        V: u7,
        mu: mu,
        Re_unit: Re_unit_e6  // 10^6/m
    };
}

// 충격파 튜브 전 상태 계산 (온도 의존 gamma 적용)
function calcShockTube(M, p1, t1, p4, t4, drivenProps, driverProps, drivenGas = 'air', driverGas = 'air') {
    // 혼합 가스 여부 확인
    const isDrivenMix = drivenProps.X_He !== undefined;
    const isDriverMix = driverProps.X_He !== undefined;
    
    // 드리븐 가스 물성치 (State 1 기준)
    const g1 = isDrivenMix ? calcGammaFromT_mix(t1, drivenProps.X_He) : calcGammaFromT(t1, drivenGas);
    const mw1 = drivenProps.mw;
    const R1 = R_universal / mw1;
    
    // 드라이버 가스 물성치 (State 4 기준)
    const g4 = isDriverMix ? calcGammaFromT_mix(t4, driverProps.X_He) : calcGammaFromT(t4, driverGas);
    const mw4 = driverProps.mw;
    const R4 = R_universal / mw4;
    
    // State 1: Driven 섹션 초기 상태
    const a1 = Math.sqrt(g1 * R1 * t1);
    const rho1 = p1 / (R1 * t1);
    const u1 = 0;
    
    // 충격파 속도
    const W = M * a1;
    
    // State 2: 충격파 직후 (반복 계산으로 온도 의존 gamma 고려)
    const state2 = calcIncidentShock(M, p1, t1, drivenGas, mw1, R1, isDrivenMix ? drivenProps.X_He : null);
    const { p: p2, t: t2, rho: rho2, u: u2 } = state2;
    const g2 = isDrivenMix ? calcGammaFromT_mix(t2, drivenProps.X_He) : calcGammaFromT(t2, drivenGas);
    const a2 = Math.sqrt(g2 * R1 * t2);
    
    // State 3: 접촉면
    const p3 = p2;
    const u3 = u2;
    
    // State 4: Driver 섹션 초기 상태
    const a4 = Math.sqrt(g4 * R4 * t4);
    const rho4 = p4 / (R4 * t4);
    const u4 = 0;
    
    // State 3 계속 (등엔트로피 팽창, 평균 gamma 사용)
    const p3_p4 = p3 / p4;
    // 반복적으로 t3 계산
    let t3 = t4 * Math.pow(p3_p4, (g4 - 1) / g4); // 초기 추정
    for (let iter = 0; iter < 5; iter++) {
        const g3 = isDriverMix ? calcGammaFromT_mix(t3, driverProps.X_He) : calcGammaFromT(t3, driverGas);
        t3 = t4 * Math.pow(p3_p4, (g3 - 1) / g3);
    }
    const g3 = isDriverMix ? calcGammaFromT_mix(t3, driverProps.X_He) : calcGammaFromT(t3, driverGas);
    const rho3 = rho4 * Math.pow(p3_p4, 1 / g3);
    const a3 = Math.sqrt(g3 * R4 * t3);
    
    // State 5: 반사 충격파 후 (온도 의존 gamma 고려)
    const p2_p1 = p2 / p1;
    const state5 = calcReflectedShock(p2, t2, rho2, u2, p2_p1, drivenGas, mw1, R1, isDrivenMix ? drivenProps.X_He : null);
    const { p: p5, t: t5, rho: rho5 } = state5;
    const g5 = isDrivenMix ? calcGammaFromT_mix(t5, drivenProps.X_He) : calcGammaFromT(t5, drivenGas);
    const a5 = Math.sqrt(g5 * R1 * t5);
    const u5 = 0;
    
    // 반사 충격파 마하수 (State 2 기준)
    const M_R = (W - u2) / a2; // 반사 충격파는 State 2 기준으로 역방향
    
    // 각 State의 gamma와 cp 계산
    const cp1 = isDrivenMix ? calcCpFromT_mix(t1, drivenProps.X_He, mw1) : calcCpFromT(t1, drivenGas, mw1);
    const cp2 = isDrivenMix ? calcCpFromT_mix(t2, drivenProps.X_He, mw1) : calcCpFromT(t2, drivenGas, mw1);
    const cp3 = isDriverMix ? calcCpFromT_mix(t3, driverProps.X_He, mw4) : calcCpFromT(t3, driverGas, mw4);
    const cp4 = isDriverMix ? calcCpFromT_mix(t4, driverProps.X_He, mw4) : calcCpFromT(t4, driverGas, mw4);
    const cp5 = isDrivenMix ? calcCpFromT_mix(t5, drivenProps.X_He, mw1) : calcCpFromT(t5, drivenGas, mw1);
    
    return {
        state1: { p: p1, t: t1, rho: rho1, a: a1, u: u1, gamma: g1, cp: cp1 },
        state2: { p: p2, t: t2, rho: rho2, a: a2, u: u2, gamma: g2, cp: cp2 },
        state3: { p: p3, t: t3, rho: rho3, a: a3, u: u3, gamma: g3, cp: cp3 },
        state4: { p: p4, t: t4, rho: rho4, a: a4, u: u4, gamma: g4, cp: cp4 },
        state5: { p: p5, t: t5, rho: rho5, a: a5, u: u5, gamma: g5, cp: cp5 },
        shock: { mach: M, W: W, M_R: M_R }
    };
}

// 입사 충격파 계산 (보존 법칙 기반, 밀도비 η 반복)
function calcIncidentShock(M, p1, t1, gasType, mw, R, X_He = null) {
    const isMix = X_He !== null;
    const g1 = isMix ? calcGammaFromT_mix(t1, X_He) : calcGammaFromT(t1, gasType);
    const rho1 = p1 / (R * t1);
    const a1 = Math.sqrt(g1 * R * t1);
    const W = M * a1;  // 충격파 속도
    
    const h1 = isMix ? calcEnthalpy_mix(t1, X_He, mw) : calcEnthalpy(t1, gasType, mw);
    
    // 초기 추정 (Ideal Gas)
    const gp1 = g1 + 1;
    const gm1 = g1 - 1;
    const p2_ideal = p1 * (1 + (2 * g1 / gp1) * (M * M - 1));
    const rho2_rho1_ideal = (1 + (gp1 / gm1) * (p2_ideal / p1)) / (gp1 / gm1 + p2_ideal / p1);
    
    let eta = rho2_rho1_ideal;  // 밀도비 η = ρ₂/ρ₁
    
    const tol = 1e-8;
    const maxIter = 20;
    
    for (let iter = 0; iter < maxIter; iter++) {
        // 질량 보존: u₂ = W × (1 - 1/η)
        const u2 = W * (1 - 1/eta);
        
        // 운동량 보존: p₂ = p₁ + ρ₁ × W² × (1 - 1/η)
        const p2 = p1 + rho1 * W * W * (1 - 1/eta);
        
        // 에너지 보존: h₂ = h₁ + 0.5×W² - 0.5×(W-u₂)²
        const h2_needed = h1 + 0.5 * W * W - 0.5 * (W - u2) * (W - u2);
        
        // h₂로부터 T₂ 역산
        const t2 = calcTFromH(h2_needed, gasType, mw, t1 * 1.5, X_He);
        
        // 상태 방정식: ρ₂ = p₂ / (R × T₂)
        const rho2_calc = p2 / (R * t2);
        const eta_calc = rho2_calc / rho1;
        
        // 오차 계산
        const error = eta - eta_calc;
        
        if (Math.abs(error / eta) < tol) {
            // 수렴
            return { p: p2, t: t2, rho: rho2_calc, u: u2 };
        }
        
        // 수치 미분 (Jacobian)
        const delta = eta * 1e-6;
        const eta_plus = eta + delta;
        const u2_plus = W * (1 - 1/eta_plus);
        const p2_plus = p1 + rho1 * W * W * (1 - 1/eta_plus);
        const h2_plus = h1 + 0.5 * W * W - 0.5 * (W - u2_plus) * (W - u2_plus);
        const t2_plus = calcTFromH(h2_plus, gasType, mw, t2, X_He);
        const rho2_plus = p2_plus / (R * t2_plus);
        const eta_calc_plus = rho2_plus / rho1;
        const error_plus = eta_plus - eta_calc_plus;
        
        const derivative = (error_plus - error) / delta;
        
        if (Math.abs(derivative) < 1e-15) {
            console.warn('calcIncidentShock: derivative too small');
            break;
        }
        
        // Newton-Raphson 업데이트
        eta = eta - error / derivative;
        
        // 물리적 범위 제한 (ρ₂/ρ₁ > 1)
        eta = Math.max(1.01, Math.min(20, eta));
    }
    
    // 수렴 실패 시 마지막 값 반환
    const u2 = W * (1 - 1/eta);
    const p2 = p1 + rho1 * W * W * (1 - 1/eta);
    const h2_needed = h1 + 0.5 * W * W - 0.5 * (W - u2) * (W - u2);
    const t2 = calcTFromH(h2_needed, gasType, mw, t1 * 1.5, X_He);
    const rho2 = p2 / (R * t2);
    
    return { p: p2, t: t2, rho: rho2, u: u2 };
}

// 반사 충격파 계산 (보존 법칙 기반, 충격파 속도 W_R 반복)
// State 2 → State 5 (u5 = 0, 벽면 조건)
function calcReflectedShock(p2, t2, rho2, u2, p2_p1, gasType, mw, R, X_He = null) {
    const isMix = X_He !== null;
    const g2 = isMix ? calcGammaFromT_mix(t2, X_He) : calcGammaFromT(t2, gasType);
    const h2 = isMix ? calcEnthalpy_mix(t2, X_He, mw) : calcEnthalpy(t2, gasType, mw);
    
    // 초기 추정 (Ideal Gas)
    const gp2 = g2 + 1;
    const gm2 = g2 - 1;
    const p5_p2_ideal = ((3 * g2 - 1) * p2_p1 - gm2) / (gm2 * p2_p1 + gp2);
    const p5_ideal = p5_p2_ideal * p2;
    const t5_ideal = t2 * p5_p2_ideal * ((gp2 / gm2 + p5_p2_ideal) / (1 + gp2 / gm2 * p5_p2_ideal));
    
    // W_R 초기 추정 (반사 충격파 속도, State 2 기준)
    const a2 = Math.sqrt(g2 * R * t2);
    let W_R = a2 * Math.sqrt(p5_ideal / p2);  // 대략적 추정
    
    const tol = 1e-8;
    const maxIter = 20;
    
    for (let iter = 0; iter < maxIter; iter++) {
        // 질량 보존: ρ₅ = ρ₂ × (W_R + u₂) / W_R
        const rho5 = rho2 * (W_R + u2) / W_R;
        
        // 운동량 보존: p₅ = p₂ + ρ₂×(W_R+u₂)² - ρ₅×W_R²
        const p5 = p2 + rho2 * (W_R + u2) * (W_R + u2) - rho5 * W_R * W_R;
        
        // 에너지 보존: h₅ = h₂ + 0.5×(W_R+u₂)² - 0.5×W_R²
        const h5_needed = h2 + 0.5 * (W_R + u2) * (W_R + u2) - 0.5 * W_R * W_R;
        
        // h₅로부터 T₅ 역산
        const t5 = calcTFromH(h5_needed, gasType, mw, t2 * 1.5, X_He);
        
        // 상태 방정식: p₅_eos = ρ₅ × R × T₅
        const p5_eos = rho5 * R * t5;
        
        // 오차 계산
        const error = p5 - p5_eos;
        
        if (Math.abs(error / p5) < tol) {
            // 수렴
            return { p: p5, t: t5, rho: rho5 };
        }
        
        // 수치 미분 (Jacobian)
        const delta = W_R * 1e-6;
        const W_R_plus = W_R + delta;
        const rho5_plus = rho2 * (W_R_plus + u2) / W_R_plus;
        const p5_plus = p2 + rho2 * (W_R_plus + u2) * (W_R_plus + u2) - rho5_plus * W_R_plus * W_R_plus;
        const h5_plus = h2 + 0.5 * (W_R_plus + u2) * (W_R_plus + u2) - 0.5 * W_R_plus * W_R_plus;
        const t5_plus = calcTFromH(h5_plus, gasType, mw, t5, X_He);
        const p5_eos_plus = rho5_plus * R * t5_plus;
        const error_plus = p5_plus - p5_eos_plus;
        
        const derivative = (error_plus - error) / delta;
        
        if (Math.abs(derivative) < 1e-10) {
            console.warn('calcReflectedShock: derivative too small');
            break;
        }
        
        // Newton-Raphson 업데이트
        W_R = W_R - error / derivative;
        
        // 물리적 범위 제한 (W_R > 0)
        W_R = Math.max(a2 * 0.1, Math.min(a2 * 10, W_R));
    }
    
    // 수렴 실패 시 마지막 값 반환
    const rho5 = rho2 * (W_R + u2) / W_R;
    const p5 = p2 + rho2 * (W_R + u2) * (W_R + u2) - rho5 * W_R * W_R;
    const h5_needed = h2 + 0.5 * (W_R + u2) * (W_R + u2) - 0.5 * W_R * W_R;
    const t5 = calcTFromH(h5_needed, gasType, mw, t2 * 1.5, X_He);
    
    return { p: p5, t: t5, rho: rho5 };
}


// ============================================
// 테일러드 조건 계산 함수
// ============================================

function calcTailoredParameter(states) {
    const s2 = states.state2;
    const s3 = states.state3;
    const s5 = states.state5;
    
    // 음향 임피던스 (ρa)
    const Z2 = s2.rho * s2.a;
    const Z3 = s3.rho * s3.a;
    const Z5 = s5.rho * s5.a;
    
    // 테일러드 파라미터: Z₃/Z₂ - 1
    const tau = (Z3 / Z2) - 1;
    const impedanceRatio = Z3 / Z2;
    
    // 상태 판정
    let status, statusClass, detail;
    
    if (Math.abs(tau) < 0.05) {
        status = '✅ TAILORED';
        statusClass = 'tailored';
        detail = '추가 파동 없음 - 최적 테스트 시간';
    } else if (Math.abs(tau) < 0.15) {
        status = '🟡 NEAR-TAILORED';
        statusClass = 'tailored';
        detail = '약한 파동 발생 - 양호';
    } else if (tau > 0) {
        status = '⚠️ OVER-TAILORED';
        statusClass = 'over';
        detail = 'Driver측 임피던스가 큼';
    } else {
        status = '⚠️ UNDER-TAILORED';
        statusClass = 'under';
        detail = 'Driven측 임피던스가 큼';
    }
    
    return {
        tau: tau,
        impedanceRatio: impedanceRatio,
        Z2: Z2,
        Z3: Z3,
        Z5: Z5,
        status: status,
        statusClass: statusClass,
        detail: detail,
        isTailored: Math.abs(tau) < 0.15
    };
}


function findTailoredCompositionForP4(p4, p1, t1, t4, drivenProps, initialMach) {
    /**
     * 드라이버 압력 p4를 고정하고, 조성을 바꿔가며 테일러드 조성 탐색
     * 각 조성에서 마하수를 새로 계산
     */
    const results = [];
    let bestX = null;
    let bestTau = Infinity;
    
    // 0% ~ 100% He 스캔
    for (let i = 0; i <= 100; i++) {
        const X_He = i / 100;
        
        try {
            const driverProps = calcMixtureProperties(X_He);
            
            // 이 조성에서 마하수를 새로 계산
            const machResult = findMachFromP4(p4, p1, t1, t4, drivenProps, driverProps, initialMach);
            
            if (!machResult.converged) continue;
            
            const M = machResult.M;
            
            // 상태 계산
            const states = calcShockTube(M, p1, t1, p4, t4, drivenProps, driverProps);
            
            // 테일러드 파라미터 계산
            const tailored = calcTailoredParameter(states);
            
            results.push({
                X_He: X_He,
                tau: tailored.tau,
                mach: M,
                gamma: driverProps.gamma,
                mw: driverProps.mw
            });
            
            if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                bestTau = tailored.tau;
                bestX = X_He;
            }
        } catch (e) {
            continue;
        }
    }
    
    let optimal = null;
    if (bestX !== null) {
        const bestProps = calcMixtureProperties(bestX);
        // 최적 조성에서 마하수 다시 계산
        const bestMachResult = findMachFromP4(p4, p1, t1, t4, drivenProps, bestProps, initialMach);
        
        optimal = {
            X_He: bestX,
            composition: `Air ${((1 - bestX) * 100).toFixed(2)}% / He ${(bestX * 100).toFixed(2)}%`,
            gamma: bestProps.gamma,
            mw: bestProps.mw,
            tau: bestTau,
            mach: bestMachResult.converged ? bestMachResult.M : null,
            isTailored: Math.abs(bestTau) < 0.05
        };
    }
    
    return {
        optimal: optimal,
        scanResults: results
    };
}


// ============================================
// UI 함수
// ============================================

function toggleMixRatio() {
    const driverGasEl = document.getElementById('driver-gas');
    const mixRow = document.getElementById('mix-ratio-row');
    if (!mixRow) return;
    const driverGas = driverGasEl ? driverGasEl.value : '';
    mixRow.style.display = driverGas === 'mix' ? 'flex' : 'none';
}


function calculate() {
    try {
        // 입력값 읽기
        const driverGas = document.getElementById('driver-gas').value;
        const driverP = parseFloat(document.getElementById('driver-p').value) * 1e5; // bar → Pa
        const driverT = parseFloat(document.getElementById('driver-t').value);
        const heRatio = parseFloat(document.getElementById('he-ratio').value);
        
        const drivenGas = document.getElementById('driven-gas').value;
        const drivenP = parseFloat(document.getElementById('driven-p').value) * 1e5; // bar → Pa
        const drivenT = parseFloat(document.getElementById('driven-t').value);
        
        const initialMach = parseFloat(document.getElementById('initial-mach').value);
        const nozzleMach = parseFloat(document.getElementById('nozzle-mach').value);
        
        // 물성치 가져오기
        const driverProps = getGasProperties(driverGas, heRatio);
        const drivenProps = getGasProperties(drivenGas);
        
        // 마하수 찾기
        const result = findMachFromP4(driverP, drivenP, drivenT, driverT, drivenProps, driverProps, initialMach);
        
        // 수렴 정보 표시
        const convInfo = document.getElementById('convergence-info');
        if (result.converged) {
            convInfo.className = 'convergence-info success';
            convInfo.innerHTML = `✓ 수렴 완료! (${result.iterations.length}회 반복) | Mach = ${result.M.toFixed(5)}`;
        } else {
            convInfo.className = 'convergence-info error';
            convInfo.innerHTML = `✗ 수렴 실패. 초기 마하수를 조절해 보세요.`;
            return;
        }
        
        // 전체 상태 계산 (온도 의존 gamma 적용)
        const states = calcShockTube(result.M, drivenP, drivenT, driverP, driverT, drivenProps, driverProps, drivenGas, driverGas);
        
        // State 7 계산 (노즐 팽창, 온도 의존 적용)
        states.state7 = calcState7(states.state5, nozzleMach, drivenProps, drivenGas);
        
        if (!states.state7) {
            convInfo.className = 'convergence-info error';
            convInfo.innerHTML = `✗ State 7 계산 실패. 콘솔을 확인하세요.`;
            console.error('State 7 calculation failed');
            console.log('State 5:', states.state5);
            console.log('Nozzle Mach:', nozzleMach);
            console.log('Driven Props:', drivenProps);
            console.log('Driven Gas:', drivenGas);
            return;
        }
        
        // 시뮬레이션용으로 states 저장
        if (typeof setAnalyticStates === 'function') {
            setAnalyticStates(states);
        }
        
        // 테일러드 분석
        const tailored = calcTailoredParameter(states);
        displayTailoredResult(tailored);
        
        // 결과 표시
        displayResults(states, driverProps, drivenProps);
        
        // 조성 탐색 섹션 숨김 (섹션이 있는 경우에만)
        const compSection = document.getElementById('composition-section');
        if (compSection) compSection.style.display = 'none';
        
    } catch (error) {
        console.error(error);
        alert('계산 중 오류가 발생했습니다: ' + error.message);
    }
}


function displayTailoredResult(tailored) {
    const section = document.getElementById('tailored-section');
    const resultDiv = document.getElementById('tailored-result');
    
    section.style.display = 'block';
    
    let tauColorClass = '';
    if (Math.abs(tailored.tau) < 0.15) {
        tauColorClass = 'tailored';
    } else if (tailored.tau > 0) {
        tauColorClass = 'positive';
    } else {
        tauColorClass = 'negative';
    }
    
    // 기존 눈에 띄는 카드 스타일 유지
    resultDiv.innerHTML = `
        <div class="tailored-card status-${tailored.statusClass}">
            <div class="icon">${tailored.status.split(' ')[0]}</div>
            <div class="label">테일러드 파라미터 τ</div>
            <div class="value ${tauColorClass}">${(tailored.tau * 100).toFixed(2)}%</div>
            <div class="status status-text-${tailored.statusClass}">${tailored.status.split(' ').slice(1).join(' ')}</div>
        </div>
        <div class="tailored-card">
            <div class="icon">📊</div>
            <div class="label">임피던스 비율 Z₃/Z₂</div>
            <div class="value">${tailored.impedanceRatio.toFixed(4)}</div>
            <div class="status">(1.0 = 테일러드)</div>
        </div>
        <div class="tailored-card">
            <div class="icon">🔊</div>
            <div class="label">Z₂ (State 2)</div>
            <div class="value">${tailored.Z2.toFixed(1)}</div>
            <div class="status">kg/(m²·s)</div>
        </div>
        <div class="tailored-card">
            <div class="icon">🔊</div>
            <div class="label">Z₃ (State 3)</div>
            <div class="value">${tailored.Z3.toFixed(1)}</div>
            <div class="status">kg/(m²·s)</div>
        </div>
    `;
}


function displayResults(states, driverProps, drivenProps) {
    const resultsDiv = document.getElementById('results');
    
    const stateData = [
        { key: 'state1', name: 'State 1 (Driven 초기)', class: 'state-1', gas: drivenProps.name },
        { key: 'state2', name: 'State 2 (충격파 후)', class: 'state-2', gas: drivenProps.name },
        { key: 'state3', name: 'State 3 (접촉면)', class: 'state-3', gas: driverProps.name },
        { key: 'state4', name: 'State 4 (Driver 초기)', class: 'state-4', gas: driverProps.name },
        { key: 'state5', name: 'State 5 (반사 충격파)', class: 'state-5', gas: drivenProps.name },
        { key: 'shock', name: 'Shock Wave', class: 'shock', gas: '' },
        { key: 'state7', name: 'State 7 (노즐 팽창)', class: 'state-7', gas: drivenProps.name }
    ];
    
    let html = '';
    
    for (const sd of stateData) {
        const state = states[sd.key];
        
        if (sd.key === 'shock') {
            html += `
                <div class="state-card ${sd.class}">
                    <h3>🌊 ${sd.name}</h3>
                    <div class="property">
                        <span class="label">M (입사)</span>
                        <span class="value">${state.mach.toFixed(5)}</span>
                    </div>
                    <div class="property">
                        <span class="label">W [m/s]</span>
                        <span class="value">${state.W.toFixed(2)}</span>
                    </div>
                    <div class="property">
                        <span class="label">M_R (반사)</span>
                        <span class="value">${state.M_R.toFixed(4)}</span>
                    </div>
                </div>
            `;
        } else if (sd.key === 'state7') {
            // State 7 - 노즐 팽창 후 (2칸 차지, 좌우 분할)
            html += `
                <div class="state-card ${sd.class} state-7-wide">
                    <h3>🔷 ${sd.name}</h3>
                    <div class="state-7-content">
                        <div class="state-7-left">
                            <div class="property">
                                <span class="label">Gas</span>
                                <span class="value">${sd.gas}</span>
                            </div>
                            <div class="property">
                                <span class="label">P [bar]</span>
                                <span class="value">${(state.p / 1e5).toFixed(4)}</span>
                            </div>
                            <div class="property">
                                <span class="label">T [K]</span>
                                <span class="value">${state.t.toFixed(2)}</span>
                            </div>
                            <div class="property">
                                <span class="label">ρ [kg/m³]</span>
                                <span class="value">${state.rho.toFixed(4)}</span>
                            </div>
                            <div class="property">
                                <span class="label">u [m/s]</span>
                                <span class="value">${state.u.toFixed(2)}</span>
                            </div>
                            <div class="property">
                                <span class="label">μ [Pa·s]</span>
                                <span class="value">${state.mu.toExponential(3)}</span>
                            </div>
                            <div class="property" style="border-top: 1px solid #30363d; margin-top: 8px; padding-top: 8px;">
                                <span class="label">γ</span>
                                <span class="value">${state.gamma ? state.gamma.toFixed(4) : 'N/A'}</span>
                            </div>
                            <div class="property">
                                <span class="label">cp [J/kg·K]</span>
                                <span class="value">${state.cp ? state.cp.toFixed(1) : 'N/A'}</span>
                            </div>
                        </div>
                        <div class="state-7-right">
                            <div class="highlight-box">
                                <span class="highlight-label">M₇</span>
                                <span class="highlight-value">${state.M.toFixed(2)}</span>
                            </div>
                            <div class="highlight-box">
                                <span class="highlight-label">Re/m</span>
                                <span class="highlight-value">${state.Re_unit_e6.toFixed(3)}</span>
                                <span class="highlight-unit">×10⁶/m</span>
                            </div>
                            <div class="highlight-box">
                                <span class="highlight-label">h_tot</span>
                                <span class="highlight-value">${state.H0_MJ.toFixed(3)}</span>
                                <span class="highlight-unit">MJ/kg</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="state-card ${sd.class}">
                    <h3>${sd.name}</h3>
                    <div class="property">
                        <span class="label">Gas</span>
                        <span class="value">${sd.gas}</span>
                    </div>
                    <div class="property">
                        <span class="label">P [bar]</span>
                        <span class="value">${(state.p / 1e5).toFixed(4)}</span>
                    </div>
                    <div class="property">
                        <span class="label">T [K]</span>
                        <span class="value">${state.t.toFixed(2)}</span>
                    </div>
                    <div class="property">
                        <span class="label">ρ [kg/m³]</span>
                        <span class="value">${state.rho.toFixed(4)}</span>
                    </div>
                    <div class="property">
                        <span class="label">a [m/s]</span>
                        <span class="value">${state.a.toFixed(2)}</span>
                    </div>
                    <div class="property">
                        <span class="label">u [m/s]</span>
                        <span class="value">${state.u.toFixed(2)}</span>
                    </div>
                    <div class="property" style="border-top: 1px solid #30363d; margin-top: 8px; padding-top: 8px;">
                        <span class="label">γ</span>
                        <span class="value">${state.gamma ? state.gamma.toFixed(4) : 'N/A'}</span>
                    </div>
                    <div class="property">
                        <span class="label">cp [J/kg·K]</span>
                        <span class="value">${state.cp ? state.cp.toFixed(1) : 'N/A'}</span>
                    </div>
                </div>
            `;
        }
    }
    
    resultsDiv.innerHTML = html;
}


function findTailoredComposition() {
    try {
        const driverP = parseFloat(document.getElementById('driver-p').value) * 1e5;
        const driverT = parseFloat(document.getElementById('driver-t').value);
        
        const drivenGas = document.getElementById('driven-gas').value;
        const drivenP = parseFloat(document.getElementById('driven-p').value) * 1e5;
        const drivenT = parseFloat(document.getElementById('driven-t').value);
        
        const initialMach = parseFloat(document.getElementById('initial-mach').value);
        
        const drivenProps = getGasProperties(drivenGas);
        
        // 테일러드 조성 탐색 (드라이버 압력 p4 고정, 조성만 변경)
        const composition = findTailoredCompositionForP4(driverP, drivenP, drivenT, driverT, drivenProps, initialMach);
        
        // 결과 표시
        displayCompositionResult(composition, driverP);
        
        // 수렴 정보 업데이트
        const convInfo = document.getElementById('convergence-info');
        convInfo.className = 'convergence-info success';
        if (composition.optimal) {
            convInfo.innerHTML = `🎯 조성 탐색 완료 | P₄ = ${(driverP/1e5).toFixed(0)} bar 고정, 최적 Mach = ${composition.optimal.mach?.toFixed(4) || 'N/A'}`;
        } else {
            convInfo.innerHTML = `🎯 조성 탐색 완료 | P₄ = ${(driverP/1e5).toFixed(0)} bar`;
        }
        
    } catch (error) {
        console.error(error);
        alert('조성 탐색 중 오류가 발생했습니다: ' + error.message);
    }
}


function displayCompositionResult(composition, p4) {
    const section = document.getElementById('composition-section');
    const resultDiv = document.getElementById('composition-result');
    
    section.style.display = 'block';
    
    if (composition.optimal) {
        const opt = composition.optimal;
        const machStr = opt.mach ? opt.mach.toFixed(4) : 'N/A';
        resultDiv.innerHTML = `
            <div class="optimal-composition">
                <h3>🎯 최적 테일러드 조성 (P₄ = ${(p4/1e5).toFixed(0)} bar)</h3>
                <div class="comp-value">${opt.composition}</div>
                <div class="comp-details">
                    <div>γ = <span>${opt.gamma.toFixed(4)}</span></div>
                    <div>MW = <span>${opt.mw.toFixed(2)}</span> kg/kmol</div>
                    <div>τ = <span>${(opt.tau * 100).toFixed(2)}%</span></div>
                    <div>M = <span>${machStr}</span></div>
                </div>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="optimal-composition" style="border-color: var(--accent-red);">
                <h3>❌ 테일러드 조성을 찾을 수 없습니다</h3>
                <p style="color: var(--text-secondary);">Air/He 혼합으로는 해당 조건에서 테일러드 달성 불가</p>
            </div>
        `;
    }
    
    // 차트 그리기
    drawTauChart(composition.scanResults);
}


function drawTauChart(results) {
    const canvas = document.getElementById('tau-chart');
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 70 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    
    // 배경
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, width, height);
    
    if (results.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 없음', width / 2, height / 2);
        return;
    }
    
    // 데이터 범위 계산
    const tauValues = results.map(r => r.tau * 100);
    const minTau = Math.min(...tauValues, -10);
    const maxTau = Math.max(...tauValues, 10);
    const tauRange = maxTau - minTau;
    
    // τ = 0 수평선
    const zeroY = padding.top + plotHeight * (maxTau / tauRange);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 테일러드 영역 (±5%)
    ctx.fillStyle = 'rgba(63, 185, 80, 0.1)';
    const upperBound = padding.top + plotHeight * ((maxTau - 5) / tauRange);
    const lowerBound = padding.top + plotHeight * ((maxTau + 5) / tauRange);
    ctx.fillRect(padding.left, upperBound, plotWidth, lowerBound - upperBound);
    
    // 데이터 플롯
    ctx.beginPath();
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    
    results.forEach((r, i) => {
        const x = padding.left + (r.X_He * plotWidth);
        const y = padding.top + plotHeight * ((maxTau - r.tau * 100) / tauRange);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // 최적점 표시
    const optResult = results.reduce((best, r) => 
        Math.abs(r.tau) < Math.abs(best.tau) ? r : best
    );
    const optX = padding.left + (optResult.X_He * plotWidth);
    const optY = padding.top + plotHeight * ((maxTau - optResult.tau * 100) / tauRange);
    
    ctx.beginPath();
    ctx.arc(optX, optY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3fb950';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 축 레이블
    ctx.fillStyle = '#e6edf3';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // X축 레이블
    ctx.fillText('He 몰분율', width / 2, height - 10);
    for (let i = 0; i <= 10; i++) {
        const x = padding.left + (i / 10) * plotWidth;
        ctx.fillStyle = '#8b949e';
        ctx.fillText((i * 10) + '%', x, height - 30);
    }
    
    // Y축 레이블
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText('τ (%)', 0, 0);
    ctx.restore();
    
    // Y축 눈금
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
        const tau = maxTau - (i / yTicks) * tauRange;
        const y = padding.top + (i / yTicks) * plotHeight;
        ctx.fillStyle = '#8b949e';
        ctx.fillText(tau.toFixed(0), padding.left - 10, y + 4);
    }
    
    // 범례
    ctx.fillStyle = '#e6edf3';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`최적: He ${(optResult.X_He * 100).toFixed(2)}% (τ = ${(optResult.tau * 100).toFixed(2)}%)`, padding.left + 10, padding.top + 15);
}


// ============================================
// 센서 스펙 데이터베이스 (엑셀 기반)
// ============================================

let SENSOR_SPECS = [];
let SENSOR_SPECS_READY = false;
let SENSOR_SPECS_LOAD_ERROR = null;
const SENSOR_SPECS_PATH = 'sensor_spec.xlsx';

// 센서 타입별 필터 옵션
const SENSOR_TYPES = {
    'P': '압력 센서',
    'T': '온도 센서',
    'V': '전압 센서',
    'A': '가속도 센서',
    'S': '스트레인 센서',
    'X': '기타 센서'
};

function normalizeString(value) {
    return String(value ?? '').trim();
}

function parseNumber(value) {
    const text = normalizeString(value);
    if (!text || text === '?' || text === '??') return null;
    const num = parseFloat(text);
    return Number.isFinite(num) ? num : null;
}

function inferSensorType(usage, name, cal) {
    const text = `${usage} ${name} ${cal}`.toLowerCase();
    if (text.includes('압력') || text.includes('피토압') || text.includes('동압') || text.includes('정압')) return 'P';
    if (cal === 'V') return 'V'; // 'V' for direct voltage measurement
    if (text.includes('온도') || text.includes('thermocouple') || text.includes('pt100') || text.includes('type e') || text.includes('type k')) return 'T';
    if (text.includes('가속도') || text.includes('accel')) return 'A';
    if (text.includes('strain')) return 'S';
    return 'X';
}

function inferUnit(type) {
    if (type === 'P') return 'bar';
    if (type === 'T') return '°C';
    if (type === 'V') return 'V';
    return '';
}

function getLatestLocation(row) {
    const keys = Object.keys(row || {}).filter(key => key.includes('현재 위치'));
    if (keys.length === 0) return '';
    const sorted = keys.slice().sort((a, b) => {
        const aNum = parseInt((a.match(/(\\d{6})/) || [])[1] || '0', 10);
        const bNum = parseInt((b.match(/(\\d{6})/) || [])[1] || '0', 10);
        return aNum - bNum;
    });
    for (let i = sorted.length - 1; i >= 0; i--) {
        const value = normalizeString(row[sorted[i]]);
        if (value) return value;
    }
    return '';
}

function buildSensorNote(row) {
    const usage = normalizeString(row['용도']);
    const memo = normalizeString(row['비고']);
    const location = getLatestLocation(row);
    const parts = [];
    if (usage) parts.push(usage);
    if (location) parts.push(`위치: ${location}`);
    if (memo) parts.push(`비고: ${memo}`);
    return parts.join(' | ');
}

function parseSensorSpecsFromRows(rows) {
    const specs = [];
    const seen = new Set();
    rows.forEach(row => {
        const name = normalizeString(row['센서명']);
        const sn = normalizeString(row['시리얼 번호']);
        if (!name || !sn) return;

        const usage = normalizeString(row['용도']);
        const cal = normalizeString(row['계산식']);
        const type = inferSensorType(usage, name, cal);
        const unit = inferUnit(type);
        const note = buildSensorNote(row);
        const key = `${name}__${sn}`;
        if (seen.has(key)) return;
        seen.add(key);

        specs.push({
            type,
            pn: name,
            sn,
            cal: cal || '-',
            a: parseNumber(row['a(bar/V)']),
            b: parseNumber(row['b(bar)']),
            c: null,
            unit,
            note: note || '-'
        });
    });
    return specs;
}

async function loadSensorSpecsFromExcel() {
    if (typeof XLSX === 'undefined') {
        throw new Error('엑셀 라이브러리를 불러올 수 없습니다.');
    }
    const response = await fetch(SENSOR_SPECS_PATH);
    if (!response.ok) {
        throw new Error(`센서 스펙 엑셀 로드 실패: ${response.status}`);
    }
    const data = await response.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    SENSOR_SPECS = parseSensorSpecsFromRows(rows);
    SENSOR_SPECS_READY = true;
}

async function ensureSensorSpecsLoaded() {
    if (SENSOR_SPECS_READY) return SENSOR_SPECS;
    if (SENSOR_SPECS_LOAD_ERROR) return SENSOR_SPECS;
    try {
        await loadSensorSpecsFromExcel();
    } catch (error) {
        SENSOR_SPECS_LOAD_ERROR = error;
        console.error('센서 스펙 로드 실패:', error);
    }
    return SENSOR_SPECS;
}

// ============================================
// 테일러드 유동조건 산출기 (역문제)
// ============================================

let fcResult = null;  // 현재 선택된 결과
let fcAllResults = []; // 모든 계산 결과 (테이블용)
let fcMapData = null;  // 2D 맵 데이터
let fcConfig = null;   // 현재 설정

function openFlowConditionFinder() {
    document.getElementById('flow-condition-modal').style.display = 'flex';
}

function closeFlowConditionFinder() {
    document.getElementById('flow-condition-modal').style.display = 'none';
}

// 슬라이더 이벤트 초기화
function initFCSliders() {
    const reSlider = document.getElementById('fc-re-slider');
    const hSlider = document.getElementById('fc-h-slider');
    const expCheckbox = document.getElementById('fc-exp-constraint');
    
    if (reSlider && hSlider) {
        reSlider.oninput = function() {
            document.getElementById('fc-re-display').textContent = parseFloat(this.value).toFixed(2);
            updateFCFromSliders('re');
        };
        
        hSlider.oninput = function() {
            document.getElementById('fc-h-display').textContent = parseFloat(this.value).toFixed(2);
            updateFCFromSliders('h');
        };
    }
    
    // 체크박스 변경 시 업데이트
    if (expCheckbox) {
        expCheckbox.onchange = function() {
            clearFCError();
            updateFCFromSliders('h');
        };
    }
}

// 에러 메시지 표시 함수
function showFCConstraintError(message) {
    let errorDiv = document.getElementById('fc-constraint-error');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'fc-constraint-error';
        errorDiv.style.cssText = 'background: #ff4444; color: white; padding: 10px 15px; border-radius: 8px; margin: 10px 0; font-weight: bold; text-align: center;';
        const slidersDiv = document.getElementById('fc-sliders');
        if (slidersDiv) {
            slidersDiv.insertBefore(errorDiv, slidersDiv.firstChild);
        }
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function clearFCError() {
    const errorDiv = document.getElementById('fc-constraint-error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// 슬라이더 값 변경 시 결과 업데이트
function updateFCFromSliders(changedSlider = 'h') {
    if (!fcConfig) return;
    
    // 현재 체크박스 상태 업데이트
    fcConfig.useExpConstraint = document.getElementById('fc-exp-constraint').checked;
    
    let targetRe = parseFloat(document.getElementById('fc-re-slider').value);
    let targetH0 = parseFloat(document.getElementById('fc-h-slider').value);
    
    // 실험 제약 모드: Air=1bar + 테일러드 조건 연동
    if (fcConfig.useExpConstraint) {
        let linkedResult = null;
        
        if (changedSlider === 'h') {
            // h_tot 변경 → Re/m 자동 계산
            linkedResult = calculateConstrainedCondition(targetH0, fcConfig);
            if (linkedResult) {
                targetRe = linkedResult.Re;
                document.getElementById('fc-re-slider').value = targetRe;
                document.getElementById('fc-re-display').textContent = targetRe.toFixed(4);  // 자동 조절 값은 정밀하게
            }
        } else if (changedSlider === 're') {
            // Re/m 변경 → h_tot 자동 계산
            linkedResult = calculateConstrainedConditionFromRe(targetRe, fcConfig);
            if (linkedResult) {
                targetH0 = linkedResult.H0;
                document.getElementById('fc-h-slider').value = targetH0;
                document.getElementById('fc-h-display').textContent = targetH0.toFixed(5);  // 자동 조절 값은 정밀하게
            }
        }
        
        if (linkedResult) {
            clearFCError();
            
            // 범위 체크
            const { reMin, reMax, hMin, hMax } = fcConfig;
            if (linkedResult.Re < reMin || linkedResult.Re > reMax || 
                linkedResult.H0 < hMin || linkedResult.H0 > hMax) {
                showFCConstraintError(`⚠️ 현재 조건이 범위를 벗어남 (Re/m: ${reMin}-${reMax}, h_tot: ${hMin}-${hMax})`);
            }
            
            fcResult = linkedResult;
            displayFCResult(linkedResult);
            updateFCKeyResults(linkedResult);
            return;
        } else {
            // 조건 불만족
            showFCConstraintError('⚠️ 테일러드 + Air 1bar 제약을 만족하는 조건이 없습니다');
            return;
        }
    }
    
    clearFCError();
    
    // 일반 모드: 독립적 계산
    const result = calculateSinglePoint(targetRe, targetH0, fcConfig);
    
    if (result) {
        fcResult = result;
        displayFCResult(result);
        updateFCKeyResults(result);
    }
}

// Re/m 기준으로 h_tot 역계산 (실험 제약 모드용)
function calculateConstrainedConditionFromRe(targetRe, config) {
    // h_tot 범위에서 Re가 targetRe에 가장 가까운 h_tot 찾기
    const { hMin, hMax, reMin, reMax } = config;
    
    let bestH0 = null;
    let bestResult = null;
    let minDiff = Infinity;
    
    // 1차 탐색: h_tot 범위를 0.01 간격으로 탐색
    const searchHMin = Math.max(0.1, hMin - 0.5);
    const searchHMax = Math.min(5.0, hMax + 0.5);
    
    for (let h = searchHMin; h <= searchHMax; h += 0.01) {
        const result = calculateConstrainedCondition(h, config);
        if (result) {
            const diff = Math.abs(result.Re - targetRe);
            if (diff < minDiff) {
                minDiff = diff;
                bestH0 = h;
                bestResult = result;
            }
        }
    }
    
    // 2차 정밀 탐색: 0.001 간격
    if (bestH0 !== null) {
        for (let h = bestH0 - 0.05; h <= bestH0 + 0.05; h += 0.001) {
            const result = calculateConstrainedCondition(h, config);
            if (result) {
                const diff = Math.abs(result.Re - targetRe);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestH0 = h;
                    bestResult = result;
                }
            }
        }
    }
    
    // 3차 초정밀 탐색: 0.0001 간격
    if (bestH0 !== null) {
        for (let h = bestH0 - 0.005; h <= bestH0 + 0.005; h += 0.0001) {
            const result = calculateConstrainedCondition(h, config);
            if (result) {
                const diff = Math.abs(result.Re - targetRe);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestResult = result;
                }
            }
        }
    }
    
    return bestResult;
}

// 실험 제약 모드: Air=1bar + 테일러드 조건 만족하는 조건 계산
function calculateConstrainedCondition(targetH0, config) {
    try {
        const { targetM7, drivenGas, T1, autoT4 } = config;
        let T4 = config.T4;
        const drivenProps = getGasProperties(drivenGas);
        
        // Step 1: h_tot → M
        const machResult = findMachFromH0(targetH0, T1, drivenProps);
        if (!machResult.converged) return null;
        const M = machResult.M;
        const T5 = machResult.T5;
        
        // Step 2: Air 1bar 제약 하에서 테일러드 조건을 만족하는 X_He 찾기
        // Air 1bar 제약: X_He = (p4 - 1) / p4, 즉 p4 = 1 / (1 - X_He)
        // autoT4일 때: T4 = 300 + 0.8 * (p4 - 1) = 300 + 0.8 * X_He / (1 - X_He)
        // 이 조건들을 적용하여 τ를 최소화하는 X_He를 찾음
        
        let bestX_He = null;
        let bestTau = Infinity;
        
        // 임시 p1으로 테일러드 조성 탐색 (τ는 압력비에 무관, 물성치에만 의존)
        const tempP1 = 1.0 * 1e5;
        
        // Air 1bar 제약에서의 T4 계산 함수
        const calcT4ForAir1bar = (X_He) => {
            if (!autoT4) return T4;
            if (X_He >= 0.9999) return T4;
            const p4_bar = 1 / (1 - X_He);
            return 300 + 0.8 * (p4_bar - 1);
        };
        
        // 1차 탐색: 1% 단위로 대략적인 범위 찾기
        for (let i = 0; i <= 99; i++) {
            const X_He = i / 100;
            try {
                const driverProps = calcMixtureProperties(X_He);
                const estT4 = calcT4ForAir1bar(X_He);  // Air 1bar 제약의 T4 사용
                const p4_temp = calcP4FromMach(M, tempP1, T1, estT4, drivenProps, driverProps);
                if (!isFinite(p4_temp) || p4_temp <= 0) continue;
                
                const states = calcShockTube(M, tempP1, T1, p4_temp, estT4, drivenProps, driverProps);
                const tailored = calcTailoredParameter(states);
                
                if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                    bestTau = tailored.tau;
                    bestX_He = X_He;
                }
            } catch (e) {
                continue;
            }
        }
        
        // 2차 탐색: 최적점 주변에서 0.1% 단위로 탐색
        if (bestX_He !== null) {
            const searchMin2 = Math.max(0, bestX_He - 0.02);
            const searchMax2 = Math.min(0.99, bestX_He + 0.02);
            
            for (let x = searchMin2; x <= searchMax2; x += 0.001) {
                try {
                    const driverProps = calcMixtureProperties(x);
                    const estT4 = calcT4ForAir1bar(x);  // Air 1bar 제약의 T4 사용
                    const p4_temp = calcP4FromMach(M, tempP1, T1, estT4, drivenProps, driverProps);
                    if (!isFinite(p4_temp) || p4_temp <= 0) continue;
                    
                    const states = calcShockTube(M, tempP1, T1, p4_temp, estT4, drivenProps, driverProps);
                    const tailored = calcTailoredParameter(states);
                    
                    if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                        bestTau = tailored.tau;
                        bestX_He = x;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        // 3차 탐색: 최적점 주변에서 0.01% 단위로 정밀 탐색
        if (bestX_He !== null) {
            const searchMin3 = Math.max(0, bestX_He - 0.005);
            const searchMax3 = Math.min(0.99, bestX_He + 0.005);
            
            for (let x = searchMin3; x <= searchMax3; x += 0.0001) {
                try {
                    const driverProps = calcMixtureProperties(x);
                    const estT4 = calcT4ForAir1bar(x);  // Air 1bar 제약의 T4 사용
                    const p4_temp = calcP4FromMach(M, tempP1, T1, estT4, drivenProps, driverProps);
                    if (!isFinite(p4_temp) || p4_temp <= 0) continue;
                    
                    const states = calcShockTube(M, tempP1, T1, p4_temp, estT4, drivenProps, driverProps);
                    const tailored = calcTailoredParameter(states);
                    
                    if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                        bestTau = tailored.tau;
                        bestX_He = x;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        if (bestX_He === null || bestX_He >= 0.99) return null;
        
        // Step 3: Air=1bar 조건에서 p4 계산
        // X_He = (p4 - 1) / p4  →  p4 = 1 / (1 - X_He)
        const p4_bar = 1 / (1 - bestX_He);
        const p4 = p4_bar * 1e5;
        
        if (autoT4) T4 = 300 + 0.8 * (p4_bar - 1);
        
        // Step 4: M, X_He, p4, T4가 정해졌으니 p1 역산
        const driverProps = calcMixtureProperties(bestX_He);
        
        // p4 = calcP4FromMach(M, p1, T1, T4, ...) 를 만족하는 p1 찾기
        let p1 = 0.5 * 1e5; // 초기값 0.5 bar
        for (let iter = 0; iter < 100; iter++) {
            const p4_calc = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
            if (!isFinite(p4_calc) || p4_calc <= 0) {
                p1 = p1 * 0.5;
                continue;
            }
            const ratio = p4 / p4_calc;
            const newP1 = p1 * ratio;
            if (Math.abs(newP1 - p1) / p1 < 0.0001) {
                p1 = newP1;
                break;
            }
            p1 = newP1;
        }
        
        // Step 5: p1으로 Re/m 계산
        const P5_P1 = calcP5P1Ratio(M, drivenProps.gamma);
        const P5 = p1 * P5_P1;
        const state7 = calcState7({ t: T5, p: P5 }, targetM7, drivenProps, drivenGas);
        
        // 최종 상태 계산
        const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
        const tailored = calcTailoredParameter(states);
        
        return {
            Re: state7.Re_unit_e6,
            H0: targetH0,
            M: M,
            p1: p1,
            T1: T1,
            p4: p4,
            T4: T4,
            X_He: bestX_He,
            tau: tailored.tau,
            state7: state7,
            drivenGas: drivenGas,
            useExpConstraint: true
        };
        
    } catch (e) {
        console.error('calculateConstrainedCondition error:', e);
        return null;
    }
}

// h_tot에서 T5를 구하고, 그로부터 입사 충격파 마하수 M을 역산
function findMachFromH0(targetH0_MJ, T1, drivenProps) {
    const g = drivenProps.gamma;
    const mw = drivenProps.mw;
    const R = R_universal / mw;
    
    // h_tot = γ/(γ-1) * R * T5  [J/kg]
    // T5 = h_tot * (γ-1) / (γ * R)
    const H0 = targetH0_MJ * 1e6;  // MJ/kg → J/kg
    const T5 = H0 * (g - 1) / (g * R);
    
    // T5/T1 관계에서 M 역산
    // T5/T1 = T5/T2 * T2/T1
    // T2/T1 = (1 + 2γ/(γ+1)*(M²-1)) * ((γ+1)/(γ-1) + (1 + 2γ/(γ+1)*(M²-1))) / (1 + (γ+1)/(γ-1) * (1 + 2γ/(γ+1)*(M²-1)))
    // 이건 복잡하니 Newton-Raphson 사용
    
    const T5_T1_target = T5 / T1;
    
    // Newton-Raphson으로 M 찾기
    let M = 3.0;  // 초기값
    
    for (let iter = 0; iter < 50; iter++) {
        const ratio = calcT5T1Ratio(M, g);
        const error = ratio - T5_T1_target;
        
        if (Math.abs(error / T5_T1_target) < 1e-6) {
            return { M: M, T5: T5, converged: true };
        }
        
        // 수치 미분
        const dM = 0.001;
        const ratio_plus = calcT5T1Ratio(M + dM, g);
        const dRatio_dM = (ratio_plus - ratio) / dM;
        
        if (Math.abs(dRatio_dM) < 1e-10) break;
        
        M = M - error / dRatio_dM;
        M = Math.max(1.01, Math.min(15, M));
    }
    
    return { M: M, T5: T5, converged: false };
}

// T5/T1 비율 계산 (입사 + 반사 충격파)
function calcT5T1Ratio(M, g) {
    const gp1 = g + 1;
    const gm1 = g - 1;
    
    // P2/P1
    const p2_p1 = 1 + (2 * g / gp1) * (M * M - 1);
    
    // T2/T1
    const t2_t1 = p2_p1 * ((gp1 / gm1 + p2_p1) / (1 + gp1 / gm1 * p2_p1));
    
    // P5/P2 (반사 충격파)
    const p5_p2 = ((3 * g - 1) * p2_p1 - gm1) / (gm1 * p2_p1 + gp1);
    
    // T5/T2
    const t5_t2 = p5_p2 * ((gp1 / gm1 + p5_p2) / (1 + gp1 / gm1 * p5_p2));
    
    return t2_t1 * t5_t2;
}

// P5/P1 비율 계산
function calcP5P1Ratio(M, g) {
    const gp1 = g + 1;
    const gm1 = g - 1;
    
    const p2_p1 = 1 + (2 * g / gp1) * (M * M - 1);
    const p5_p2 = ((3 * g - 1) * p2_p1 - gm1) / (gm1 * p2_p1 + gp1);
    
    return p2_p1 * p5_p2;
}

// Re/m에서 p1 역산
function findP1FromReUnit(targetRe_e6, M7, T5, drivenProps, drivenGas) {
    const g = drivenProps.gamma;
    const mw = drivenProps.mw;
    const R = R_universal / mw;
    
    // 등엔트로피 팽창
    const isentropicFactor = 1 + (g - 1) / 2 * M7 * M7;
    const T7 = T5 / isentropicFactor;
    
    // 점성계수
    const mu7 = calcViscosity(T7, drivenGas);
    
    // 음속과 속도
    const a7 = Math.sqrt(g * R * T7);
    const u7 = M7 * a7;
    
    // Re/m = ρ7 * u7 / μ7 = (P7 / (R * T7)) * u7 / μ7
    // P7 = Re/m * μ7 * R * T7 / u7
    const Re_unit = targetRe_e6 * 1e6;
    const P7 = Re_unit * mu7 * R * T7 / u7;
    
    // P7/P5 = (1 + (γ-1)/2 * M7²)^(-γ/(γ-1))
    const P7_P5 = Math.pow(isentropicFactor, -g / (g - 1));
    const P5 = P7 / P7_P5;
    
    return { P7: P7, P5: P5, T7: T7, mu7: mu7, u7: u7 };
}

// 테일러드 조성 찾기 (M 고정)
function findTailoredCompositionForMach(M, p1, T1, T4, drivenProps) {
    let bestX = null;
    let bestTau = Infinity;
    let bestResult = null;
    
    // 1차 탐색: 1% 단위
    for (let i = 0; i <= 100; i++) {
        const X_He = i / 100;
        
        try {
            const driverProps = calcMixtureProperties(X_He);
            const p4 = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
            
            if (!isFinite(p4) || p4 <= 0) continue;
            
            const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
            const tailored = calcTailoredParameter(states);
            
            if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                bestTau = tailored.tau;
                bestX = X_He;
            }
        } catch (e) {
            continue;
        }
    }
    
    // 2차 탐색: 최적점 주변에서 0.1% 단위로 탐색
    if (bestX !== null) {
        const searchMin2 = Math.max(0, bestX - 0.02);
        const searchMax2 = Math.min(1, bestX + 0.02);
        
        for (let x = searchMin2; x <= searchMax2; x += 0.001) {
            try {
                const driverProps = calcMixtureProperties(x);
                const p4 = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
                
                if (!isFinite(p4) || p4 <= 0) continue;
                
                const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
                const tailored = calcTailoredParameter(states);
                
                if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                    bestTau = tailored.tau;
                    bestX = x;
                }
            } catch (e) {
                continue;
            }
        }
    }
    
    // 3차 탐색: 최적점 주변에서 0.01% 단위로 정밀 탐색
    if (bestX !== null) {
        const searchMin3 = Math.max(0, bestX - 0.005);
        const searchMax3 = Math.min(1, bestX + 0.005);
        
        for (let x = searchMin3; x <= searchMax3; x += 0.0001) {
            try {
                const driverProps = calcMixtureProperties(x);
                const p4 = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
                
                if (!isFinite(p4) || p4 <= 0) continue;
                
                const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
                const tailored = calcTailoredParameter(states);
                
                if (Math.abs(tailored.tau) < Math.abs(bestTau)) {
                    bestTau = tailored.tau;
                    bestX = x;
                    bestResult = {
                        X_He: x,
                        p4: p4,
                        tau: tailored.tau,
                        gamma: driverProps.gamma,
                        mw: driverProps.mw
                    };
                }
            } catch (e) {
                continue;
            }
        }
    }
    
    // 최종 결과 생성
    if (bestX !== null && bestResult === null) {
        try {
            const driverProps = calcMixtureProperties(bestX);
            const p4 = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
            const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
            const tailored = calcTailoredParameter(states);
            bestResult = {
                X_He: bestX,
                p4: p4,
                tau: tailored.tau,
                gamma: driverProps.gamma,
                mw: driverProps.mw
            };
        } catch (e) {}
    }
    
    return bestResult;
}

// 실험 제약 (1 bar Air + He 가압) 적용
function applyExperimentalConstraint(M, p1, T1, T4, drivenProps) {
    // p4가 주어지면 X_He = (p4 - 1) / p4
    // 하지만 p4도 모르니까, 반복적으로 풀어야 함
    
    // 초기값
    let p4 = 100;  // bar
    
    for (let iter = 0; iter < 50; iter++) {
        const X_He = Math.max(0, (p4 - 1) / p4);
        const driverProps = calcMixtureProperties(X_He);
        
        // 이 조성에서 필요한 p4 계산
        const p4_calc = calcP4FromMach(M, p1, T1, T4, drivenProps, driverProps);
        
        if (!isFinite(p4_calc) || p4_calc <= 0) {
            return null;
        }
        
        const error = Math.abs(p4_calc - p4) / p4;
        if (error < 1e-4) {
            // 수렴
            const states = calcShockTube(M, p1, T1, p4, T4, drivenProps, driverProps);
            const tailored = calcTailoredParameter(states);
            
            return {
                X_He: X_He,
                p4: p4,
                tau: tailored.tau,
                gamma: driverProps.gamma,
                mw: driverProps.mw
            };
        }
        
        p4 = p4_calc;
    }
    
    return null;
}

// 단일 점 계산 함수
function calculateSinglePoint(targetRe, targetH0, config) {
    try {
        const { targetM7, drivenGas, T1, autoT4, useExpConstraint } = config;
        let T4 = config.T4;
        
        const drivenProps = getGasProperties(drivenGas);
        
        // Step 1: h_tot → M 역산
        const machResult = findMachFromH0(targetH0, T1, drivenProps);
        if (!machResult.converged) return null;
        
        const M = machResult.M;
        const T5 = machResult.T5;
        
        // Step 2: Re/m → P1 역산
        const pressureResult = findP1FromReUnit(targetRe, targetM7, T5, drivenProps, drivenGas);
        const P5 = pressureResult.P5;
        
        const P5_P1 = calcP5P1Ratio(M, drivenProps.gamma);
        const P1 = P5 / P5_P1;
        
        // T4 추정
        let estimatedP4_bar = (P1 / 1e5) * 50;
        
        // Step 3: Driver 조성 결정
        let driverResult;
        
        if (useExpConstraint) {
            // 실험 제약: 1 bar Air + He 가압
            for (let i = 0; i < 10; i++) {
                if (autoT4) T4 = 300 + 0.8 * (estimatedP4_bar - 1);
                driverResult = applyExperimentalConstraint(M, P1, T1, T4, drivenProps);
                if (driverResult) {
                    const newP4_bar = driverResult.p4 / 1e5;
                    if (Math.abs(newP4_bar - estimatedP4_bar) / estimatedP4_bar < 0.01) break;
                    estimatedP4_bar = newP4_bar;
                }
            }
        } else {
            // 이상적 테일러드
            for (let i = 0; i < 10; i++) {
                if (autoT4) T4 = 300 + 0.8 * (estimatedP4_bar - 1);
                driverResult = findTailoredCompositionForMach(M, P1, T1, T4, drivenProps);
                if (driverResult) {
                    const newP4_bar = driverResult.p4 / 1e5;
                    if (Math.abs(newP4_bar - estimatedP4_bar) / estimatedP4_bar < 0.01) break;
                    estimatedP4_bar = newP4_bar;
                }
            }
        }
        
        if (!driverResult) return null;
        
        if (autoT4) T4 = 300 + 0.8 * (driverResult.p4 / 1e5 - 1);
        
        const state7 = calcState7({ t: T5, p: P5 }, targetM7, drivenProps, drivenGas);
        
        return {
            Re: targetRe,
            H0: targetH0,
            M: M,
            p1: P1,
            T1: T1,
            p4: driverResult.p4,
            T4: T4,
            X_He: driverResult.X_He,
            tau: driverResult.tau,
            state7: state7,
            drivenGas: drivenGas,
            useExpConstraint: useExpConstraint
        };
    } catch (e) {
        return null;
    }
}

// 실험 제약 조건에서의 p1 계산 (2D 맵 선 그리기용)
function calculateExpConstraintLine(config) {
    const points = [];
    const { targetM7, drivenGas, T1, T4 } = config;
    const drivenProps = getGasProperties(drivenGas);
    
    // h_tot 범위에서 여러 점 계산
    for (let h = 0.7; h <= 2.0; h += 0.1) {
        const machResult = findMachFromH0(h, T1, drivenProps);
        if (!machResult.converged) continue;
        
        const M = machResult.M;
        const T5 = machResult.T5;
        
        // 실험 제약 적용하여 계산
        let estimatedP4_bar = 50;
        let T4_est = T4;
        
        for (let i = 0; i < 10; i++) {
            if (config.autoT4) T4_est = 300 + 0.8 * (estimatedP4_bar - 1);
            
            // 여러 Re 값에 대해 계산
            for (let re = 2; re <= 12; re += 1) {
                const pressureResult = findP1FromReUnit(re, targetM7, T5, drivenProps, drivenGas);
                const P5 = pressureResult.P5;
                const P5_P1 = calcP5P1Ratio(M, drivenProps.gamma);
                const P1 = P5 / P5_P1;
                
                const driverResult = applyExperimentalConstraint(M, P1, T1, T4_est, drivenProps);
                if (driverResult) {
                    points.push({ re: re, h: h, p1: P1, p4: driverResult.p4, tau: driverResult.tau });
                }
            }
            break;
        }
    }
    
    return points;
}

// 메인 계산 함수
function calculateFlowCondition() {
    try {
        // 입력값 읽기
        const targetM7 = parseFloat(document.getElementById('fc-target-mach').value);
        const reMin = parseFloat(document.getElementById('fc-re-min').value);
        const reMax = parseFloat(document.getElementById('fc-re-max').value);
        const hMin = parseFloat(document.getElementById('fc-h-min').value);
        const hMax = parseFloat(document.getElementById('fc-h-max').value);
        
        const drivenGas = document.getElementById('fc-driven-gas').value;
        const T1 = parseFloat(document.getElementById('fc-t1').value);
        const T4 = parseFloat(document.getElementById('fc-t4').value);
        
        const useExpConstraint = document.getElementById('fc-exp-constraint').checked;
        const autoT4 = document.getElementById('fc-auto-t4').checked;
        
        // 설정 저장
        fcConfig = { targetM7, reMin, reMax, hMin, hMax, drivenGas, T1, T4, useExpConstraint, autoT4 };
        
        // 슬라이더 범위 설정
        const reSlider = document.getElementById('fc-re-slider');
        const hSlider = document.getElementById('fc-h-slider');
        reSlider.min = reMin; reSlider.max = reMax; reSlider.value = (reMin + reMax) / 2;
        hSlider.min = hMin; hSlider.max = hMax; hSlider.value = (hMin + hMax) / 2;
        document.getElementById('fc-re-display').textContent = ((reMin + reMax) / 2).toFixed(2);
        document.getElementById('fc-h-display').textContent = ((hMin + hMax) / 2).toFixed(2);
        
        // 범위 중심값으로 계산
        const targetRe = (reMin + reMax) / 2;
        const targetH0 = (hMin + hMax) / 2;
        
        const result = calculateSinglePoint(targetRe, targetH0, fcConfig);
        
        if (!result) {
            showFCError('조건을 찾을 수 없습니다. 입력값을 조절해 주세요.');
            return;
        }
        
        fcResult = result;
        
        // UI 표시
        document.getElementById('fc-key-results').style.display = 'grid';
        document.getElementById('fc-sliders').style.display = 'block';
        
        // 결과 표시
        updateFCKeyResults(result);
        displayFCResult(result);
        
        // 슬라이더 이벤트 초기화
        initFCSliders();
        
    } catch (error) {
        console.error(error);
        showFCError('계산 중 오류: ' + error.message);
    }
}

// 핵심 결과 업데이트
function updateFCKeyResults(result) {
    const p1_bar = result.p1 / 1e5;
    const p4_bar = result.p4 / 1e5;
    const diff = p4_bar - p1_bar;
    
    document.getElementById('fc-key-p1').textContent = p1_bar.toFixed(3);
    document.getElementById('fc-key-diff').textContent = diff.toFixed(2);
    
    // 드라이버 충전 가이드 업데이트
    document.getElementById('fc-driver-guide').style.display = 'block';
    
    const X_He = result.X_He;
    
    // 실험 제약 시 Air = 1 bar 고정
    let p_air;
    if (result.useExpConstraint) {
        p_air = 1.0;  // 고정
    } else {
        p_air = p4_bar * (1 - X_He);  // Air 충전량
    }
    
    document.getElementById('fc-guide-he').textContent = (X_He * 100).toFixed(2) + ' %';
    document.getElementById('fc-guide-air').textContent = p_air.toFixed(2) + ' bar' + (result.useExpConstraint ? ' (고정)' : '');
    document.getElementById('fc-guide-final').textContent = p4_bar.toFixed(2) + ' bar';
}

// 테이블 표시
function displayFCTable(results) {
    const tbody = document.getElementById('fc-table-body');
    tbody.innerHTML = '';
    
    for (const r of results) {
        const p1_bar = r.p1 / 1e5;
        const p4_bar = r.p4 / 1e5;
        const ratio = p4_bar / p1_bar;
        const tauClass = Math.abs(r.tau) < 0.05 ? 'tau-good' : (Math.abs(r.tau) < 0.15 ? 'tau-warn' : 'tau-bad');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${r.Re.toFixed(1)}</td>
            <td>${r.H0.toFixed(2)}</td>
            <td>${p1_bar.toFixed(3)}</td>
            <td>${p4_bar.toFixed(1)}</td>
            <td>${ratio.toFixed(1)}</td>
            <td>${(r.X_He * 100).toFixed(2)}</td>
            <td class="${tauClass}">${(r.tau * 100).toFixed(1)}</td>
        `;
        row.onclick = () => selectTableRow(r);
        tbody.appendChild(row);
    }
}

// 테이블 행 선택
function selectTableRow(result) {
    fcResult = result;
    updateFCKeyResults(result);
    displayFCResult(result);
    
    // 슬라이더 업데이트
    document.getElementById('fc-re-slider').value = result.Re;
    document.getElementById('fc-h-slider').value = result.H0;
    document.getElementById('fc-re-display').textContent = result.Re.toFixed(2);
    document.getElementById('fc-h-display').textContent = result.H0.toFixed(2);
    
    update2DMapMarker(result.Re, result.H0);
}

// 2D 맵 그리기
function draw2DMap(config, currentRe, currentH) {
    const canvas = document.getElementById('fc-map-canvas');
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    
    const { reMin, reMax, hMin, hMax } = config;
    
    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    
    // 그리드 그리기
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    
    // 수직 그리드
    for (let re = Math.ceil(reMin); re <= reMax; re += 2) {
        const x = padding.left + ((re - reMin) / (reMax - reMin)) * plotWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
    }
    
    // 수평 그리드
    for (let h = Math.ceil(hMin * 10) / 10; h <= hMax; h += 0.2) {
        const y = height - padding.bottom - ((h - hMin) / (hMax - hMin)) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }
    
    // 실험 제약 선 그리기 (1 bar Air + He 가압)
    ctx.beginPath();
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    
    // 실험 제약 조건에서의 대표 점들
    const expPoints = [];
    for (let h = hMin; h <= hMax; h += 0.1) {
        const tempConfig = { ...config, useExpConstraint: true };
        const result = calculateSinglePoint((reMin + reMax) / 2, h, tempConfig);
        if (result) {
            expPoints.push({ h: h, re: (reMin + reMax) / 2 });
        }
    }
    
    // 실험 제약 영역 표시 (전체 범위)
    ctx.fillStyle = 'rgba(248, 81, 73, 0.1)';
    ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
    
    ctx.setLineDash([]);
    
    // 등고선: p1 값 (색상으로 표시)
    const gridSize = 10;
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const re = reMin + (i + 0.5) * (reMax - reMin) / gridSize;
            const h = hMin + (j + 0.5) * (hMax - hMin) / gridSize;
            
            const result = calculateSinglePoint(re, h, config);
            if (result) {
                const p1_bar = result.p1 / 1e5;
                // p1에 따른 색상 (낮으면 파랑, 높으면 빨강)
                const intensity = Math.min(1, Math.max(0, (p1_bar - 0.01) / 2));
                const r = Math.floor(intensity * 255);
                const b = Math.floor((1 - intensity) * 255);
                ctx.fillStyle = `rgba(${r}, 100, ${b}, 0.5)`;
                
                const x = padding.left + ((re - reMin) / (reMax - reMin)) * plotWidth;
                const y = height - padding.bottom - ((h - hMin) / (hMax - hMin)) * plotHeight;
                const cellW = plotWidth / gridSize;
                const cellH = plotHeight / gridSize;
                ctx.fillRect(x - cellW/2, y - cellH/2, cellW, cellH);
            }
        }
    }
    
    // 현재 선택점
    const currentX = padding.left + ((currentRe - reMin) / (reMax - reMin)) * plotWidth;
    const currentY = height - padding.bottom - ((currentH - hMin) / (hMax - hMin)) * plotHeight;
    
    ctx.beginPath();
    ctx.arc(currentX, currentY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // 축 레이블
    ctx.fillStyle = '#e6edf3';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // X축
    ctx.fillText('Re/m [×10⁶/m]', width / 2, height - 10);
    for (let re = Math.ceil(reMin); re <= reMax; re += 2) {
        const x = padding.left + ((re - reMin) / (reMax - reMin)) * plotWidth;
        ctx.fillStyle = '#8b949e';
        ctx.fillText(re.toString(), x, height - 30);
    }
    
    // Y축
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText('h_tot [MJ/kg]', 0, 0);
    ctx.restore();
    
    ctx.textAlign = 'right';
    for (let h = hMin; h <= hMax; h += 0.3) {
        const y = height - padding.bottom - ((h - hMin) / (hMax - hMin)) * plotHeight;
        ctx.fillStyle = '#8b949e';
        ctx.fillText(h.toFixed(1), padding.left - 10, y + 4);
    }
    
    // 저장
    fcMapData = { config, width, height, padding, plotWidth, plotHeight };
}

// 2D 맵 마커 업데이트
function update2DMapMarker(re, h) {
    if (!fcMapData) return;
    draw2DMap(fcMapData.config, re, h);
}

function showFCError(msg) {
    document.getElementById('fc-result-content').innerHTML = `
        <div class="fc-placeholder" style="color: var(--accent-red);">
            ❌ ${msg}
        </div>
    `;
    document.getElementById('fc-result-chart').style.display = 'none';
}

function displayFCResult(result) {
    const contentDiv = document.getElementById('fc-result-content');
    
    const p4_bar = result.p4 / 1e5;
    
    // τ 상태 결정
    let tauClass, tauStatus;
    if (Math.abs(result.tau) < 0.05) {
        tauClass = 'tailored';
        tauStatus = 'TAILORED';
    } else if (Math.abs(result.tau) < 0.15) {
        tauClass = 'near';
        tauStatus = 'NEAR-TAILORED';
    } else {
        tauClass = 'off';
        tauStatus = 'OFF-TAILORED';
    }
    
    contentDiv.innerHTML = `
        <div class="fc-compact-grid">
            <div class="fc-compact-row">
                <span class="fc-compact-label">Driver 압력 p₄</span>
                <span class="fc-compact-value">${p4_bar.toFixed(2)} bar</span>
            </div>
            <div class="fc-compact-row">
                <span class="fc-compact-label">Driver 온도 T₄</span>
                <span class="fc-compact-value">${result.T4.toFixed(0)} K</span>
            </div>
            <div class="fc-compact-row tau ${tauClass}">
                <span class="fc-compact-label">τ</span>
                <span class="fc-compact-value">${(result.tau * 100).toFixed(2)}% <small>${tauStatus}</small></span>
            </div>
        </div>
        
        <div class="fc-state7-compact">
            <div class="fc-s7-title">🔷 State 7</div>
            <div class="fc-s7-grid">
                <div class="fc-s7-item"><span>M₇</span><span>${result.state7.M.toFixed(2)}</span></div>
                <div class="fc-s7-item"><span>Re/m</span><span>${result.state7.Re_unit_e6.toFixed(2)} ×10⁶</span></div>
                <div class="fc-s7-item"><span>h_tot</span><span>${result.state7.H0_MJ.toFixed(3)} MJ/kg</span></div>
                <div class="fc-s7-item"><span>T₇</span><span>${result.state7.t.toFixed(0)} K</span></div>
            </div>
        </div>
        ${result.useExpConstraint ? `<div class="fc-exp-notice">🔒 1bar Air 제약 적용</div>` : ''}
    `;
}

// 결과를 메인 페이지에 적용
function applyFlowCondition() {
    if (!fcResult) {
        alert('먼저 조건 탐색을 실행해 주세요.');
        return;
    }
    
    // 메인 페이지 입력값 업데이트
    document.getElementById('driver-gas').value = 'mix';
    toggleMixRatio();
    document.getElementById('he-ratio').value = fcResult.X_He.toFixed(4);
    document.getElementById('driver-p').value = (fcResult.p4 / 1e5).toFixed(2);
    document.getElementById('driver-t').value = fcResult.T4.toFixed(0);
    
    document.getElementById('driven-gas').value = fcResult.drivenGas;
    document.getElementById('driven-p').value = (fcResult.p1 / 1e5).toFixed(4);
    document.getElementById('driven-t').value = fcResult.T1.toFixed(0);
    
    document.getElementById('nozzle-mach').value = fcResult.state7.M.toFixed(1);
    
    // 모달 닫기
    closeFlowConditionFinder();
    
    // 자동으로 계산 실행
    calculate();
}

// 페이지 로드 시 초기화 (계산기 페이지에 해당 요소가 있을 때만)
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('mix-ratio-row')) toggleMixRatio();
    
    // Canvas 초기화
    const simCanvas = document.getElementById('sim-gif-canvas');
    if (simCanvas) {
        const dpr = window.devicePixelRatio || 1;
        simCanvas.width = 800 * dpr;
        simCanvas.height = 500 * dpr;
        simCanvas.getContext('2d').scale(dpr, dpr);
    }
});

