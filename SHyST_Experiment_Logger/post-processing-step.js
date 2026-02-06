// ============================================
// 2단계 처리: 1단계(필터링) → 그래프 확인 → 2단계(최종 계산)
// ============================================

// 1단계: 필터링까지만 처리하고 그래프 표시
async function processDataStep1() {
    if (!uploadedExpData || !uploadedDAQConnection) {
        alert('실험 데이터와 DAQ Connection 파일을 모두 업로드해주세요.');
        return;
    }
    
    if (!currentExperiment) {
        alert('실험 전 데이터를 먼저 저장해주세요.');
        switchTab('before');
        return;
    }
    
    try {
        const progressDiv = document.getElementById('processing-progress');
        progressDiv.innerHTML = '<div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div><p id="progress-text">1단계 처리 시작...</p>';
        
        // 사용자 입력 옵션
        const driverThresholdCoeff = parseFloat(document.getElementById('driver-threshold-coeff').value) || 3;
        
        console.log('=== 1단계 처리 시작 ===');
        console.log('Driver 임계값 계수:', driverThresholdCoeff);
        
        // 실험 조건
        const FPS = currentExperiment.before.shystSetting.daqSampling || 1000000;
        const p_t = (currentExperiment.before.shystSetting.vacuumGauge || 0) * 0.00133322;
        const p_a = (currentExperiment.before.shystSetting.airPressure || 1013) / 1000;
        
        console.log('실험 조건:', {FPS, p_t, p_a});
        
        // Step 1: Driver 압력 강하 감지
        updateProgress(20, '1/4 Driver 압력 강하 감지 중...');
        
        const driverChannel = findDriverChannel(uploadedDAQConnection);
        if (driverChannel === null) {
            throw new Error('Driver 채널을 찾을 수 없습니다.');
        }
        
        const channelKey = `ch${driverChannel}`;
        const driverData = uploadedExpData.channels[channelKey];
        if (!driverData) {
            throw new Error(`Driver 포트 ${driverChannel}의 데이터가 없습니다.`);
        }
        
        const driverIndex = findDriverDropIndex(driverData, FPS, driverThresholdCoeff);
        if (driverIndex === null) {
            throw new Error('Driver 압력 강하를 감지할 수 없습니다.');
        }
        
        console.log('✅ Driver 압력 강하:', driverIndex);
        
        // Step 2: 데이터 슬라이싱
        updateProgress(40, '2/4 데이터 슬라이싱 중...');
        const slicedData = sliceData(uploadedExpData, driverIndex, FPS);
        console.log('✅ 슬라이싱 완료');
        
        // Step 3: 전압 → 물리량 변환
        updateProgress(60, '3/4 전압 → 물리량 변환 중...');
        const convertedData = convertVoltageToPhysical(slicedData, uploadedDAQConnection, p_t, p_a);
        console.log('✅ 변환 완료');
        
        // Step 4: 필터 적용
        updateProgress(80, '4/4 필터 적용 중...');
        const filteredData = applyAllFilters(convertedData, uploadedDAQConnection, FPS);
        console.log('✅ 필터 적용 완료');
        
        // 중간 결과 저장
        step1Results = {
            slicedData,
            convertedData,
            filteredData,
            FPS,
            driverIndex
        };
        
        // 그래프 그리기
        updateProgress(100, '✅ 1단계 완료! 그래프를 확인하고 시험 시작/끝점을 조정하세요.');
        drawFilteredDataGraph(filteredData, uploadedDAQConnection);
        
        // 그래프 섹션 표시
        document.getElementById('graph-section').style.display = 'block';
        
        // 슬라이더 범위 설정 (-1ms ~ 30ms)
        document.getElementById('test-time-start-slider').min = -1;
        document.getElementById('test-time-start-slider').max = 30;
        document.getElementById('test-time-start-slider').value = 0;
        
        document.getElementById('test-time-end-slider').min = -1;
        document.getElementById('test-time-end-slider').max = 30;
        document.getElementById('test-time-end-slider').value = 30;
        
        updateTestTimeLines();
        
    } catch (e) {
        console.error('❌ 1단계 처리 실패:', e);
        console.error('Error stack:', e.stack);
        
        const errorHtml = `
            <div style="background: #fee; border: 2px solid #c33; border-radius: 8px; padding: 20px; margin-top: 20px;">
                <h3 style="color: #c33; margin-top: 0;">❌ 1단계 처리 실패</h3>
                <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${e.message}</pre>
                <p style="margin-top: 15px; font-weight: bold;">
                    👉 브라우저 콘솔(F12)을 열어서 자세한 오류를 확인하세요!
                </p>
            </div>
        `;
        
        document.getElementById('processing-progress').innerHTML = errorHtml;
    }
}

