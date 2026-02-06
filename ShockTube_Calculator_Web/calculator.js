// ============================================
// Shock Tube Calculator - JavaScript
// ============================================

// 물성치 정의
const R_universal = 8314.51; // 일반 기체 상수 [J/kmol·K]

// Air (공기)
const MW_Air = 28.9660;
const gamma_Air = 1.4020;

// Helium (헬륨)
const MW_He = 4.0026;
const gamma_He = 1.6670;

// Hydrogen (수소)
const MW_H2 = 2.0160;
const gamma_H2 = 1.4050;

// Carbon Dioxide (이산화탄소)
const MW_CO2 = 44.0100;
const gamma_CO2 = 1.2970;


// Air/He 혼합가스 물성치 계산
function calcMixtureProperties(X_He) {
    const X_Air = 1 - X_He;
    
    // 혼합 분자량
    const mw_mix = X_He * MW_He + X_Air * MW_Air;
    
    // 질량 분율
    const Y_He = (X_He * MW_He) / mw_mix;
    const Y_Air = 1 - Y_He;
    
    // 개별 기체상수
    const R_Air = R_universal / MW_Air;
    const R_He = R_universal / MW_He;
    
    // 개별 비열
    const cp_Air = gamma_Air / (gamma_Air - 1) * R_Air;
    const cp_He = gamma_He / (gamma_He - 1) * R_He;
    const cv_Air = R_Air / (gamma_Air - 1);
    const cv_He = R_He / (gamma_He - 1);
    
    // 혼합 비열
    const cp_mix = Y_Air * cp_Air + Y_He * cp_He;
    const cv_mix = Y_Air * cv_Air + Y_He * cv_He;
    
    // 혼합 비열비
    const gamma_mix = cp_mix / cv_mix;
    
    return { mw: mw_mix, gamma: gamma_mix };
}


// Driver 가스 물성치 반환
function getDriverProperties(driverType, X_He = 0.5) {
    switch (driverType) {
        case 'air':
            return { mw: MW_Air, gamma: gamma_Air, name: 'Air' };
        case 'he':
            return { mw: MW_He, gamma: gamma_He, name: 'Helium' };
        case 'h2':
            return { mw: MW_H2, gamma: gamma_H2, name: 'Hydrogen' };
        case 'mix':
            const props = calcMixtureProperties(X_He);
            return { mw: props.mw, gamma: props.gamma, name: `Air/He Mix (He ${(X_He * 100).toFixed(1)}%)` };
        default:
            throw new Error(`Unknown driver type: ${driverType}`);
    }
}


