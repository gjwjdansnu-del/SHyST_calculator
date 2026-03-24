// ============================================
// 2단계 처리: 1단계(필터링) → 그래프 확인 → 2단계(최종 계산)
// ============================================

function findRiseIndexByStdThreshold(data, fps, options = {}) {
    if (!data || data.length === 0) return { index: null, threshold: null, mean: null, std: null };
    const noiseWindowMs = options.noiseWindowMs ?? 1.0;
    const stdMult = options.stdMult ?? 4.0;
    const startIndex = options.startIndex ?? 0;
    const noiseSamples = Math.max(10, Math.floor((noiseWindowMs / 1000) * fps));
    const baseline = data.slice(0, Math.min(noiseSamples, data.length));
    if (baseline.length < 2) return { index: null, threshold: null, mean: null, std: null };

    const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
    const variance = baseline.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / baseline.length;
    const std = Math.sqrt(variance);
    const threshold = mean + stdMult * std;

    for (let i = Math.max(0, startIndex); i < data.length; i++) {
        if (data[i] >= threshold) {
            return { index: i, threshold, mean, std };
        }
    }
    return { index: null, threshold, mean, std };
}

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
        const driverPressureMissingMode = document.getElementById('driver-pressure-missing-mode')?.checked === true;
        const driven7NoiseWindowMs = parseFloat(document.getElementById('driven7-noise-window-ms')?.value) || 1.0;
        const driven7RiseStdMult = parseFloat(document.getElementById('driven7-rise-std-mult')?.value) || 4.0;
        
        console.log('=== 1단계 처리 시작 ===');
        console.log('Driver 임계값 계수:', driverThresholdCoeff);
        console.log('Driver 압력 미측정 모드:', driverPressureMissingMode);
        console.log('Driven7 노이즈 구간(ms):', driven7NoiseWindowMs, 'N:', driven7RiseStdMult);
        
        // 실험 조건
        const FPS = currentExperiment.before.shystSetting.daqSampling || 1000000;
        const p_t = (currentExperiment.before.shystSetting.vacuumGauge || 0) * 0.00133322;
        const p_a = (currentExperiment.before.shystSetting.airPressure || 1013) / 1000;
        const drivenPressureBarg = currentExperiment.before?.shystSetting?.drivenPressure;
        const hasDrivenPressure = Number.isFinite(drivenPressureBarg);
        const p_driven = hasDrivenPressure ? (1.0 + drivenPressureBarg) : p_t;
        
        console.log('실험 조건:', {FPS, p_t, p_a, p_driven});
        
        // Step 1: 기준 시점 감지 (기본: Driver 하강, 미측정모드: driven7 상승)
        let referenceIndex = null;
        let referenceMode = 'driverDrop';
        let driverIndex = null;
        let driven7TriggerStats = null;
        
        if (!driverPressureMissingMode) {
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
            
            driverIndex = findDriverDropIndex(driverData, FPS, driverThresholdCoeff);
            if (driverIndex === null) {
                throw new Error('Driver 압력 강하를 감지할 수 없습니다.');
            }
            referenceIndex = driverIndex;
            console.log('✅ Driver 압력 강하:', driverIndex);
        } else {
            updateProgress(20, '1/4 Driven7 압력 상승 감지 중...');
            const driven7Channel = findChannelByDescription(uploadedDAQConnection, 'driven7');
            if (driven7Channel === null) {
                throw new Error('Driven7 채널을 찾을 수 없습니다. (Driver 압력 미측정 모드)');
            }
            
            const channelKey = `ch${driven7Channel}`;
            const driven7Raw = uploadedExpData.channels[channelKey];
            if (!driven7Raw) {
                throw new Error(`Driven7 포트 ${driven7Channel}의 데이터가 없습니다.`);
            }
            
            const config = uploadedDAQConnection.find(c => c.channel === driven7Channel);
            if (!config) {
                throw new Error(`Driven7 포트 ${driven7Channel} 설정(DAQ Connection)을 찾을 수 없습니다.`);
            }
            
            const sampleCount = Math.min(2500, driven7Raw.length);
            const V0 = driven7Raw.slice(0, sampleCount).reduce((sum, v) => sum + v, 0) / Math.max(1, sampleCount);
            const desc = (config.description || '').toLowerCase();
            const useDriverPressure = desc.includes('driven7') || desc.includes('driven8');
            const coeffB = Number.isFinite(config.coeffB) ? config.coeffB : 0;
            const useDrivenBaseline = useDriverPressure && config.calibration === 'p_t+a(V-c)+b' && Number.isFinite(p_driven);
            const p_base = useDrivenBaseline ? (p_driven - coeffB) : p_t;
            const driven7Converted = driven7Raw.map(v => convertSingleValue(v, config, p_base, p_a, V0));
            
            let driven7Filtered = driven7Converted;
            const pnValueRaw = (config.partNumber || config.PN || '').toString().trim().toLowerCase();
            if (pnValueRaw.includes('pcb') && pnValueRaw.includes('113b22')) {
                driven7Filtered = lowpassFilter(driven7Converted, 500000, FPS);
            } else if (pnValueRaw.includes('medtherm') && pnValueRaw.includes('thermocouple')) {
                driven7Filtered = movingAverage(driven7Converted, 300);
            } else if (pnValueRaw.includes('pcb') && pnValueRaw.includes('132b38')) {
                driven7Filtered = bandpassFilter(driven7Converted, 11000, 1000000, FPS);
            }
            
            const riseSearchStartMs = 2;
            const riseSearchStartIdx = Math.floor((riseSearchStartMs / 1000) * FPS);
            const triggerResult = findRiseIndexByStdThreshold(driven7Filtered, FPS, {
                startIndex: riseSearchStartIdx,
                noiseWindowMs: driven7NoiseWindowMs,
                stdMult: driven7RiseStdMult
            });
            referenceIndex = triggerResult.index;
            if (referenceIndex === null) {
                throw new Error('Driven7 압력 상승을 감지할 수 없습니다. (Driver 압력 미측정 모드)');
            }
            driven7TriggerStats = triggerResult;
            referenceMode = 'driven7Rise';
            console.log('✅ Driven7 압력 상승 기준:', referenceIndex);
            console.log('✅ Driven7 트리거 통계:', triggerResult);
        }
        
        // Step 2: 데이터 슬라이싱
        updateProgress(40, '2/4 데이터 슬라이싱 중...');
        const sliceOptions = driverPressureMissingMode
            ? { preMs: 5, postMs: 30 }
            : { preMs: 1, postMs: 30 };
        const slicedData = sliceData(uploadedExpData, referenceIndex, FPS, sliceOptions);
        console.log('✅ 슬라이싱 완료');
        
        // Step 3: 전압 → 물리량 변환
        updateProgress(60, '3/4 전압 → 물리량 변환 중...');
        const convertedData = convertVoltageToPhysical(slicedData, uploadedDAQConnection, p_t, p_a, p_driven);
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
            driverIndex,
            referenceIndex,
            referenceMode,
            driverPressureMissingMode,
            driven7TriggerStats
        };

        const triggerInfo = document.getElementById('driven7-trigger-info');
        if (triggerInfo) {
            if (driverPressureMissingMode && driven7TriggerStats) {
                const triggerTimeMs = (referenceIndex / FPS * 1000).toFixed(3);
                triggerInfo.textContent =
                    `미측정 모드 ON | 기준=driven7 | mean=${driven7TriggerStats.mean.toFixed(4)} bar, std=${driven7TriggerStats.std.toFixed(4)} bar, ` +
                    `threshold=${driven7TriggerStats.threshold.toFixed(4)} bar, trigger=${triggerTimeMs} ms`;
            } else {
                triggerInfo.textContent = '미측정 모드 OFF (기준: driver 압력 하강)';
            }
        }
        
        // 그래프 그리기
        updateProgress(100, '✅ 1단계 완료! 그래프를 확인하고 시험 시작/끝점을 조정하세요.');
        
        // 압력 임계값 슬라이더 범위 설정 (0 ~ 2*p1)
        const p1_bar = hasDrivenPressure ? p_driven : (currentExperiment?.after?.labviewLog?.p1_avg || 0.1);
        const maxPressure = 2 * p1_bar;
        const pressureSlider = document.getElementById('pressure-threshold-slider');
        pressureSlider.max = maxPressure.toFixed(2);
        pressureSlider.value = (p1_bar * 0.5).toFixed(2); // 초기값: 0.5*p1
        document.getElementById('pressure-max-value').textContent = maxPressure.toFixed(2);
        
        updatePressureThresholdValue();
        const riseIndices = computeRiseIndices();
        updateLiveShockSpeed(riseIndices);
        drawFilteredDataGraph(filteredData, uploadedDAQConnection, riseIndices);
        drawChannelGraphs(filteredData, uploadedDAQConnection, riseIndices);
        
        // 그래프 섹션 표시
        document.getElementById('graph-section').style.display = 'block';
        
        // 슬라이더 범위 설정 (기본 -1ms~30ms, 미측정 모드 -5ms~30ms)
        const startMinMs = driverPressureMissingMode ? -5 : -1;
        document.getElementById('test-time-start-slider').min = startMinMs;
        document.getElementById('test-time-start-slider').max = 30;
        document.getElementById('test-time-start-slider').value = 0;
        document.getElementById('test-time-length-slider').min = 0;
        document.getElementById('test-time-length-slider').max = 30 - startMinMs;
        document.getElementById('test-time-length-slider').value = 30;
        
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
        
        // 슬라이더에서 시험 시작/길이 가져오기
        const testStartMs = parseFloat(document.getElementById('test-time-start-slider').value);
        const testLengthMs = parseFloat(document.getElementById('test-time-length-slider').value);
        const testEndMs = Math.min(30, testStartMs + testLengthMs);
        const testTimeMs = Math.max(0, testEndMs - testStartMs);
        
        console.log('시험 시간:', {testStartMs, testEndMs, testTimeMs});
        
        // Step 5: Driven 압력 상승 감지
        const driven7Channel = findChannelByDescription(uploadedDAQConnection, 'driven7');
        const driven8Channel = findChannelByDescription(uploadedDAQConnection, 'driven8');
        const detectModelFront = document.getElementById('detect-model-front').checked;
        const modelFrontChannel = detectModelFront ? findChannelByDescription(uploadedDAQConnection, 'model front') : null;
        
        let driven7Index = null;
        let driven8Index = null;
        let modelFrontIndex = null;
        
        const riseSearchStartMs = 2;
        const sliceStartMs = step1Results.slicedData?.timeRange?.start ?? -1;
        const riseSearchStartIdx = Math.max(0, Math.floor((riseSearchStartMs - sliceStartMs) / 1000 * FPS));
        
        // 압력 임계값 가져오기
        const pressureThreshold = parseFloat(document.getElementById('pressure-threshold-slider').value);
        
        if (driven7Channel !== null) {
            const driven7Slice = filteredData.channels[`ch${driven7Channel}`];
            driven7Index = driven7Slice ? findPressureRise(driven7Slice, FPS, {
                startIndex: riseSearchStartIdx,
                pressureThreshold: pressureThreshold
            }) : null;
        }
        
        if (driven8Channel !== null) {
            const driven8Slice = filteredData.channels[`ch${driven8Channel}`];
            driven8Index = driven8Slice ? findPressureRise(driven8Slice, FPS, {
                startIndex: riseSearchStartIdx,
                pressureThreshold: pressureThreshold
            }) : null;
        }
        
        if (modelFrontChannel !== null) {
            const modelFrontSlice = filteredData.channels[`ch${modelFrontChannel}`];
            modelFrontIndex = modelFrontSlice ? findPressureRise(modelFrontSlice, FPS, { startIndex: riseSearchStartIdx }) : null;
        }
        
        console.log('Driven 압력 상승:', {driven7Index, driven8Index, modelFrontIndex});
        
        // Step 6: 시험시간 (수동 입력값 사용)
        updateProgress(50, '2/3 시험시간 설정 중...');
        
        const startIndex = Math.max(0, Math.floor((testStartMs - sliceStartMs) / 1000 * FPS));
        const endIndex = Math.max(startIndex, Math.floor((testEndMs - sliceStartMs) / 1000 * FPS));
        
        const testTimeResult = {
            startIndex: startIndex,
            endIndex: endIndex,
            testTime: testTimeMs
        };
        
        console.log('시험시간 결과:', testTimeResult);
        
        // Step 7: 측정값 계산
        updateProgress(80, '3/3 측정값 계산 중...');
        const t1FromBefore = currentExperiment?.before?.shystSetting?.drivenTemp ?? currentExperiment?.before?.shystSetting?.airTemp ?? null;
        const measurements = calculateMeasurements(filteredData, uploadedDAQConnection, testTimeResult, FPS, {
            driverIndex: step1Results.driverIndex ?? null,
            driven7Index,
            driven8Index,
            modelFrontIndex,
            timeOffsetStartMs: sliceStartMs,
            indicesOrigin: 'slice',
            testTimeStartMs: testStartMs,
            t1FromBefore,
            driverPressureMissingMode: step1Results.driverPressureMissingMode === true
        });
        console.log('✅ 측정값 계산 완료:', measurements);
        
        // 결과 저장
        processedResults = {
            slicedData: step1Results.slicedData,
            convertedData: step1Results.convertedData,
            filteredData: filteredData,
            measurements: measurements,
            driverIndex: step1Results.driverIndex ?? null,
            driverPressureMissingMode: step1Results.driverPressureMissingMode === true,
            driven7Index,
            driven8Index,
            modelFrontIndex,
            testTimeResult: testTimeResult
        };
        
        // UI 업데이트
        updateProgress(100, '✅ 모든 처리 완료!');
        updateMeasurementFields(measurements);
        
        // 그래프에 최종 시험 구간 및 압력 상승 표시
        const riseIndices = {
            driven7Index,
            driven8Index
        };
        drawFilteredDataGraph(step1Results.filteredData, uploadedDAQConnection, riseIndices);
        drawChannelGraphs(step1Results.filteredData, uploadedDAQConnection, riseIndices);
        drawDriven8Graph(filteredData, uploadedDAQConnection, testTimeResult, driven8Index);
        
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
    const lengthMs = parseFloat(document.getElementById('test-time-length-slider').value);
    const endMs = Math.min(30, startMs + lengthMs);
    const finalLengthMs = Math.max(0, endMs - startMs);
    
    document.getElementById('test-start-value').textContent = startMs.toFixed(1);
    document.getElementById('test-end-value').textContent = endMs.toFixed(1);
    document.getElementById('test-length-value').textContent = finalLengthMs.toFixed(1);
    
    // 그래프 다시 그리기
    if (step1Results.filteredData) {
        const sliceStartMs = step1Results.slicedData?.timeRange?.start ?? -1;
        const tempTestTime = {
            startIndex: Math.max(0, Math.floor((startMs - sliceStartMs) / 1000 * step1Results.FPS)),
            endIndex: Math.max(0, Math.floor((endMs - sliceStartMs) / 1000 * step1Results.FPS)),
            testTime: finalLengthMs
        };

        const tempIndices = computeRiseIndices();
        drawFilteredDataGraph(step1Results.filteredData, uploadedDAQConnection, tempIndices);
        drawChannelGraphs(step1Results.filteredData, uploadedDAQConnection, tempIndices);
        drawDriven8Graph(step1Results.filteredData, uploadedDAQConnection, tempTestTime, tempIndices.driven8Index);
        drawRmsRatioGraph(step1Results.filteredData, uploadedDAQConnection, tempTestTime);
    }
}