// 2단계: 최종 측정값 계산
async function processDataStep2() {
    if (!step1Results.filteredData) {
        alert('먼저 1단계 처리를 완료해주세요.');
        return;
    }
    
    try {
        console.log('=== 2단계 처리 시작 ===');
        
        const progressDiv = document.getElementById('processing-progress');
        progressDiv.innerHTML = '<div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div><p id="progress-text">2단계 처리 시작...</p>';
        
        updateProgress(10, '1/3 압력 상승 감지 중...');
        
        const {filteredData, FPS} = step1Results;
        
        // 슬라이더에서 시험 시작/끝 시간 가져오기
        const testStartMs = parseFloat(document.getElementById('test-time-start-slider').value);
        const testEndMs = parseFloat(document.getElementById('test-time-end-slider').value);
        const testTimeMs = testEndMs - testStartMs;
        
        console.log('시험 시간:', {testStartMs, testEndMs, testTimeMs});
        
        // Step 5: Driven 압력 상승 감지
        const driven7Channel = findChannelByDescription(uploadedDAQConnection, 'driven7');
        const driven8Channel = findChannelByDescription(uploadedDAQConnection, 'driven8');
        
        let driven7Index = null;
        let driven8Index = null;
        
        if (driven7Channel !== null) {
            driven7Index = findPressureRise(filteredData.channels[`ch${driven7Channel}`], FPS);
        }
        
        if (driven8Channel !== null) {
            driven8Index = findPressureRise(filteredData.channels[`ch${driven8Channel}`], FPS);
        }
        
        console.log('Driven 압력 상승:', {driven7Index, driven8Index});
        
        // Step 6: 시험시간 (수동 입력값 사용)
        updateProgress(50, '2/3 시험시간 설정 중...');
        
        const startIndex = Math.floor((testStartMs + 1) / 1000 * FPS); // -1ms 기준점 보정
        const endIndex = Math.floor((testEndMs + 1) / 1000 * FPS);
        
        const testTimeResult = {
            startIndex: startIndex,
            endIndex: endIndex,
            testTime: testTimeMs
        };
        
        console.log('시험시간 결과:', testTimeResult);
        
        // Step 7: 측정값 계산
        updateProgress(80, '3/3 측정값 계산 중...');
        const measurements = calculateMeasurements(filteredData, uploadedDAQConnection, testTimeResult, FPS);
        console.log('✅ 측정값 계산 완료:', measurements);
        
        // 결과 저장
        processedResults = {
            slicedData: step1Results.slicedData,
            convertedData: step1Results.convertedData,
            filteredData: filteredData,
            measurements: measurements,
            testTimeResult: testTimeResult
        };
        
        // UI 업데이트
        updateProgress(100, '✅ 모든 처리 완료!');
        updateMeasurementFields(measurements);
        
        // 그래프에 최종 시험 구간 표시
        drawFilteredDataGraph(filteredData, uploadedDAQConnection, testTimeResult);
        
        console.log('=== 처리 완료 ===');
        
    } catch (e) {
        console.error('❌ 2단계 처리 실패:', e);
        console.error('Error stack:', e.stack);
        
        const errorHtml = `
            <div style="background: #fee; border: 2px solid #c33; border-radius: 8px; padding: 20px; margin-top: 20px;">
                <h3 style="color: #c33; margin-top: 0;">❌ 2단계 처리 실패</h3>
                <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${e.message}</pre>
                <p style="margin-top: 15px; font-weight: bold;">
                    👉 브라우저 콘솔(F12)을 열어서 자세한 오류를 확인하세요!
                </p>
            </div>
        `;
        
        document.getElementById('processing-progress').innerHTML = errorHtml;
    }
}

