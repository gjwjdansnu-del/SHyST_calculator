// ============================================
// SHyST 실험 로거 - 메인 애플리케이션
// ============================================

let currentExperiment = null;
let currentExperimentId = null;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    // 데이터베이스 초기화 대기
    await initDatabase();
    
    // 첫 접속 시 자동으로 기존 데이터 가져오기
    await autoImportDataIfEmpty();
    
    // 새 실험 생성 (이전 실험 데이터 기본값으로 로드)
    await createNewExperiment();
    
    // 오늘 날짜 설정
    document.getElementById('exp-date').valueAsDate = new Date();
    
    // 입력 필드에 포커스 이벤트 추가 (클릭하면 편집 가능)
    addInputFocusHandlers();
});

// 자동 데이터 가져오기 (DB가 비어있을 때만)
async function autoImportDataIfEmpty() {
    try {
        const experiments = await loadAllExperiments();
        
        // DB가 비어있으면 자동으로 가져오기
        if (experiments.length === 0) {
            console.log('🔄 DB가 비어있습니다. 기존 데이터를 자동으로 가져옵니다...');
            
            const result = await importExperimentsFromJSON();
            
            console.log(`✅ 자동 가져오기 완료: ${result.imported}개 실험 저장`);
        } else {
            console.log(`✅ 기존 데이터 확인: ${experiments.length}개 실험`);
        }
    } catch (e) {
        console.error('⚠️ 자동 가져오기 실패:', e);
        // 실패해도 계속 진행
    }
}

// ============================================
// 탭 전환
// ============================================

function switchTab(tabName) {
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 모든 탭 컨텐츠 숨기기
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 선택된 탭 버튼·컨텐츠 활성화 (프로그래밍 호출 시 event 없음 → tabName으로 찾음)
    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');
    
    // 계산 탭으로 전환 시 입력값 자동 로드
    if (tabName === 'calculation') {
        loadCalculationInputs();
    }
}

function loadCalculationInputs() {
    if (!currentExperiment) {
        document.getElementById('calc-data-check').style.display = 'block';
        document.getElementById('calc-input-section').style.display = 'none';
        return;
    }
    
    const after = currentExperiment.after?.labviewLog || {};
    const before = currentExperiment.before || {};
    
    // 필수 데이터 체크
    const hasRequiredData = after.t1_avg !== undefined && after.t1_avg !== null && 
                           after.p5_avg && after.shockSpeed && 
                           before.shystSetting?.drivenPressure !== undefined;
    
    if (!hasRequiredData) {
        document.getElementById('calc-data-check').style.display = 'block';
        document.getElementById('calc-input-section').style.display = 'none';
        return;
    }
    
    // 데이터가 있으면 입력 섹션 표시
    document.getElementById('calc-data-check').style.display = 'none';
    document.getElementById('calc-input-section').style.display = 'block';
    
    // p1은 실험 전 드리븐 압력[barg] + 1 bar
    const p1_calculated = 1.0 + (before.shystSetting?.drivenPressure || 0);
    
    document.getElementById('calc-p1').value = p1_calculated.toFixed(4);
    document.getElementById('calc-t1').value = after.t1_avg || '';
    document.getElementById('calc-p5s').value = after.p5_avg || '';
    document.getElementById('calc-shock-speed').value = after.shockSpeed || '';
    document.getElementById('calc-target-mach').value = before.expInfo?.targetMach || '';
    document.getElementById('calc-driven-gas').value = before.shystSetting?.drivenGas || '';
}

// ============================================
// 실험 관리
// ============================================