// 필터링된 데이터 그래프 그리기
function drawFilteredDataGraph(filteredData, daqConnection, riseIndices = null) {
    const canvas = document.getElementById('result-preview');
    const ctx = canvas.getContext('2d');
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 그래프 영역
    const margin = {left: 90, right: 90, top: 40, bottom: 70};
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;
    
    const channelKeys = Object.keys(filteredData.channels);
    if (channelKeys.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const pressureChannels = [];
    const tempChannels = [];
    
    channelKeys.forEach(channelKey => {
        const portNum = parseInt(channelKey.replace('ch', ''), 10);
        const config = daqConnection.find(c => c.channel === portNum);
        if (isTemperatureConfig(config)) {
            tempChannels.push(channelKey);
        } else {
            pressureChannels.push(channelKey);
        }
    });
    
    let pressureMin = Infinity;
    let pressureMax = -Infinity;
    pressureChannels.forEach(key => {
        const stats = arrayMinMax(filteredData.channels[key]);
        if (stats.min === null || stats.max === null) return;
        if (stats.min < pressureMin) pressureMin = stats.min;
        if (stats.max > pressureMax) pressureMax = stats.max;
    });
    
    let tempMin = Infinity;
    let tempMax = -Infinity;
    tempChannels.forEach(key => {
        const stats = arrayMinMax(filteredData.channels[key]);
        if (stats.min === null || stats.max === null) return;
        if (stats.min < tempMin) tempMin = stats.min;
        if (stats.max > tempMax) tempMax = stats.max;
    });
    
    const hasPressure = isFinite(pressureMin) && isFinite(pressureMax);
    const hasTemp = isFinite(tempMin) && isFinite(tempMax);
    
    if (!hasPressure && !hasTemp) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const pressureRange = (pressureMax - pressureMin) || 1;
    const tempRange = (tempMax - tempMin) || 1;
    
    // 축 그리기
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();
    
    if (hasTemp) {
        ctx.beginPath();
        ctx.moveTo(margin.left + width, margin.top);
        ctx.lineTo(margin.left + width, margin.top + height);
        ctx.stroke();
    }
    
    // X축 눈금 (1ms 간격)
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 30; i += 1) {
        const x = margin.left + ((i + 1) / 31) * width;
        const y = margin.top + height;
        ctx.fillText(`${i}`, x, y + 18);
        
        // 주요 그리드 (5ms)
        if (i % 5 === 0) {
            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    }
    ctx.font = '12px Arial';
    ctx.fillText('Time (ms)', margin.left + width / 2, canvas.height - 10);
    
    // Y축 (압력)
    if (hasPressure) {
        ctx.textAlign = 'right';
        ctx.font = '11px Arial';
        for (let i = 0; i <= 5; i++) {
            const value = pressureMin + (pressureRange * i / 5);
            const y = margin.top + height - (height * i / 5);
            ctx.fillText(value.toFixed(2), margin.left - 10, y + 5);
            
            ctx.strokeStyle = '#eee';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + width, y);
            ctx.stroke();
        }
        
        ctx.save();
        ctx.translate(20, margin.top + height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText('Pressure [bar]', 0, 0);
        ctx.restore();
    }
    
    // Y축 (온도)
    if (hasTemp) {
        ctx.textAlign = 'left';
        ctx.font = '11px Arial';
        for (let i = 0; i <= 5; i++) {
            const value = tempMin + (tempRange * i / 5);
            const y = margin.top + height - (height * i / 5);
            ctx.fillText(value.toFixed(1), margin.left + width + 10, y + 5);
        }
        
        ctx.save();
        ctx.translate(canvas.width - 20, margin.top + height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText('Temperature [K]', 0, 0);
        ctx.restore();
    }
    
    // 채널 데이터 그리기
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#7f8c8d', '#8e44ad'];
    channelKeys.forEach((channelKey, idx) => {
        const data = filteredData.channels[channelKey];
        const isTemp = tempChannels.includes(channelKey);
        const yMin = isTemp ? tempMin : pressureMin;
        const yRange = isTemp ? tempRange : pressureRange;
        if (!isFinite(yMin) || !isFinite(yRange)) return;
        
        ctx.strokeStyle = colors[idx % colors.length];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        const denom = Math.max(1, data.length - 1);
        for (let i = 0; i < data.length; i++) {
            const x = margin.left + (i / denom) * width;
            const y = margin.top + height - ((data[i] - yMin) / yRange) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    });
    
    // 압력 상승 표시 (driven7, driven8)
    if (riseIndices) {
        const numSamples = filteredData.numSamples;
        const denom = Math.max(1, numSamples - 1);
        
        if (riseIndices.driven7Index !== null) {
            const x = margin.left + (riseIndices.driven7Index / denom) * width;
            ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + height);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('D7↑', x, margin.top - 5);
        }
        
        if (riseIndices.driven8Index !== null) {
            const x = margin.left + (riseIndices.driven8Index / denom) * width;
            ctx.strokeStyle = 'rgba(52, 152, 219, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + height);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(52, 152, 219, 0.9)';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('D8↑', x, margin.top - 5);
        }
        
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
        const y = margin.top + idx * 18;
        
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(x, y - 8, 15, 3);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x + 20, y);
    });
}

