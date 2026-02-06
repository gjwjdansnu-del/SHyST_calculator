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
    
    // 선택된 탭 활성화
    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
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
    const hasRequiredData = after.p1_avg && after.t1_avg && after.p5_avg && after.shockSpeed;
    
    if (!hasRequiredData) {
        document.getElementById('calc-data-check').style.display = 'block';
        document.getElementById('calc-input-section').style.display = 'none';
        return;
    }
    
    // 데이터가 있으면 입력 섹션 표시
    document.getElementById('calc-data-check').style.display = 'none';
    document.getElementById('calc-input-section').style.display = 'block';
    
    document.getElementById('calc-p1').value = after.p1_avg || '';
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
    const p1_bar = currentExperiment.after.labviewLog.p1_avg;
    const t1_k = currentExperiment.after.labviewLog.t1_avg;
    const p5s_bar = currentExperiment.after.labviewLog.p5_avg;
    const shockSpeed = currentExperiment.after.labviewLog.shockSpeed;
    const targetMach = currentExperiment.before.expInfo.targetMach;
    
    if (!p1_bar || !t1_k || !p5s_bar || !shockSpeed) {
        alert('실험 후 데이터(p1, T1, p5_avg, shock_speed)를 먼저 입력해주세요.\n\n데이터 후처리 탭에서 먼저 처리를 완료해주세요.');
        return;
    }
    
    // 단위 변환
    const p1 = p1_bar * 1e5; // Pa
    const t1 = t1_k; // K (이미 K 단위)
    const p5s = p5s_bar * 1e5; // Pa
    
    const drivenGas = currentExperiment.before.shystSetting.drivenGas;
    const driverGas = currentExperiment.before.shystSetting.driverGas;
    
    try {
        // 가스 물성치
        const drivenProps = getGasProperties(drivenGas);
        const driverProps = getGasProperties(driverGas);
        
        const mw1 = drivenProps.mw;
        const R1 = R_universal / mw1;
        const isMix = drivenProps.X_He !== undefined;
        
        // Stage 1: Driven 초기
        const g1 = isMix ? calcGammaFromT_mix(t1, drivenProps.X_He) : calcGammaFromT(t1, drivenGas);
        const a1 = Math.sqrt(g1 * R1 * t1);
        const rho1 = p1 / (R1 * t1);
        const cp1 = isMix ? calcCpFromT_mix(t1, drivenProps.X_He, mw1) : calcCpFromT(t1, drivenGas, mw1);
        const h1 = cp1 * t1;
        const s1 = cp1 * Math.log(t1) - R1 * Math.log(p1);
        
        const stage1 = {
            p: p1, t: t1, rho: rho1, u: 0, h: h1, R: R1,
            gamma: g1, cp: cp1, a: a1, s: s1, V: 0, M: 0
        };
        
        // 충격파 마하수
        const M = shockSpeed / a1;
        
        // Stage 2: 충격파 후
        const state2Raw = calcIncidentShock(M, p1, t1, drivenGas, mw1, R1, isMix ? drivenProps.X_He : null);
        const g2 = isMix ? calcGammaFromT_mix(state2Raw.t, drivenProps.X_He) : calcGammaFromT(state2Raw.t, drivenGas);
        const cp2 = isMix ? calcCpFromT_mix(state2Raw.t, drivenProps.X_He, mw1) : calcCpFromT(state2Raw.t, drivenGas, mw1);
        const a2 = Math.sqrt(g2 * R1 * state2Raw.t);
        const h2 = cp2 * state2Raw.t;
        const s2 = cp2 * Math.log(state2Raw.t) - R1 * Math.log(state2Raw.p);
        
        const stage2 = {
            p: state2Raw.p, t: state2Raw.t, rho: state2Raw.rho, u: state2Raw.u, h: h2, R: R1,
            gamma: g2, cp: cp2, a: a2, s: s2, V: state2Raw.u, M: state2Raw.u / a2
        };
        
        // Stage 4: Driver 초기 (p4는 측정 안 되므로 일단 null)
        const stage4 = null;
        
        // Stage 5: 반사 충격파 후
        const p2_p1 = state2Raw.p / p1;
        const state5Raw = calcReflectedShock(state2Raw.p, state2Raw.t, state2Raw.rho, state2Raw.u, p2_p1, drivenGas, mw1, R1, isMix ? drivenProps.X_He : null);
        const g5 = isMix ? calcGammaFromT_mix(state5Raw.t, drivenProps.X_He) : calcGammaFromT(state5Raw.t, drivenGas);
        const cp5 = isMix ? calcCpFromT_mix(state5Raw.t, drivenProps.X_He, mw1) : calcCpFromT(state5Raw.t, drivenGas, mw1);
        const a5 = Math.sqrt(g5 * R1 * state5Raw.t);
        const h5 = cp5 * state5Raw.t;
        const s5 = cp5 * Math.log(state5Raw.t) - R1 * Math.log(state5Raw.p);
        
        const stage5 = {
            p: state5Raw.p, t: state5Raw.t, rho: state5Raw.rho, u: 0, h: h5, R: R1,
            gamma: g5, cp: cp5, a: a5, s: s5, V: 0, M: 0
        };
        
        // Stage 5s: 측정 압력 기준 안정화 (단열 과정)
        const p5s_p5 = p5s / state5Raw.p;
        let t5s = state5Raw.t * Math.pow(p5s_p5, (g5 - 1) / g5);
        
        for (let iter = 0; iter < 5; iter++) {
            const g5s = isMix ? calcGammaFromT_mix(t5s, drivenProps.X_He) : calcGammaFromT(t5s, drivenGas);
            t5s = state5Raw.t * Math.pow(p5s_p5, (g5s - 1) / g5s);
        }
        
        const g5s = isMix ? calcGammaFromT_mix(t5s, drivenProps.X_He) : calcGammaFromT(t5s, drivenGas);
        const rho5s = p5s / (R1 * t5s);
        const a5s = Math.sqrt(g5s * R1 * t5s);
        const cp5s = isMix ? calcCpFromT_mix(t5s, drivenProps.X_He, mw1) : calcCpFromT(t5s, drivenGas, mw1);
        const h5s = cp5s * t5s;
        const s5s = cp5s * Math.log(t5s) - R1 * Math.log(p5s);
        
        const stage5s = {
            p: p5s, t: t5s, rho: rho5s, u: 0, h: h5s, R: R1,
            gamma: g5s, cp: cp5s, a: a5s, s: s5s, V: 0, M: 0
        };
        
        // Stage 7: 등엔트로피 팽창
        const M7 = targetMach || 6.0;
        const state7 = calcState7(stage5s, M7, drivenProps, drivenGas);
        
        if (!state7) {
            alert('State 7 계산에 실패했습니다.');
            return;
        }
        
        // 결과 저장
        currentExperiment.calculation.stages = {
            stage1: stage1,
            stage2: stage2,
            stage4: stage4,
            stage5: stage5,
            stage5s: stage5s,
            stage7: state7
        };
        
        currentExperiment.status = 'completed';
        
        await saveExperiment(currentExperiment);
        
        alert('✅ 유동조건 계산이 완료되었습니다!');
        
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
    
    // Stage 4
    if (stages.stage4) {
        gridDiv.appendChild(createStageCard('Stage 4 (Driver 초기)', stages.stage4));
    }
    
    // Stage 5
    if (stages.stage5) {
        gridDiv.appendChild(createStageCard('Stage 5 (반사 충격파)', stages.stage5));
    }
    
    // Stage 5s
    if (stages.stage5s) {
        gridDiv.appendChild(createStageCard('Stage 5s (안정화)', stages.stage5s));
    }
    
    // Stage 7
    if (stages.stage7) {
        gridDiv.appendChild(createStageCard('Stage 7 (시험부)', stages.stage7));
    }
}

