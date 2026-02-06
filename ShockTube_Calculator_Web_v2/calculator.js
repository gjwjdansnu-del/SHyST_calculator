// ============================================
// Shock Tube Calculator v2 - JavaScript
// 테일러드 조건 분석 기능 포함
// ============================================

// 물성치 정의
const R_universal = 8314.51; // 일반 기체 상수 [J/kmol·K]

// 가스 데이터
const GAS_DATA = {
    air:  { mw: 28.9660, gamma: 1.4020, name: 'Air' },
    he:   { mw: 4.0026,  gamma: 1.6670, name: 'Helium' },
    h2:   { mw: 2.0160,  gamma: 1.4050, name: 'Hydrogen' },
    co2:  { mw: 44.0100, gamma: 1.2970, name: 'CO₂' },
    ar:   { mw: 39.9480, gamma: 1.6670, name: 'Argon' },
    n2:   { mw: 28.0134, gamma: 1.4000, name: 'Nitrogen' }
};


// Air/He 혼합가스 물성치 계산
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
    
    // 개별 비열
    const cp_Air = gas1.gamma / (gas1.gamma - 1) * R_Air;
    const cp_He = gas2.gamma / (gas2.gamma - 1) * R_He;
    const cv_Air = R_Air / (gas1.gamma - 1);
    const cv_He = R_He / (gas2.gamma - 1);
    
    // 혼합 비열
    const cp_mix = Y_Air * cp_Air + Y_He * cp_He;
    const cv_mix = Y_Air * cv_Air + Y_He * cv_He;
    
    // 혼합 비열비
    const gamma_mix = cp_mix / cv_mix;
    
    return { 
        mw: mw_mix, 
        gamma: gamma_mix, 
        name: `Air/He (He ${(X_He * 100).toFixed(1)}%)` 
    };
}


// 가스 물성치 반환
function getGasProperties(gasType, X_He = 0.5) {
    if (gasType === 'mix') {
        return calcMixtureProperties(X_He);
    }
    
    const gas = GAS_DATA[gasType];
    if (!gas) {
        throw new Error(`Unknown gas type: ${gasType}`);
    }
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
    
    // State 3 계속 (등엔트로피 팽창)
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
    
    // 반사 충격파 마하수 (State 2 기준)
    const M_R = Math.sqrt(1 + (gp1 / (2 * g1)) * (p5_p2 - 1));
    
    return {
        state1: { p: p1, t: t1, rho: rho1, a: a1, u: u1 },
        state2: { p: p2, t: t2, rho: rho2, a: a2, u: u2 },
        state3: { p: p3, t: t3, rho: rho3, a: a3, u: u3 },
        state4: { p: p4, t: t4, rho: rho4, a: a4, u: u4 },
        state5: { p: p5, t: t5, rho: rho5, a: a5, u: u5 },
        shock: { mach: M, W: W, M_R: M_R }
    };
}


// ============================================
// 테일러드 조건 계산 함수
// ============================================