function isTemperatureConfig(config) {
    if (!config) return false;
    const type = String(config.type || '').toLowerCase();
    const pn = String(config.partNumber || config.PN || '').toLowerCase();
    const cal = String(config.calibration || '').toLowerCase();
    return type === 't' || pn.includes('thermocouple') || cal === 'e' || cal === 'av+b';
}

function drawChannelGraphs(filteredData, daqConnection, riseIndices = null) {
    const driverCh = findChannelByDescription(daqConnection, 'driver');
    const driven7Ch = findChannelByDescription(daqConnection, 'driven7');
    const driven8Ch = findChannelByDescription(daqConnection, 'driven8');
    
    drawSingleChannelGraph('driver-preview', filteredData.channels[`ch${driverCh}`], {
        title: 'Driver',
        color: '#2ecc71',
        yLabel: 'Pressure [bar]'
    });
    
    const pressureThreshold = parseFloat(document.getElementById('pressure-threshold-slider')?.value) || 0.1;
    
    drawSingleChannelGraph('driven7-preview', filteredData.channels[`ch${driven7Ch}`], {
        title: 'Driven 7',
        color: '#e74c3c',
        yLabel: 'Pressure [bar]',
        riseIndex: riseIndices?.driven7Index ?? null,
        riseLabel: 'D7↑',
        pressureThreshold: pressureThreshold
    });
    
    drawDriven8Graph(filteredData, daqConnection, null, riseIndices?.driven8Index ?? null);
}