async function createNewExperiment() {
    currentExperiment = createExperimentData();
    currentExperiment.expNumber = await getNextExpNumber();
    currentExperimentId = null;
    
    // 가장 최근 실험 데이터 가져오기
    const lastExperiment = await getLastExperiment();
    
    if (lastExperiment) {
        // 이전 실험 데이터를 기본값으로 복사 (실험 번호와 날짜는 제외)
        currentExperiment.before.expInfo.name = lastExperiment.before.expInfo.name;
        currentExperiment.before.expInfo.testModel = lastExperiment.before.expInfo.testModel;
        currentExperiment.before.expInfo.objective = lastExperiment.before.expInfo.objective;
        currentExperiment.before.expInfo.targetMach = lastExperiment.before.expInfo.targetMach;
        
        // SHyST 설정 복사
        currentExperiment.before.shystSetting = { ...lastExperiment.before.shystSetting };
        
        // 시각화 설정 복사
        currentExperiment.before.visualizationSetting = { ...lastExperiment.before.visualizationSetting };
        
        // 카메라 설정 복사
        currentExperiment.before.cameraSetting = { ...lastExperiment.before.cameraSetting };
        
        console.log('Loaded defaults from last experiment:', lastExperiment.expNumber);
    } else {
        // 첫 실험인 경우 기본값 설정
        currentExperiment.before.visualizationSetting.method = 'Z-type Schlieren';
    }
    
    // UI 업데이트
    document.getElementById('exp-number').value = currentExperiment.expNumber;
    document.getElementById('exp-number').placeholder = `실험 #${currentExperiment.expNumber}`;
    
    // 기본값을 UI에 표시
    loadBeforeDataToUI();
    
    console.log('New experiment created:', currentExperiment);
}

async function loadExperimentById(id) {
    try {
        currentExperiment = await loadExperiment(id);
        currentExperimentId = id;
        
        // UI에 데이터 로드
        loadBeforeDataToUI();
        loadProcessingDataToUI();
        loadCalculationDataToUI();
        
        console.log('Experiment loaded:', currentExperiment);
    } catch (e) {
        console.error('Failed to load experiment:', e);
        alert('실험 데이터를 불러오는데 실패했습니다.');
    }
}

// ============================================
// Before Experiment 저장/로드
// ============================================

async function saveBeforeData() {
    if (!currentExperiment) {
        await createNewExperiment();
    }
    
    // UI에서 데이터 수집
    currentExperiment.before.expInfo = {
        name: document.getElementById('exp-name').value,
        date: document.getElementById('exp-date').value,
        testModel: document.getElementById('test-model').value,
        objective: document.getElementById('objective').value,
        targetMach: parseFloat(document.getElementById('target-mach').value) || null
    };
    
    currentExperiment.before.shystSetting = {
        airPressure: parseFloat(document.getElementById('air-pressure').value) || null,
        airTemp: parseFloat(document.getElementById('air-temp').value) || null,
        airHumidity: parseFloat(document.getElementById('air-humidity').value) || null,
        driverGas: document.getElementById('driver-gas').value,
        boosterPressure: parseFloat(document.getElementById('booster-pressure').value) || null,
        firstDiaphragm: document.getElementById('first-diaphragm').value,
        secondDiaphragm: document.getElementById('second-diaphragm').value,
        drivenGas: document.getElementById('driven-gas').value,
        drivenPressure: parseFloat(document.getElementById('driven-pressure').value) || null,
        drivenTemp: parseFloat(document.getElementById('driven-temp').value) || null,
        vacuumGauge: parseFloat(document.getElementById('vacuum-gauge').value) || null,
        daqSampling: parseFloat(document.getElementById('daq-sampling').value) || 1000000
    };
    
    currentExperiment.before.visualizationSetting = {
        method: document.getElementById('visualization-method').value,
        target: document.getElementById('visualization-target').value
    };
    
    currentExperiment.before.cameraSetting = {
        model: document.getElementById('camera-model').value,
        fps: parseFloat(document.getElementById('camera-fps').value) || null,
        width: parseInt(document.getElementById('camera-width').value) || null,
        height: parseInt(document.getElementById('camera-height').value) || null,
        lensFocal: document.getElementById('lens-focal').value,
        exposeTime: parseFloat(document.getElementById('expose-time').value) || null
    };
    
    // 상태 업데이트
    if (currentExperiment.status === 'pending') {
        currentExperiment.status = 'before_complete';
    }
    
    // 데이터베이스에 저장
    try {
        const id = await saveExperiment(currentExperiment);
        if (!currentExperimentId) {
            currentExperimentId = id;
            currentExperiment.id = id;
        }
        
        alert('✅ 실험 전 데이터가 저장되었습니다.');
        console.log('Before data saved:', currentExperiment);
    } catch (e) {
        console.error('Failed to save:', e);
        alert('❌ 저장 실패: ' + e.message);
    }
}