function createStageCard(title, state) {
    const card = document.createElement('div');
    card.className = 'stage-card';
    
    const properties = [
        { label: 'P [bar]', value: (state.p / 1e5).toFixed(4) },
        { label: 'T [K]', value: state.t ? state.t.toFixed(2) : 'N/A' },
        { label: 'ρ [kg/m³]', value: state.rho ? state.rho.toFixed(4) : 'N/A' },
        { label: 'u [m/s]', value: state.u !== undefined ? state.u.toFixed(2) : 'N/A' },
        { label: 'a [m/s]', value: state.a ? state.a.toFixed(2) : 'N/A' },
        { label: 'γ', value: state.gamma ? state.gamma.toFixed(4) : 'N/A' },
        { label: 'cp [J/kg·K]', value: state.cp ? state.cp.toFixed(1) : 'N/A' }
    ];
    
    if (state.M !== undefined) {
        properties.unshift({ label: 'M', value: state.M.toFixed(2) });
    }
    
    if (state.Re_unit_e6) {
        properties.push({ label: 'Re/m [×10⁶]', value: state.Re_unit_e6.toFixed(2) });
    }
    
    if (state.H0_MJ) {
        properties.push({ label: 'h_tot [MJ/kg]', value: state.H0_MJ.toFixed(3) });
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

function generateReport() {
    if (!currentExperiment) {
        alert('실험 데이터가 없습니다.');
        return;
    }
    
    const summaryDiv = document.getElementById('summary-content');
    
    let html = '<div class="summary-sections">';
    
    // 실험 정보
    html += '<div class="summary-section">';
    html += '<h3>📋 실험 정보</h3>';
    html += `<p><strong>실험 번호:</strong> ${currentExperiment.expNumber}</p>`;
    html += `<p><strong>날짜:</strong> ${currentExperiment.before.expInfo.date}</p>`;
    html += `<p><strong>실험자:</strong> ${currentExperiment.before.expInfo.name}</p>`;
    html += `<p><strong>모델:</strong> ${currentExperiment.before.expInfo.testModel}</p>`;
    html += `<p><strong>목적:</strong> ${currentExperiment.before.expInfo.objective}</p>`;
    html += '</div>';
    
    // 계산 결과
    if (currentExperiment.calculation.stages.stage7) {
        const s7 = currentExperiment.calculation.stages.stage7;
        html += '<div class="summary-section">';
        html += '<h3>🚀 최종 유동 조건 (State 7)</h3>';
        html += `<p><strong>마하수:</strong> ${s7.M.toFixed(2)}</p>`;
        html += `<p><strong>레이놀즈수:</strong> ${s7.Re_unit_e6.toFixed(2)} ×10⁶/m</p>`;
        html += `<p><strong>토탈 엔탈피:</strong> ${s7.H0_MJ.toFixed(3)} MJ/kg</p>`;
        html += `<p><strong>온도:</strong> ${s7.t.toFixed(0)} K</p>`;
        html += `<p><strong>압력:</strong> ${(s7.p / 1e5).toFixed(4)} bar</p>`;
        html += '</div>';
    }
    
    html += '</div>';
    
    summaryDiv.innerHTML = html;
}