function drawDriven8Graph(filteredData, daqConnection, testTimeResult, riseIndex = null) {
    const driven8Ch = findChannelByDescription(daqConnection, 'driven8');
    const data = driven8Ch !== null ? filteredData.channels[`ch${driven8Ch}`] : null;
    const pressureThreshold = parseFloat(document.getElementById('pressure-threshold-slider')?.value) || 0.1;
    
    drawSingleChannelGraph('driven8-preview', data, {
        title: 'Driven 8',
        color: '#3498db',
        showTestLines: true,
        testTimeResult: testTimeResult,
        fps: step1Results.FPS,
        yLabel: 'Pressure [bar]',
        riseIndex: riseIndex,
        riseLabel: 'D8↑',
        pressureThreshold: pressureThreshold
    });
}

function drawSingleChannelGraph(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!data || data.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const stats = arrayMinMax(data);
    if (stats.min === null || stats.max === null) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const margin = {left: 80, right: 40, top: 40, bottom: 50};
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;
    
    const yMin = stats.min;
    const yMax = stats.max;
    const yRange = yMax - yMin || 1;
    
    // 축
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();
    
    // X축 레이블 (1ms 간격)
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 30; i += 1) {
        const x = margin.left + ((i + 1) / 31) * width;
        const y = margin.top + height;
        ctx.fillText(`${i}`, x, y + 18);
    }
    ctx.font = '12px Arial';
    ctx.fillText('Time (ms)', margin.left + width / 2, canvas.height - 10);
    
    // Y축 레이블
    ctx.textAlign = 'right';
    ctx.font = '11px Arial';
    for (let i = 0; i <= 4; i++) {
        const value = yMin + (yRange * i / 4);
        const y = margin.top + height - (height * i / 4);
        ctx.fillText(value.toFixed(2), margin.left - 10, y + 5);
    }
    
    if (options.yLabel) {
        ctx.save();
        ctx.translate(20, margin.top + height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(options.yLabel, 0, 0);
        ctx.restore();
    }
    
    // 데이터 플롯
    const color = options.color || '#3498db';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    const denom = Math.max(1, data.length - 1);
    for (let i = 0; i < data.length; i++) {
        const x = margin.left + (i / denom) * width;
        const y = margin.top + height - ((data[i] - yMin) / yRange) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    // 제목
    if (options.title) {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(options.title, canvas.width / 2, 20);
    }
    
    // 압력 임계값 가로선 표시
    if (options.pressureThreshold !== null && options.pressureThreshold !== undefined) {
        const thresholdY = margin.top + height - ((options.pressureThreshold - yMin) / yRange) * height;
        
        // 임계값이 그래프 범위 내에 있을 때만 표시
        if (thresholdY >= margin.top && thresholdY <= margin.top + height) {
            ctx.strokeStyle = 'rgba(255, 165, 0, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(margin.left, thresholdY);
            ctx.lineTo(margin.left + width, thresholdY);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`임계값: ${options.pressureThreshold.toFixed(2)} bar`, margin.left + 5, thresholdY - 5);
            ctx.setLineDash([]);
        }
    }
    
    // 압력 상승 표시 (세로 점선)
    if (options.riseIndex !== null && options.riseIndex !== undefined) {
        const denom = Math.max(1, data.length - 1);
        const x = margin.left + (options.riseIndex / denom) * width;
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + height);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(options.riseLabel || 'Rise', x, margin.top - 5);
        ctx.setLineDash([]);
    }
    
    // 시험 시작/끝 라인 (driven8만)
    if (options.showTestLines && options.testTimeResult && options.fps) {
        const sliceStartMs = step1Results.slicedData?.timeRange?.start ?? -1;
        const sliceEndMs = step1Results.slicedData?.timeRange?.end ?? 30;
        const windowMs = Math.max(1e-9, sliceEndMs - sliceStartMs);
        const startMs = (options.testTimeResult.startIndex / options.fps * 1000) + sliceStartMs;
        const endMs = (options.testTimeResult.endIndex / options.fps * 1000) + sliceStartMs;
        
        ctx.setLineDash([5, 5]);
        
        const startX = margin.left + ((startMs - sliceStartMs) / windowMs) * width;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, margin.top);
        ctx.lineTo(startX, margin.top + height);
        ctx.stroke();
        
        const endX = margin.left + ((endMs - sliceStartMs) / windowMs) * width;
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
        ctx.beginPath();
        ctx.moveTo(endX, margin.top);
        ctx.lineTo(endX, margin.top + height);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
}