function loadBeforeDataToUI() {
    if (!currentExperiment) return;
    
    const before = currentExperiment.before;
    
    // Exp Info
    document.getElementById('exp-number').value = currentExperiment.expNumber || '';
    document.getElementById('exp-name').value = before.expInfo.name || '';
    document.getElementById('exp-date').value = before.expInfo.date || '';
    document.getElementById('test-model').value = before.expInfo.testModel || '';
    document.getElementById('objective').value = before.expInfo.objective || '';
    document.getElementById('target-mach').value = before.expInfo.targetMach || '';
    
    // SHyST Setting
    document.getElementById('air-pressure').value = before.shystSetting.airPressure || '';
    document.getElementById('air-temp').value = before.shystSetting.airTemp || '';
    document.getElementById('air-humidity').value = before.shystSetting.airHumidity || '';
    document.getElementById('driver-gas').value = before.shystSetting.driverGas || '';
    document.getElementById('booster-pressure').value = before.shystSetting.boosterPressure || '';
    document.getElementById('first-diaphragm').value = before.shystSetting.firstDiaphragm || '';
    document.getElementById('second-diaphragm').value = before.shystSetting.secondDiaphragm || '';
    // 드리븐 가스 (대소문자 처리)
    const drivenGas = (before.shystSetting.drivenGas || 'air').toLowerCase();
    document.getElementById('driven-gas').value = drivenGas;
    document.getElementById('driven-pressure').value = before.shystSetting.drivenPressure || '';
    document.getElementById('driven-temp').value = before.shystSetting.drivenTemp || '';
    document.getElementById('vacuum-gauge').value = before.shystSetting.vacuumGauge || '';
    document.getElementById('daq-sampling').value = before.shystSetting.daqSampling || 1000000;
    
    // Visualization Setting
    document.getElementById('visualization-method').value = before.visualizationSetting.method || 'Z-type Schlieren';
    document.getElementById('visualization-target').value = before.visualizationSetting.target || '';
    
    // Camera Setting
    document.getElementById('camera-model').value = before.cameraSetting.model || '';
    document.getElementById('camera-fps').value = before.cameraSetting.fps || '';
    document.getElementById('camera-width').value = before.cameraSetting.width || '';
    document.getElementById('camera-height').value = before.cameraSetting.height || '';
    document.getElementById('lens-focal').value = before.cameraSetting.lensFocal || '';
    document.getElementById('expose-time').value = before.cameraSetting.exposeTime || '';
}

// ============================================
// Processing 저장/로드
// ============================================

async function saveProcessingData() {
    if (!currentExperiment) {
        alert('먼저 실험 전 데이터를 저장해주세요.');
        return;
    }
    
    const processed = (typeof processedResults !== 'undefined' && processedResults?.measurements)
        ? processedResults.measurements
        : null;
    
    const t1FromBefore = currentExperiment?.before?.shystSetting?.drivenTemp ?? currentExperiment?.before?.shystSetting?.airTemp ?? null;
    const t1Value = parseFloat(document.getElementById('t1-avg').value) || processed?.t1_avg || t1FromBefore || null;
    
    // UI에서 데이터 수집
    currentExperiment.after.labviewLog = {
        p1_avg: parseFloat(document.getElementById('p1-avg').value) || processed?.p1_avg || null,
        t1_avg: t1Value,
        p4_avg: parseFloat(document.getElementById('p4-avg').value) || processed?.p4_avg || null,
        p4_std: parseFloat(document.getElementById('p4-std').value) || processed?.p4_std || null,
        t4_avg: parseFloat(document.getElementById('t4-avg').value) || processed?.t4_avg || null,
        p5_avg: parseFloat(document.getElementById('p5-avg').value) || processed?.p5_avg || null,
        p5_std: parseFloat(document.getElementById('p5-std').value) || processed?.p5_std || null,
        testTime: parseFloat(document.getElementById('test-time').value) || processed?.test_time || null,
        shockSpeed: parseFloat(document.getElementById('shock-speed').value) || processed?.shock_speed || null,
        outputDelayTime: processed?.output_delay_time ?? null,
        outputReadyTime: processed?.output_ready_time ?? null,
        firstDiaphragmRupture: processed?.first_diaphragm_rupture ?? null,
        secondDiaphragmRupture: processed?.second_diaphragm_rupture ?? null,
        testTimeStart: processed?.test_time_start ?? null,
        testTimeEnd: processed?.test_time_end ?? null,
        modelFrontTime: processed?.model_front_time ?? null
    };
    
    currentExperiment.status = 'processing_complete';
    
    try {
        await saveExperiment(currentExperiment);
        alert('✅ 후처리 데이터가 저장되었습니다.');
    } catch (e) {
        console.error('Failed to save:', e);
        alert('❌ 저장 실패: ' + e.message);
    }
}