// 시험 시작/끝 라인 업데이트
function updateTestTimeLines() {
    const startMs = parseFloat(document.getElementById('test-time-start-slider').value);
    const endMs = parseFloat(document.getElementById('test-time-end-slider').value);
    const lengthMs = endMs - startMs;
    
    document.getElementById('test-start-value').textContent = startMs.toFixed(1);
    document.getElementById('test-end-value').textContent = endMs.toFixed(1);
    document.getElementById('test-length-value').textContent = lengthMs.toFixed(1);
    
    // 그래프 다시 그리기 (시작/끝 라인 포함)
    if (step1Results.filteredData) {
        const tempTestTime = {
            startIndex: Math.floor((startMs + 1) / 1000 * step1Results.FPS),
            endIndex: Math.floor((endMs + 1) / 1000 * step1Results.FPS),
            testTime: lengthMs
        };
        
        drawFilteredDataGraph(step1Results.filteredData, uploadedDAQConnection, tempTestTime);
    }
}

// 필터링된 데이터 그래프 그리기
function drawFilteredDataGraph(filteredData, daqConnection, testTimeResult = null) {
    const canvas = document.getElementById('result-preview');
    const ctx = canvas.getContext('2d');
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 그래프 영역
    const margin = {left: 80, right: 40, top: 40, bottom: 60};
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;
    
    // 시간 축 (-1ms ~ 30ms)
    const numSamples = filteredData.numSamples;
    const timeData = Array.from({length: numSamples}, (_, i) => -1 + (i / numSamples) * 31);
    
    // 모든 채널의 데이터 범위 계산
    let allValues = [];
    Object.values(filteredData.channels).forEach(data => {
        allValues = allValues.concat(data);
    });
    
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const yRange = yMax - yMin;
    
    // 축 그리기
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();
    
    // X축 레이블 (시간)
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 30; i += 5) {
        const x = margin.left + ((i + 1) / 31) * width;
        const y = margin.top + height;
        ctx.fillText(`${i}`, x, y + 20);
        
        // 그리드
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    ctx.fillText('Time (ms)', margin.left + width / 2, canvas.height - 10);
    
    // Y축 레이블
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const value = yMin + (yRange * i / 5);
        const y = margin.top + height - (height * i / 5);
        ctx.fillText(value.toFixed(2), margin.left - 10, y + 5);
        
        // 그리드
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + width, y);
        ctx.stroke();
    }
    
    // 채널 데이터 그리기 (최대 8개만)
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
    const channelKeys = Object.keys(filteredData.channels).slice(0, 8);
    
    channelKeys.forEach((channelKey, idx) => {
        const data = filteredData.channels[channelKey];
        const color = colors[idx % colors.length];
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const x = margin.left + (timeData[i] + 1) / 31 * width;
            const y = margin.top + height - ((data[i] - yMin) / yRange) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    });
    
    // 시험 시작/끝 라인 그리기
    if (testTimeResult) {
        const startMs = (testTimeResult.startIndex / step1Results.FPS * 1000) - 1;
        const endMs = (testTimeResult.endIndex / step1Results.FPS * 1000) - 1;
        
        // 시작 라인 (빨간색)
        const startX = margin.left + (startMs + 1) / 31 * width;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, margin.top);
        ctx.lineTo(startX, margin.top + height);
        ctx.stroke();
        
        // 끝 라인 (파란색)
        const endX = margin.left + (endMs + 1) / 31 * width;
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
        ctx.beginPath();
        ctx.moveTo(endX, margin.top);
        ctx.lineTo(endX, margin.top + height);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
    
    // 범례
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    channelKeys.forEach((channelKey, idx) => {
        const portNum = channelKey.replace('ch', '');
        const config = daqConnection.find(c => c.channel == portNum);
        const label = config ? `${portNum}: ${config.description}` : `${portNum}`;
        
        const x = margin.left + width + 10;
        const y = margin.top + idx * 20;
        
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(x, y - 8, 15, 3);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 20, y);
    });
}