function updatePressureThresholdValue() {
    const slider = document.getElementById('pressure-threshold-slider');
    const valueEl = document.getElementById('pressure-threshold-value');
    if (!slider || !valueEl) return;
    const value = parseFloat(slider.value) || 0.1;
    valueEl.textContent = value.toFixed(2);
}

function computeRiseIndices() {
    if (!step1Results.filteredData || !uploadedDAQConnection) {
        return { driven7Index: null, driven8Index: null };
    }
    const pressureThreshold = parseFloat(document.getElementById('pressure-threshold-slider')?.value) || 0.1;
    const riseSearchStartMs = 2;
    const sliceStartMs = step1Results.slicedData?.timeRange?.start ?? -1;
    const riseSearchStartIdx = Math.max(0, Math.floor((riseSearchStartMs - sliceStartMs) / 1000 * step1Results.FPS));
    const driven7Channel = findChannelByDescription(uploadedDAQConnection, 'driven7');
    const driven8Channel = findChannelByDescription(uploadedDAQConnection, 'driven8');
    
    const driven7Slice = driven7Channel !== null ? step1Results.filteredData.channels[`ch${driven7Channel}`] : null;
    const driven8Slice = driven8Channel !== null ? step1Results.filteredData.channels[`ch${driven8Channel}`] : null;
    
    const driven7Index = driven7Slice ? findPressureRise(driven7Slice, step1Results.FPS, {
        startIndex: riseSearchStartIdx,
        pressureThreshold: pressureThreshold
    }) : null;
    
    const driven8Index = driven8Slice ? findPressureRise(driven8Slice, step1Results.FPS, {
        startIndex: riseSearchStartIdx,
        pressureThreshold: pressureThreshold
    }) : null;
    
    return { driven7Index, driven8Index };
}