function calcTailoredParameter(states) {
    /**
     * 테일러드 파라미터 τ 계산
     * 
     * 테일러드 조건: 접촉면 양쪽의 음향 임피던스 매칭 (Z₂ ≈ Z₃)
     * - Z₂: State 2 (충격파 후, Driven gas)
     * - Z₃: State 3 (팽창파 후, Driver gas, 접촉면)
     * 
     * τ = (Z₃/Z₂) - 1
     * τ ≈ 0: 테일러드 (추가 파동 없음)
     * τ > 0: Over-tailored (Driver측 임피던스가 큼)
     * τ < 0: Under-tailored (Driven측 임피던스가 큼)
     */
    const s2 = states.state2;
    const s3 = states.state3;
    const s5 = states.state5;
    
    // 음향 임피던스 (ρa)
    const Z2 = s2.rho * s2.a;  // State 2 (충격파 후 - Driven gas)
    const Z3 = s3.rho * s3.a;  // State 3 (접촉면 - Driver gas)
    const Z5 = s5.rho * s5.a;  // State 5 (반사 충격파 후 - 참고용)
    
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


function findTailoredCompositionForMach(M, p1, t1, t4, drivenProps) {
    /**
     * 주어진 마하수에서 테일러드가 되는 Air/He 조성 찾기
     */
    const results = [];
    let bestX = null;
    let bestTau = Infinity;
    
    // 0% ~ 100% He 스캔
    for (let i = 0; i <= 100; i++) {
        const X_He = i / 100;
        
        try {
            const driverProps = calcMixtureProperties(X_He);
            
            // p4 계산
            const p4 = calcP4FromMach(M, p1, t1, t4, drivenProps, driverProps);
            
            if (!isFinite(p4) || p4 <= 0) continue;
            
            // 상태 계산
            const states = calcShockTube(M, p1, t1, p4, t4, drivenProps, driverProps);
            
            // State 3 체크 (p3 < p4 필요)
            if (states.state3.p >= p4) continue;
            
            // 테일러드 파라미터 계산
            const tailored = calcTailoredParameter(states);
            
            results.push({
                X_He: X_He,
                tau: tailored.tau,
                p4_bar: p4 / 1e5,
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
    
    // 최적 조성
    let optimal = null;
    if (bestX !== null) {
        const bestProps = calcMixtureProperties(bestX);
        optimal = {
            X_He: bestX,
            composition: `Air ${((1 - bestX) * 100).toFixed(1)}% / He ${(bestX * 100).toFixed(1)}%`,
            gamma: bestProps.gamma,
            mw: bestProps.mw,
            tau: bestTau,
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
    const driverGas = document.getElementById('driver-gas').value;
    const mixRow = document.getElementById('mix-ratio-row');
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
        const drivenP = parseFloat(document.getElementById('driven-p').value) * 101325; // atm → Pa
        const drivenT = parseFloat(document.getElementById('driven-t').value);
        
        const initialMach = parseFloat(document.getElementById('initial-mach').value);
        
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
        
        // 전체 상태 계산
        const states = calcShockTube(result.M, drivenP, drivenT, driverP, driverT, drivenProps, driverProps);
        
        // 테일러드 분석
        const tailored = calcTailoredParameter(states);
        displayTailoredResult(tailored);
        
        // 결과 표시
        displayResults(states, driverProps, drivenProps);
        
        // 조성 탐색 섹션 숨김
        document.getElementById('composition-section').style.display = 'none';
        
    } catch (error) {
        console.error(error);
        alert('계산 중 오류가 발생했습니다: ' + error.message);
    }
}


function displayTailoredResult(tailored) {
    const section = document.getElementById('tailored-section');
    const resultDiv = document.getElementById('tailored-result');
    
    section.style.display = 'block';
    
    // tau 값 색상 결정
    let tauColorClass = '';
    if (Math.abs(tailored.tau) < 0.15) {
        tauColorClass = 'tailored';
    } else if (tailored.tau > 0) {
        tauColorClass = 'positive';
    } else {
        tauColorClass = 'negative';
    }
    
    resultDiv.innerHTML = `
        <div class="tailored-card status-${tailored.statusClass}">
            <div class="icon">${tailored.status.split(' ')[0]}</div>
            <div class="label">테일러드 파라미터 τ = Z₃/Z₂ - 1</div>
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
            <div class="label">Z₂ (State 2, Driven)</div>
            <div class="value">${tailored.Z2.toFixed(1)}</div>
            <div class="status">kg/(m²·s)</div>
        </div>
        <div class="tailored-card">
            <div class="icon">🔊</div>
            <div class="label">Z₃ (State 3, Driver)</div>
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
                </div>
            `;
        }
    }
    
    resultsDiv.innerHTML = html;
}


function findTailoredComposition() {
    try {
        // 입력값 읽기
        const driverP = parseFloat(document.getElementById('driver-p').value) * 1e5;
        const driverT = parseFloat(document.getElementById('driver-t').value);
        
        const drivenGas = document.getElementById('driven-gas').value;
        const drivenP = parseFloat(document.getElementById('driven-p').value) * 101325;
        const drivenT = parseFloat(document.getElementById('driven-t').value);
        
        const initialMach = parseFloat(document.getElementById('initial-mach').value);
        
        const drivenProps = getGasProperties(drivenGas);
        
        // 먼저 현재 조건에서 마하수 추정 (Air 기준)
        const airProps = getGasProperties('air');
        const machResult = findMachFromP4(driverP, drivenP, drivenT, driverT, drivenProps, airProps, initialMach);
        
        if (!machResult.converged) {
            alert('마하수 계산이 수렴하지 않았습니다. 초기 마하수를 조절해보세요.');
            return;
        }
        
        const M = machResult.M;
        
        // 테일러드 조성 탐색
        const composition = findTailoredCompositionForMach(M, drivenP, drivenT, driverT, drivenProps);
        
        // 결과 표시
        displayCompositionResult(composition, M);
        
        // 수렴 정보 업데이트
        const convInfo = document.getElementById('convergence-info');
        convInfo.className = 'convergence-info success';
        convInfo.innerHTML = `🎯 조성 탐색 완료 | 기준 Mach = ${M.toFixed(4)}`;
        
    } catch (error) {
        console.error(error);
        alert('조성 탐색 중 오류가 발생했습니다: ' + error.message);
    }
}


function displayCompositionResult(composition, M) {
    const section = document.getElementById('composition-section');
    const resultDiv = document.getElementById('composition-result');
    
    section.style.display = 'block';
    
    if (composition.optimal) {
        const opt = composition.optimal;
        resultDiv.innerHTML = `
            <div class="optimal-composition">
                <h3>🎯 최적 테일러드 조성 (M = ${M.toFixed(3)})</h3>
                <div class="comp-value">${opt.composition}</div>
                <div class="comp-details">
                    <div>γ = <span>${opt.gamma.toFixed(4)}</span></div>
                    <div>MW = <span>${opt.mw.toFixed(2)}</span> kg/kmol</div>
                    <div>τ = <span>${(opt.tau * 100).toFixed(2)}%</span></div>
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
    
    // 캔버스 크기 설정 (고해상도 대응)
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
    
    // 그리드 그리기
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    
    // 수평선 (τ = 0)
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
    ctx.fillText(`최적: He ${(optResult.X_He * 100).toFixed(0)}% (τ = ${(optResult.tau * 100).toFixed(2)}%)`, padding.left + 10, padding.top + 15);
}


// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    toggleMixRatio();
});