function loadProcessingDataToUI() {
    if (!currentExperiment) return;
    
    const after = currentExperiment.after;
    
    document.getElementById('p1-avg').value = after.labviewLog.p1_avg || '';
    document.getElementById('t1-avg').value = after.labviewLog.t1_avg || '';
    document.getElementById('p4-avg').value = after.labviewLog.p4_avg || '';
    document.getElementById('p4-std').value = after.labviewLog.p4_std || '';
    document.getElementById('t4-avg').value = after.labviewLog.t4_avg || '';
    document.getElementById('p5-avg').value = after.labviewLog.p5_avg || '';
    document.getElementById('p5-std').value = after.labviewLog.p5_std || '';
    document.getElementById('test-time').value = after.labviewLog.testTime || '';
    document.getElementById('shock-speed').value = after.labviewLog.shockSpeed || '';
}

// ============================================
// Calculation
// ============================================

async function calculateFlowConditions() {
    if (!currentExperiment) {
        alert('먼저 실험 데이터를 입력해주세요.');
        return;
    }
    
    // 입력값 수집
    // p1은 실험 전 입력한 드리븐 압력[barg] + 1 bar (절대압)
    const drivenPressureBarg = currentExperiment.before.shystSetting.drivenPressure || 0;
    const p1_bar = 1.0 + drivenPressureBarg;  // [bar] 절대압
    
    const t1_celsius = currentExperiment.after.labviewLog.t1_avg;  // °C 단위!
    const p5s_bar = currentExperiment.after.labviewLog.p5_avg;
    const shockSpeed = currentExperiment.after.labviewLog.shockSpeed;
    const targetMach = currentExperiment.before.expInfo.targetMach;
    
    if (t1_celsius === undefined || t1_celsius === null || !p5s_bar || !shockSpeed) {
        alert('실험 후 데이터(T1, p5_avg, shock_speed)를 먼저 입력해주세요.\n\n데이터 후처리 탭에서 먼저 처리를 완료해주세요.');
        return;
    }
    
    if (drivenPressureBarg === undefined || drivenPressureBarg === null) {
        alert('실험 전 정보에서 드리븐 압력[barg]을 먼저 입력해주세요.');
        return;
    }
    
    // 단위 변환
    const p1 = p1_bar * 1e5; // bar → Pa
    const T1 = t1_celsius + 273.15; // °C → K
    const pe = p5s_bar * 1e5; // bar → Pa
    const Vs = shockSpeed; // m/s
    
    const drivenGas = currentExperiment.before.shystSetting.drivenGas;
    const M7_target = targetMach || 6.0;
    
    try {
        console.log('='.repeat(60));
        console.log('ESTCN-style Flow Condition Calculation');
        console.log('='.repeat(60));
        console.log(`Input: gas=${drivenGas}, p1=${p1} Pa, T1=${T1} K, Vs=${Vs} m/s, pe=${pe} Pa, M7=${M7_target}`);
        
        // ========================================
        // ESTCN 방식 계산 시작
        // ========================================
        
        // State 1: Pre-shock condition
        const state1 = new GasState(drivenGas);
        state1.set_pT(p1, T1);
        console.log('State 1: pre-shock condition');
        state1.write_state();
        
        // State 2: Post-incident-shock condition
        console.log('Start incident-shock calculation.');
        const state2 = new GasState(drivenGas);
        state2.set_pT(p1, T1);
        const [V2, Vg] = normal_shock(state1, Vs, state2);
        console.log('State 2: post-shock condition.');
        state2.write_state();
        console.log(`  V2: ${V2.toFixed(3)} m/s, Vg: ${Vg.toFixed(3)} m/s`);
        
        // State 5: Reflected-shock condition
        console.log('Start reflected-shock calculation.');
        const state5 = new GasState(drivenGas);
        state5.set_pT(state2.p, state2.T);
        const Vr = reflected_shock(state2, Vg, state5);
        console.log('State 5: reflected-shock condition.');
        state5.write_state();
        console.log(`  Vr: ${Vr.toFixed(3)} m/s`);
        
        // State 5s: Equilibrium condition (isentropic relaxation to pe)
        console.log('Start calculation of isentropic relaxation.');
        const state5s = state5.clone();
        let V5s = 0;
        
        if (pe && Math.abs(pe - state5.p) > 1) {
            // Isentropic expansion from state5 (stagnation) to pe
            const p_ratio = pe / state5.p;
            const [expanded_state, V_expanded] = expand_from_stagnation(p_ratio, state5);
            
            // Copy properties
            state5s.p = expanded_state.p;
            state5s.T = expanded_state.T;
            state5s.rho = expanded_state.rho;
            state5s.h = expanded_state.h;
            state5s.e = expanded_state.e;
            state5s.s = expanded_state.s;
            state5s.a = expanded_state.a;
            state5s.gam = expanded_state.gam;
            state5s.Cp = expanded_state.Cp;
            state5s.mu = expanded_state.mu;
            V5s = V_expanded;
        }
        
        console.log('State 5s: equilibrium condition (relaxation to pe)');
        state5s.write_state();
        
        // Enthalpy difference (H5s - H1)
        const H5s_H1 = state5s.h - state1.h;
        console.log(`Enthalpy difference (H5s - H1): ${H5s_H1.toExponential(5)} J/kg = ${(H5s_H1 / 1e6).toFixed(4)} MJ/kg`);
        
        // State 6: Nozzle throat (M = 1)
        console.log('Start isentropic relaxation to throat (Mach 1)');
        const { state6, V6, mflux6 } = expansion_to_throat(state5s);
        const M6 = V6 / state6.a;
        console.log('State 6: Nozzle-throat condition (relaxation to M=1)');
        state6.write_state();
        console.log(`  V6: ${V6.toFixed(2)} m/s, M6: ${M6.toFixed(6)}, mflux6: ${mflux6.toFixed(1)} kg/s/m²`);
        
        // State 7: Nozzle exit (target Mach)
        console.log(`Start isentropic relaxation to nozzle exit (M=${M7_target})`);
        const { state7, V7 } = expansion_to_mach(state5s, M7_target);
        const M7_calc = V7 / state7.a;
        const mflux7 = state7.rho * V7;
        console.log('State 7: Nozzle-exit condition');
        state7.write_state();
        console.log(`  V7: ${V7.toFixed(2)} m/s, M7: ${M7_calc.toFixed(5)}, mflux7: ${mflux7.toFixed(1)} kg/s/m²`);
        
        // Pitot pressure calculation
        let pitot7;
        if (M7_calc > 1) {
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
        console.log(`  pitot: ${pitot7.toExponential(5)} Pa, pitot7_on_p5s: ${(pitot7 / state5s.p).toFixed(6)}`);
        
        console.log('Done with reflected shock tube calculation.');
        console.log('='.repeat(60));
        
        // ========================================
        // 결과 변환 (기존 형식으로)
        // ========================================
        
        // Total enthalpy calculations
        const h1_total = state1.h;  // u1 = 0
        const h2_total = state2.h + 0.5 * Vg * Vg;
        const h5_total = state5.h;  // u5 = 0 (stagnation)
        const h5s_total = state5s.h + 0.5 * V5s * V5s;  // Should equal h5_total
        const h6_total = state6.h + 0.5 * V6 * V6;
        const h7_total = state7.h + 0.5 * V7 * V7;
        
        // Unit Reynolds number calculations
        const Re_unit1 = 0;  // u1 = 0
        const Re_unit2 = (state2.rho * Vg) / state2.mu;
        const Re_unit5 = 0;  // u5 = 0
        const Re_unit5s = (state5s.rho * V5s) / state5s.mu;
        const Re_unit6 = (state6.rho * V6) / state6.mu;
        const Re_unit7 = (state7.rho * V7) / state7.mu;
        
        // 결과 저장 (기존 형식 유지)
        currentExperiment.calculation.stages = {
            stage1: {
                p: state1.p, t: state1.T, rho: state1.rho, u: 0,
                h: state1.h, h_total: h1_total / 1e6, R: state1.R,
                gamma: state1.gam, cp: state1.Cp, a: state1.a, s: state1.s,
                V: 0, M: 0, mu: state1.mu, Re_unit: Re_unit1 / 1e6
            },
            stage2: {
                p: state2.p, t: state2.T, rho: state2.rho, u: Vg,
                h: state2.h, h_total: h2_total / 1e6, R: state2.R,
                gamma: state2.gam, cp: state2.Cp, a: state2.a, s: state2.s,
                V: Vg, M: Vg / state2.a, V2: V2, Vg: Vg,
                mu: state2.mu, Re_unit: Re_unit2 / 1e6
            },
            stage5: {
                p: state5.p, t: state5.T, rho: state5.rho, u: 0,
                h: state5.h, h_total: h5_total / 1e6, R: state5.R,
                gamma: state5.gam, cp: state5.Cp, a: state5.a, s: state5.s,
                V: 0, M: 0, Vr: Vr,
                mu: state5.mu, Re_unit: Re_unit5 / 1e6
            },
            stage5s: {
                p: state5s.p, t: state5s.T, rho: state5s.rho, u: V5s,
                h: state5s.h, h_total: h5s_total / 1e6, R: state5s.R,
                gamma: state5s.gam, cp: state5s.Cp, a: state5s.a, s: state5s.s,
                V: V5s, M: V5s / state5s.a,
                mu: state5s.mu, Re_unit: Re_unit5s / 1e6,
                H5s_H1: H5s_H1, H5s_H1_MJ: H5s_H1 / 1e6
            },
            stage6: {
                p: state6.p, t: state6.T, rho: state6.rho, u: V6,
                h: state6.h, h_total: h6_total / 1e6, R: state6.R,
                gamma: state6.gam, cp: state6.Cp, a: state6.a, s: state6.s,
                V: V6, M: M6, mflux: mflux6,
                mu: state6.mu, Re_unit: Re_unit6 / 1e6
            },
            stage7: {
                p: state7.p, t: state7.T, rho: state7.rho, u: V7,
                h: state7.h, h_total: h7_total / 1e6, R: state7.R,
                gamma: state7.gam, cp: state7.Cp, a: state7.a, s: state7.s,
                V: V7, M: M7_calc, mflux: mflux7,
                mu: state7.mu, Re_unit: Re_unit7 / 1e6,
                pitot: pitot7, pitot_on_p5s: pitot7 / state5s.p
            }
        };
        
        // 추가 정보 저장
        currentExperiment.calculation.enthalpy_MJ = H5s_H1 / 1e6;
        currentExperiment.calculation.shock_speed = Vs;
        currentExperiment.calculation.reflected_shock_speed = Vr;
        
        currentExperiment.status = 'completed';
        
        await saveExperiment(currentExperiment);
        
        alert('✅ 유동조건 계산이 완료되었습니다!\n\n' +
              `엔탈피 (H5s - H1): ${(H5s_H1 / 1e6).toFixed(4)} MJ/kg\n` +
              `시험부 마하수: ${M7_calc.toFixed(3)}\n` +
              `시험부 속도: ${V7.toFixed(1)} m/s`);
        
        // 결과 표시
        displayCalculationResults(currentExperiment.calculation.stages);
        
    } catch (e) {
        console.error('Calculation error:', e);
        alert('계산 중 오류 발생: ' + e.message);
    }
}

function displayCalculationResults(stages) {
    const resultsDiv = document.getElementById('calculation-results');
    const gridDiv = document.getElementById('stages-results-grid');
    
    resultsDiv.style.display = 'block';
    gridDiv.innerHTML = '';
    
    // Stage 1
    if (stages.stage1) {
        gridDiv.appendChild(createStageCard('Stage 1 (Driven 초기)', stages.stage1));
    }
    
    // Stage 2
    if (stages.stage2) {
        gridDiv.appendChild(createStageCard('Stage 2 (충격파 후)', stages.stage2));
    }
    
    // Stage 5
    if (stages.stage5) {
        gridDiv.appendChild(createStageCard('Stage 5 (반사 충격파)', stages.stage5));
    }
    
    // Stage 5s
    if (stages.stage5s) {
        gridDiv.appendChild(createStageCard('Stage 5s (안정화)', stages.stage5s));
    }
    
    // Stage 6
    if (stages.stage6) {
        gridDiv.appendChild(createStageCard('Stage 6 (노즐 목, M=1)', stages.stage6));
    }
    
    // Stage 7
    if (stages.stage7) {
        gridDiv.appendChild(createStageCard('Stage 7 (시험부)', stages.stage7));
    }
}

function createStageCard(title, state) {
    const card = document.createElement('div');
    card.className = 'stage-card';
    
    const properties = [];
    
    if (state.M !== undefined && state.M !== 0) {
        properties.push({ label: 'M', value: state.M.toFixed(4) });
    }
    
    properties.push(
        { label: 'P [bar]', value: (state.p / 1e5).toFixed(4) },
        { label: 'T [K]', value: state.t ? state.t.toFixed(2) : 'N/A' },
        { label: 'ρ [kg/m³]', value: state.rho ? state.rho.toFixed(5) : 'N/A' },
        { label: 'u [m/s]', value: state.u !== undefined ? state.u.toFixed(2) : 'N/A' },
        { label: 'a [m/s]', value: state.a ? state.a.toFixed(2) : 'N/A' }
    );
    
    // 엔탈피 (h = e + p/rho)
    if (state.h !== undefined) {
        properties.push({ label: 'h [kJ/kg]', value: (state.h / 1000).toFixed(2) });
    }
    
    // 토탈 엔탈피 (h + 0.5*u^2)
    if (state.h_total !== undefined) {
        properties.push({ label: 'h_total [MJ/kg]', value: state.h_total.toFixed(4) });
    }
    
    // 엔트로피 (등엔트로피 과정 검증용)
    if (state.s !== undefined) {
        properties.push({ label: 's [J/kg·K]', value: state.s.toFixed(1) });
    }
    
    properties.push(
        { label: 'γ', value: state.gamma ? state.gamma.toFixed(4) : 'N/A' },
        { label: 'cp [J/kg·K]', value: state.cp ? state.cp.toFixed(1) : 'N/A' }
    );
    
    if (state.Re_unit !== undefined && state.Re_unit !== 0) {
        properties.push({ label: 'Re/m [×10⁶/m]', value: state.Re_unit.toFixed(3) });
    }
    
    // 특수 값들
    if (state.H5s_H1_MJ !== undefined) {
        properties.push({ label: '(H5s-H1) [MJ/kg]', value: state.H5s_H1_MJ.toFixed(4) });
    }
    
    if (state.pitot !== undefined) {
        properties.push({ label: 'pitot [bar]', value: (state.pitot / 1e5).toFixed(4) });
    }
    
    let html = `<h4>${title}</h4>`;
    properties.forEach(prop => {
        html += `
            <div class="stage-property">
                <span class="label">${prop.label}</span>
                <span class="value">${prop.value}</span>
            </div>
        `;
    });
    
    card.innerHTML = html;
    return card;
}

async function saveCalculationResults() {
    if (!currentExperiment) return;
    
    try {
        await saveExperiment(currentExperiment);
        alert('✅ 계산 결과가 저장되었습니다.');
    } catch (e) {
        console.error('Failed to save:', e);
        alert('❌ 저장 실패: ' + e.message);
    }
}

function loadCalculationDataToUI() {
    if (!currentExperiment || !currentExperiment.calculation.stages.stage1) return;
    
    displayCalculationResults(currentExperiment.calculation.stages);
}

// ============================================
// 실험 목록
// ============================================

async function showExperimentList() {
    const modal = document.getElementById('experiment-list-modal');
    modal.classList.add('active');
    
    await refreshExperimentList();
}

function closeExperimentList() {
    const modal = document.getElementById('experiment-list-modal');
    modal.classList.remove('active');
}

async function refreshExperimentList() {
    const tbody = document.getElementById('experiments-tbody');
    tbody.innerHTML = '';
    
    try {
        const experiments = await loadAllExperiments();
        
        // 실험 번호 내림차순 정렬 (최신 실험이 위로)
        experiments.sort((a, b) => b.expNumber - a.expNumber);
        
        experiments.forEach(exp => {
            const row = document.createElement('tr');
            
            const statusBadge = getStatusBadge(exp);
            const date = exp.before.expInfo.date || '미입력';
            const name = exp.before.expInfo.name || '미입력';
            const model = exp.before.expInfo.testModel || '미입력';
            const objective = exp.before.expInfo.objective || '미입력';
            const mach = exp.before.expInfo.targetMach || '-';
            
            row.innerHTML = `
                <td>${exp.expNumber}</td>
                <td>${date}</td>
                <td>${name}</td>
                <td>${model}</td>
                <td>${objective}</td>
                <td>${mach}</td>
                <td>${statusBadge}</td>
                <td class="action-btns">
                    <button class="action-btn" onclick="loadAndEditExperiment(${exp.id})">열기</button>
                    <button class="action-btn delete" onclick="confirmDeleteExperiment(${exp.id})">삭제</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
    } catch (e) {
        console.error('Failed to load experiments:', e);
        tbody.innerHTML = '<tr><td colspan="8">실험 목록을 불러오는데 실패했습니다.</td></tr>';
    }
}

function getStatusBadge(exp) {
    const p5Avg = exp?.after?.labviewLog?.p5_avg;
    const stage1p = exp?.calculation?.stages?.stage1?.p;
    
    if (Number.isFinite(stage1p)) {
        return '<span class="status-badge complete">완료</span>';
    }
    
    if (Number.isFinite(p5Avg)) {
        return '<span class="status-badge processing">후처리 완료</span>';
    }
    
    return '<span class="status-badge pending">후처리 전</span>';
}

async function loadAndEditExperiment(id) {
    await loadExperimentById(id);
    closeExperimentList();
    switchTab('before');
}

async function confirmDeleteExperiment(id) {
    if (confirm('정말로 이 실험을 삭제하시겠습니까?')) {
        try {
            await deleteExperiment(id);
            await refreshExperimentList();
        } catch (e) {
            console.error('Failed to delete:', e);
            alert('삭제 실패: ' + e.message);
        }
    }
}

function filterExperiments() {
    const searchTerm = document.getElementById('search-experiments').value.toLowerCase();
    const rows = document.querySelectorAll('#experiments-tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// ============================================
// 데이터 후처리 (간단한 구현)
// ============================================

function addSensorCalibration() {
    const list = document.getElementById('sensor-calibration-list');
    const item = document.createElement('div');
    item.className = 'sensor-calib-item';
    item.innerHTML = `
        <input type="text" placeholder="센서 이름 (예: PT1)">
        <input type="number" placeholder="기울기 (slope)" step="0.0001">
        <input type="number" placeholder="절편 (offset)" step="0.0001">
        <select>
            <option value="linear">Linear</option>
            <option value="polynomial">Polynomial</option>
        </select>
        <button onclick="this.parentElement.remove()">삭제</button>
    `;
    list.appendChild(item);
}

function applyTestTimeSelection() {
    const start = parseFloat(document.getElementById('test-start-time').value);
    const end = parseFloat(document.getElementById('test-end-time').value);
    
    if (isNaN(start) || isNaN(end) || start >= end) {
        alert('올바른 시간 범위를 입력해주세요.');
        return;
    }
    
    if (currentExperiment) {
        currentExperiment.after.selectedTestTime = {
            start: start,
            end: end,
            duration: end - start
        };
        
        document.getElementById('test-time').value = (end - start).toFixed(3);
    }
    
    alert(`시험시간이 ${(end - start).toFixed(3)} ms로 설정되었습니다.`);
}

// ============================================
// 입력 필드 포커스 핸들러
// ============================================

function addInputFocusHandlers() {
    // 모든 입력 필드에 대해 포커스 이벤트 추가
    const inputs = document.querySelectorAll('#tab-before input, #tab-before select');
    
    inputs.forEach(input => {
        // 초기 상태: 기본값이 있으면 읽기 전용 스타일 적용
        if (input.value && input.id !== 'exp-number' && input.id !== 'exp-date') {
            input.classList.add('has-default-value');
        }
        
        // 포커스 시: 편집 가능하도록 스타일 변경
        input.addEventListener('focus', function() {
            this.classList.remove('has-default-value');
        });
        
        // 포커스 아웃 시: 값이 있으면 기본값 스타일 유지
        input.addEventListener('blur', function() {
            if (this.value && this.id !== 'exp-number' && this.id !== 'exp-date') {
                this.classList.add('has-default-value');
            }
        });
    });
}

// ============================================
// 보고서 생성
// ============================================

// Summary 탭 제거됨