function updateLiveShockSpeed(riseIndices) {
    const shockSpeedEl = document.getElementById('shock-speed-live');
    if (!shockSpeedEl || !step1Results?.FPS) return;
    if (!riseIndices || riseIndices.driven7Index === null || riseIndices.driven8Index === null) {
        shockSpeedEl.textContent = '-';
        return;
    }
    const deltaIdx = riseIndices.driven8Index - riseIndices.driven7Index;
    if (deltaIdx <= 0) {
        shockSpeedEl.textContent = '-';
        return;
    }
    const distanceMeters = 0.5; // 기본 센서 거리 (calculateMeasurements와 동일)
    const deltaT = deltaIdx / step1Results.FPS;
    const speed = distanceMeters / deltaT;
    shockSpeedEl.textContent = Number.isFinite(speed) ? speed.toFixed(2) : '-';
}

function updatePressureThreshold() {
    updatePressureThresholdValue();
    if (!step1Results.filteredData) return;
    
    const riseIndices = computeRiseIndices();
    updateLiveShockSpeed(riseIndices);
    const startMs = parseFloat(document.getElementById('test-time-start-slider').value);
    const lengthMs = parseFloat(document.getElementById('test-time-length-slider').value);
    const endMs = Math.min(30, startMs + lengthMs);
    const sliceStartMs = step1Results.slicedData?.timeRange?.start ?? -1;
    const tempTestTime = {
        startIndex: Math.max(0, Math.floor((startMs - sliceStartMs) / 1000 * step1Results.FPS)),
        endIndex: Math.max(0, Math.floor((endMs - sliceStartMs) / 1000 * step1Results.FPS)),
        testTime: Math.max(0, endMs - startMs)
    };
    
    drawFilteredDataGraph(step1Results.filteredData, uploadedDAQConnection, riseIndices);
    drawChannelGraphs(step1Results.filteredData, uploadedDAQConnection, riseIndices);
    drawDriven8Graph(step1Results.filteredData, uploadedDAQConnection, tempTestTime, riseIndices.driven8Index);
    drawRmsRatioGraph(step1Results.filteredData, uploadedDAQConnection, tempTestTime);
}

