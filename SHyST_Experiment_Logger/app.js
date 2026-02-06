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
    
    // UI에서 데이터 수집
    currentExperiment.after.labviewLog = {
        p1_avg: parseFloat(document.getElementById('p1-avg').value) || null,
        t1_avg: parseFloat(document.getElementById('t1-avg').value) || null,
        p4_avg: parseFloat(document.getElementById('p4-avg').value) || null,
        p4_std: parseFloat(document.getElementById('p4-std').value) || null,
        t4_avg: parseFloat(document.getElementById('t4-avg').value) || null,
        p5_avg: parseFloat(document.getElementById('p5-avg').value) || null,
        p5_std: parseFloat(document.getElementById('p5-std').value) || null,
        testTime: parseFloat(document.getElementById('test-time').value) || null,
        shockSpeed: parseFloat(document.getElementById('shock-speed').value) || null
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
    
    const method = document.querySelector('input[name="calc-method"]:checked').value;
    
    // 입력값 수집
    const p1_bar = currentExperiment.after.labviewLog.p1_avg;
    const t1_c = currentExperiment.after.labviewLog.t1_avg;
    const p4_bar = currentExperiment.after.labviewLog.p4_avg;
    const t4_c = currentExperiment.after.labviewLog.t4_avg;
    
    if (!p1_bar || !t1_c || !p4_bar || !t4_c) {
        alert('실험 후 데이터(p1, T1, p4, T4)를 먼저 입력해주세요.');
        switchTab('processing');
        return;
    }
    
    // 단위 변환
    const p1 = p1_bar * 1e5; // Pa
    const t1 = t1_c + 273.15; // K
    const p4 = p4_bar * 1e5; // Pa
    const t4 = t4_c + 273.15; // K
    
    const drivenGas = currentExperiment.before.shystSetting.drivenGas;
    const driverGas = currentExperiment.before.shystSetting.driverGas;
    
    try {
        // 가스 물성치
        const drivenProps = getGasProperties(drivenGas);
        const driverProps = getGasProperties(driverGas);
        
        // 마하수 계산
        const machResult = findMachFromP4(p4, p1, t1, t4, drivenProps, driverProps, 5.0);
        
        if (!machResult.converged) {
            alert('마하수 계산이 수렴하지 않았습니다.');
            return;
        }
        
        const M = machResult.M;
        
        // 전체 상태 계산
        const states = calcShockTube(M, p1, t1, p4, t4, drivenProps, driverProps, drivenGas, driverGas);
        
        // State 7 계산 (노즐 팽창)
        const M7 = 6.0; // 기본값, 나중에 UI에서 입력받을 수 있음
        const state7 = calcState7(states.state5, M7, drivenProps, drivenGas);
        
        if (!state7) {
            alert('State 7 계산에 실패했습니다.');
            return;
        }
        
        // 결과 저장
        currentExperiment.calculation.method = method;
        currentExperiment.calculation.stages = {
            stage1: states.state1,
            stage2: states.state2,
            stage5: states.state5,
            stage5s: null, // TODO
            stage6: null, // TODO
            stage7: state7
        };
        
        currentExperiment.status = 'completed';
        
        await saveExperiment(currentExperiment);
        
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
    
    // Stage 7
    if (stages.stage7) {
        gridDiv.appendChild(createStageCard('Stage 7 (노즐 팽창)', stages.stage7));
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
            
            const statusBadge = getStatusBadge(exp.status);
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

function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="status-badge pending">대기</span>',
        'before_complete': '<span class="status-badge processing">실험 전 완료</span>',
        'processing_complete': '<span class="status-badge processing">후처리 완료</span>',
        'completed': '<span class="status-badge complete">완료</span>'
    };
    
    return badges[status] || '<span class="status-badge pending">알 수 없음</span>';
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