// Driven 가스 물성치 반환
function getDrivenProperties(drivenType) {
    switch (drivenType) {
        case 'air':
            return { mw: MW_Air, gamma: gamma_Air, name: 'Air' };
        case 'co2':
            return { mw: MW_CO2, gamma: gamma_CO2, name: 'CO₂' };
        default:
            throw new Error(`Unknown driven type: ${drivenType}`);
    }
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


// 충격파 튜브 전 상태 계산
function calcShockTube(M, p1, t1, p4, t4, drivenProps, driverProps) {
    // 드리븐 가스 물성치
    const g1 = drivenProps.gamma;
    const mw1 = drivenProps.mw;
    const R1 = R_universal / mw1;
    
    // 드라이버 가스 물성치
    const g4 = driverProps.gamma;
    const mw4 = driverProps.mw;
    const R4 = R_universal / mw4;
    
    // State 1: Driven 섹션 초기 상태
    const a1 = Math.sqrt(g1 * R1 * t1);
    const rho1 = p1 / (R1 * t1);
    const u1 = 0;
    
    // 충격파 속도
    const W = M * a1;
    
    // State 2: 충격파 직후
    const gp1 = g1 + 1;
    const gm1 = g1 - 1;
    
    const p2_p1 = 1 + (2 * g1 / gp1) * (M * M - 1);
    const p2 = p2_p1 * p1;
    
    const t2_t1 = p2_p1 * ((gp1 / gm1 + p2_p1) / (1 + gp1 / gm1 * p2_p1));
    const t2 = t2_t1 * t1;
    
    const rho2_rho1 = (1 + (gp1 / gm1) * p2_p1) / (gp1 / gm1 + p2_p1);
    const rho2 = rho2_rho1 * rho1;
    
    const a2 = Math.sqrt(g1 * R1 * t2);
    const u2 = (a1 / g1) * (p2_p1 - 1) * Math.sqrt((2 * g1 / gp1) / (p2_p1 + gm1 / gp1));
    
    // State 3: 접촉면
    const p3 = p2;
    const u3 = u2;
    
    // State 4: Driver 섹션 초기 상태
    const a4 = Math.sqrt(g4 * R4 * t4);
    const rho4 = p4 / (R4 * t4);
    const u4 = 0;
    
    // State 3 계속
    const gm4 = g4 - 1;
    const p3_p4 = p3 / p4;
    const t3 = t4 * Math.pow(p3_p4, gm4 / g4);
    const rho3 = rho4 * Math.pow(p3_p4, 1 / g4);
    const a3 = Math.sqrt(g4 * R4 * t3);
    
    // State 5: 반사 충격파 후
    const p5_p2 = ((3 * g1 - 1) * p2_p1 - gm1) / (gm1 * p2_p1 + gp1);
    const p5 = p5_p2 * p2;
    
    const t5_t2 = p5_p2 * ((gp1 / gm1 + p5_p2) / (1 + gp1 / gm1 * p5_p2));
    const t5 = t5_t2 * t2;
    
    const rho5_rho2 = (1 + (gp1 / gm1) * p5_p2) / (gp1 / gm1 + p5_p2);
    const rho5 = rho5_rho2 * rho2;
    
    const a5 = Math.sqrt(g1 * R1 * t5);
    const u5 = 0;
    
    return {
        state1: { p: p1, t: t1, rho: rho1, a: a1, u: u1 },
        state2: { p: p2, t: t2, rho: rho2, a: a2, u: u2 },
        state3: { p: p3, t: t3, rho: rho3, a: a3, u: u3 },
        state4: { p: p4, t: t4, rho: rho4, a: a4, u: u4 },
        state5: { p: p5, t: t5, rho: rho5, a: a5, u: u5 },
        shock: { mach: M, W: W }
    };
}


// UI: Mix 비율 입력 토글
function toggleMixRatio() {
    const driverGas = document.getElementById('driver-gas').value;
    const mixRow = document.getElementById('mix-ratio-row');
    mixRow.style.display = driverGas === 'mix' ? 'flex' : 'none';
}


// 계산 실행
function calculate() {
    try {
        // 입력값 읽기
        const driverGas = document.getElementById('driver-gas').value;
        const driverP = parseFloat(document.getElementById('driver-p').value) * 1e5; // bar → Pa
        const driverT = parseFloat(document.getElementById('driver-t').value);
        const heRatio = parseFloat(document.getElementById('he-ratio').value);
        
        const drivenGas = document.getElementById('driven-gas').value;
        const drivenP = parseFloat(document.getElementById('driven-p').value) * 101325; // atm → Pa
        const drivenT = parseFloat(document.getElementById('driven-t').value);
        
        const initialMach = parseFloat(document.getElementById('initial-mach').value);
        
        // 물성치 가져오기
        const driverProps = getDriverProperties(driverGas, heRatio);
        const drivenProps = getDrivenProperties(drivenGas);
        
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
        
        // 전체 상태 계산
        const states = calcShockTube(result.M, drivenP, drivenT, driverP, driverT, drivenProps, driverProps);
        
        // 결과 표시
        displayResults(states, driverProps, drivenProps);
        
    } catch (error) {
        console.error(error);
        alert('계산 중 오류가 발생했습니다: ' + error.message);
    }
}


// 결과 표시
function displayResults(states, driverProps, drivenProps) {
    const resultsDiv = document.getElementById('results');
    
    const stateData = [
        { key: 'state1', name: 'State 1 (Driven 초기)', class: 'state-1', gas: drivenProps.name },
        { key: 'state2', name: 'State 2 (충격파 후)', class: 'state-2', gas: drivenProps.name },
        { key: 'state3', name: 'State 3 (접촉면)', class: 'state-3', gas: driverProps.name },
        { key: 'state4', name: 'State 4 (Driver 초기)', class: 'state-4', gas: driverProps.name },
        { key: 'state5', name: 'State 5 (반사 충격파)', class: 'state-5', gas: drivenProps.name },
        { key: 'shock', name: 'Shock Wave', class: 'shock', gas: '' }
    ];
    
    let html = '';
    
    for (const sd of stateData) {
        const state = states[sd.key];
        
        if (sd.key === 'shock') {
            html += `
                <div class="state-card ${sd.class}">
                    <h3>🌊 ${sd.name}</h3>
                    <div class="property">
                        <span class="label">Mach</span>
                        <span class="value">${state.mach.toFixed(5)}</span>
                    </div>
                    <div class="property">
                        <span class="label">W [m/s]</span>
                        <span class="value">${state.W.toFixed(2)}</span>
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
                        <span class="label">P [atm]</span>
                        <span class="value">${(state.p / 101325).toFixed(4)}</span>
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
                </div>
            `;
        }
    }
    
    resultsDiv.innerHTML = html;
}


// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    toggleMixRatio();
});