function drawRmsRatioGraph(filteredData, daqConnection, testTimeResult) {
    const canvas = document.getElementById('rms-preview');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const driven8Ch = findChannelByDescription(daqConnection, 'driven8');
    const data = driven8Ch !== null ? filteredData.channels[`ch${driven8Ch}`] : null;
    
    if (!data || data.length === 0 || !testTimeResult || !step1Results.FPS) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const fps = step1Results.FPS;
    const startIndex = testTimeResult.startIndex;
    const maxWindowMs = 10;
    const points = 300;
    
    const rmsPoints = [];
    for (let i = 1; i <= points; i++) {
        const windowMs = (i / points) * maxWindowMs;
        const windowSamples = Math.max(2, Math.floor(windowMs / 1000 * fps));
        const endIndex = Math.min(data.length, startIndex + windowSamples);
        const window = data.slice(startIndex, endIndex);
        
        if (window.length < 2) continue;
        const mean = average(window);
        const std = standardDeviation(window);
        if (!mean || !isFinite(mean) || !isFinite(std)) continue;
        
        const rmsPercent = Math.abs(std / mean) * 100;
        rmsPoints.push({ windowMs, rmsPercent });
    }
    
    if (rmsPoints.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const margin = {left: 80, right: 40, top: 40, bottom: 60};
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;
    
    const rmsValues = rmsPoints.map(p => p.rmsPercent);
    const rmsStats = arrayMinMax(rmsValues);
    const xMin = 0;
    const xMax = Math.max(Math.ceil(rmsStats.max || 1), 5);
    const yMin = 0;
    const yMax = maxWindowMs;
    
    // 축
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();
    
    // X축 레이블 (RMS %)
    ctx.fillStyle = '#000';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    for (let i = xMin; i <= xMax; i += 1) {
        const value = i;
        const x = margin.left + ((value - xMin) / (xMax - xMin)) * width;
        const y = margin.top + height;
        ctx.fillText(value.toFixed(1), x, y + 20);
    }
    ctx.font = '12px Arial';
    ctx.fillText('RMS / Mean [%]', margin.left + width / 2, canvas.height - 10);
    
    // Y축 레이블 (ms)
    ctx.textAlign = 'right';
    for (let i = yMin; i <= yMax; i += 1) {
        const value = i;
        const y = margin.top + height - ((value - yMin) / (yMax - yMin)) * height;
        ctx.fillText(value.toFixed(1), margin.left - 10, y + 5);
    }
    
    ctx.save();
    ctx.translate(20, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('Test time length [ms]', 0, 0);
    ctx.restore();
    
    // 그래프
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    rmsPoints.forEach((p, idx) => {
        const x = margin.left + ((p.rmsPercent - xMin) / (xMax - xMin)) * width;
        const y = margin.top + height - ((p.windowMs - yMin) / (yMax - yMin)) * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // 기준선 (3%)
    const refX = margin.left + ((3 - xMin) / (xMax - xMin)) * width;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(refX, margin.top);
    ctx.lineTo(refX, margin.top + height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 현재 시험 길이 표시
    const currentLen = Math.min(Math.max(testTimeResult.testTime, 0), maxWindowMs);
    const currentY = margin.top + height - ((currentLen - yMin) / (yMax - yMin)) * height;
    ctx.strokeStyle = 'rgba(0, 128, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, currentY);
    ctx.lineTo(margin.left + width, currentY);
    ctx.stroke();
    
    // 현재 길이의 RMS 점 표시
    const nearest = rmsPoints.reduce((prev, cur) => {
        return Math.abs(cur.windowMs - currentLen) < Math.abs(prev.windowMs - currentLen) ? cur : prev;
    }, rmsPoints[0]);
    const markerX = margin.left + ((nearest.rmsPercent - xMin) / (xMax - xMin)) * width;
    const markerY = margin.top + height - ((nearest.windowMs - yMin) / (yMax - yMin)) * height;
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // 제목
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('시험 길이별 RMS/Mean 그래프 (Driven8)', canvas.width / 2, 20);
}
