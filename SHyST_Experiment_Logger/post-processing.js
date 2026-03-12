// ============================================
// SHyST 실험 데이터 후처리 - 메인 로직
// Python post_SHyST_ver1.ipynb를 JavaScript로 변환
// ============================================

// 전역 변수
let uploadedExpData = null;
let uploadedDAQConnection = null;
let processedResults = null;

// 중간 처리 결과 (1단계)
let step1Results = {
    slicedData: null,
    convertedData: null,
    filteredData: null,
    FPS: null,
    driverIndex: null
};

// ============================================
// 1. 파일 업로드 핸들러
// ============================================

async function handleExpDataUpload(event) {
    console.log('=== 실험 데이터 파일 업로드 시작 ===');
    console.log('Event:', event);
    console.log('Event.target:', event.target);
    console.log('Event.target.files:', event.target.files);
    
    const file = event.target.files[0];
    if (!file) {
        console.log('❌ 파일이 선택되지 않았습니다.');
        alert('파일이 선택되지 않았습니다. 다시 시도해주세요.');
        return;
    }
    
    console.log('✅ 파일 정보:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    try {
        document.getElementById('exp-data-status').textContent = '⏳ 로딩 중...';
        
        console.log('⏳ XLSX 라이브러리 확인:', typeof XLSX);
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
        }
        
        console.log('⏳ 파일 읽기 시작...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('✅ ArrayBuffer 크기:', arrayBuffer.byteLength);
        
        console.log('⏳ XLSX 파싱 시작...');
        const workbook = XLSX.read(arrayBuffer);
        console.log('✅ Workbook 로드 완료. 시트 수:', workbook.SheetNames.length);
        console.log('시트 이름:', workbook.SheetNames);
        
        // 1번째 시트에서 채널 수 읽기 (B5 셀)
        const sheet1Name = workbook.SheetNames[0];
        const sheet1 = workbook.Sheets[sheet1Name];
        const numChannelsCell = sheet1['B5'];
        const numChannels = numChannelsCell ? parseInt(numChannelsCell.v) : null;
        
        console.log('시트1 B5에서 읽은 채널 수:', numChannels);
        
        // 2번째 시트 읽기 (데이터). 시트가 1개뿐이면 1번째 시트 사용
        const dataSheetIndex = workbook.SheetNames.length >= 2 ? 1 : 0;
        const dataSheetName = workbook.SheetNames[dataSheetIndex];
        const worksheet = workbook.Sheets[dataSheetName];
        if (!worksheet) {
            throw new Error('데이터 시트를 찾을 수 없습니다.');
        }
        
        // JSON으로 변환 (헤더 포함)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
        
        // 데이터 파싱
        uploadedExpData = parseExpData(jsonData, numChannels);
        
        document.getElementById('exp-data-status').textContent = 
            `✅ ${file.name} (${uploadedExpData.numChannels}채널, ${uploadedExpData.numSamples}샘플)`;
        
        console.log('실험 데이터 로드 완료:', uploadedExpData);
        
    } catch (e) {
        console.error('❌ 실험 데이터 로드 실패:', e);
        console.error('Error stack:', e.stack);
        document.getElementById('exp-data-status').textContent = '❌ 로드 실패';
        alert('실험 데이터 파일을 읽는데 실패했습니다:\n\n' + e.message + '\n\n콘솔(F12)에서 자세한 오류를 확인하세요.');
    }
}

async function handleDAQConnectionUpload(event) {
    console.log('=== DAQ Connection 파일 업로드 시작 ===');
    const file = event.target.files[0];
    if (!file) {
        console.log('파일이 선택되지 않았습니다.');
        return;
    }
    
    console.log('파일 정보:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    try {
        document.getElementById('daq-status').textContent = '⏳ 로딩 중...';
        
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        
        // 첫 번째 시트 읽기
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // JSON으로 변환
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        uploadedDAQConnection = parseDAQConnection(jsonData);
        
        document.getElementById('daq-status').textContent = 
            `✅ ${file.name} (${uploadedDAQConnection.length}개 센서)`;
        
        console.log('DAQ Connection 로드 완료:', uploadedDAQConnection);
        
    } catch (e) {
        console.error('❌ DAQ Connection 로드 실패:', e);
        console.error('Error stack:', e.stack);
        document.getElementById('daq-status').textContent = '❌ 로드 실패';
        alert('DAQ Connection 파일을 읽는데 실패했습니다:\n\n' + e.message + '\n\n콘솔(F12)에서 자세한 오류를 확인하세요.');
    }
}

// ============================================
// 2. 데이터 파싱
// ============================================

function parseExpData(jsonData, expectedNumChannels) {
    if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        throw new Error('실험 데이터가 비어있거나 형식이 올바르지 않습니다. (시트에 데이터가 있는지, 2번째 시트가 데이터 시트인지 확인하세요.)');
    }
    
    console.log('실험 데이터 파싱 시작:', {
        totalRows: jsonData.length,
        expectedChannels: expectedNumChannels,
        firstRow: jsonData[0]
    });
    
    // 첫 행은 헤더 (전압_0, 전압_1, ...)
    const headers = jsonData[0];
    if (!headers || !Array.isArray(headers)) {
        throw new Error('실험 데이터의 첫 행(헤더)을 읽을 수 없습니다. 시트 형식(전압_0, 전압_1, ...)을 확인하세요.');
    }
    
    const dataRows = jsonData.slice(1);
    
    // 헤더에서 포트 번호 추출
    // "전압_0" -> 0, "전압_1" -> 1, ...
    // 중요: 포트 번호는 연속적이지 않을 수 있음 (예: 0,1,2,4,5,6,7 - 3이 빠짐)
    const portNumbers = headers.map(header => {
        if (typeof header === 'string') {
            const match = header.match(/전압_(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        return null;
    });
    
    // 실제 포트 번호만 추출 (null 제외)
    const validPortNumbers = portNumbers.filter(p => p !== null);
    
    console.log('추출된 포트 번호:', validPortNumbers);
    console.log('포트 번호 범위:', {
        min: Math.min(...validPortNumbers),
        max: Math.max(...validPortNumbers),
        count: validPortNumbers.length
    });
    
    // 빈 행 제거
    const validRows = dataRows.filter(row => {
        return row && row.length > 0 && row.some(v => v !== null && v !== undefined && v !== '');
    });
    
    console.log('유효한 데이터 행:', validRows.length);
    
    // 채널별로 데이터 분리
    // 중요: 포트 번호를 키로 사용 (연속적이지 않아도 됨)
    const channels = {};
    const columnToPort = {}; // 컬럼 인덱스 -> 포트 번호 매핑
    const portToColumn = {}; // 포트 번호 -> 컬럼 인덱스 매핑
    
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const portNum = portNumbers[colIdx];
        
        if (portNum !== null) {
            const channelName = `ch${portNum}`;
            
            channels[channelName] = validRows.map(row => {
                const value = row[colIdx];
                // 숫자 변환 시도
                if (typeof value === 'number') return value;
                if (typeof value === 'string') {
                    const parsed = parseFloat(value);
                    return isNaN(parsed) ? 0 : parsed;
                }
                return 0;
            });
            
            columnToPort[colIdx] = portNum;
            portToColumn[portNum] = colIdx;
            
            // 샘플 데이터 확인
            const sampleData = channels[channelName].slice(0, 3);
            console.log(`포트 ${portNum} (컬럼 ${colIdx}): ${channels[channelName].length}샘플, 샘플: [${sampleData.map(v => v.toFixed(6)).join(', ')}]`);
        }
    }
    
    const actualNumChannels = Object.keys(channels).length;
    
    // 포트 번호 정렬해서 표시
    const sortedPortNumbers = validPortNumbers.sort((a, b) => a - b);
    
    console.log('채널 파싱 완료:', {
        expectedChannels: expectedNumChannels,
        actualChannels: actualNumChannels,
        numSamples: validRows.length,
        portNumbers: sortedPortNumbers,
        channelKeys: Object.keys(channels).sort((a,b) => {
            const numA = parseInt(a.replace('ch', ''));
            const numB = parseInt(b.replace('ch', ''));
            return numA - numB;
        })
    });
    
    // 채널 수 불일치 경고 (개수가 아닌 존재 여부만 확인)
    if (expectedNumChannels && actualNumChannels !== expectedNumChannels) {
        console.warn(`⚠️ 채널 수 불일치: 시트1 B5=${expectedNumChannels}, 실제 파싱=${actualNumChannels}`);
        console.warn('포트 번호가 연속적이지 않을 수 있으므로 정상일 수 있습니다.');
    }
    
    return {
        headers: headers,
        channels: channels,
        columnToPort: columnToPort,
        portToColumn: portToColumn,
        portNumbers: sortedPortNumbers,
        numChannels: actualNumChannels,
        numSamples: validRows.length
    };
}

function parseDAQConnection(jsonData) {
    // DAQ connection 데이터 구조:
    // #, type, PN, SN, cal, a, b, etc, filter
    
    console.log('DAQ Connection 파싱 시작:', jsonData.length, '개 행');
    
    const parsed = jsonData.map((row, index) => {
        // # 컬럼이 포트 번호
        const portNumber = parseInt(row['#']);
        
        const config = {
            channel: portNumber, // 이게 "전압_X"의 X와 매칭됨
            type: row['type'] || '',
            partNumber: row['PN'] || '',
            serialNumber: row['SN'] || '',
            calibration: row['cal'] || '',
            coeffA: parseFloat(row['a']) || 0,
            coeffB: parseFloat(row['b']) || 0,
            description: (row['etc'] || '').toString().toLowerCase().trim(),
            filter: row['filter'] || ''
        };
        
        console.log(`DAQ 포트 ${config.channel}: ${config.description} (${config.type}, ${config.calibration}, filter:${config.filter})`);
        
        // 디버깅: driver 채널 확인
        if (config.description.includes('driver')) {
            console.log('✅ Driver 채널 발견:', config);
        }
        
        return config;
    });
    
    console.log('DAQ Connection 파싱 완료:', parsed.length, '개 센서');
    
    // 포트 번호 순으로 정렬
    parsed.sort((a, b) => a.channel - b.channel);
    
    return parsed;
}

// ============================================
// 3. 메인 데이터 처리 함수
// ============================================

async function processData() {
    if (!uploadedExpData) {
        alert('실험 데이터를 먼저 업로드해주세요.');
        return;
    }
    
    if (!uploadedDAQConnection) {
        alert('DAQ Connection 파일을 먼저 업로드해주세요.');
        return;
    }
    
    if (!currentExperiment) {
        alert('실험 전 데이터를 먼저 저장해주세요.');
        switchTab('before');
        return;
    }
    
    try {
        const progressDiv = document.getElementById('processing-progress');
        progressDiv.innerHTML = '<div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div><p id="progress-text">처리 시작...</p>';
        
        // 사용자 입력 옵션 가져오기
        const driverThresholdCoeff = parseFloat(document.getElementById('driver-threshold-coeff').value) || 3;
        const detectModelFront = document.getElementById('detect-model-front').checked;
        const manualTestTimeStart = parseFloat(document.getElementById('test-time-start').value) || null;
        const manualTestTimeLength = parseFloat(document.getElementById('test-time-length').value) || null;
        
        console.log('=== 사용자 옵션 ===');
        console.log('Driver 임계값 계수:', driverThresholdCoeff);
        console.log('Model Front 감지:', detectModelFront);
        console.log('수동 Test Time 시작:', manualTestTimeStart);
        console.log('수동 Test Time 길이:', manualTestTimeLength);
        
        // 실험 조건 가져오기
        console.log('=== 실험 조건 확인 ===');
        console.log('currentExperiment:', currentExperiment);
        console.log('before.shystSetting:', currentExperiment.before.shystSetting);
        
        const FPS = currentExperiment.before.shystSetting.daqSampling || 1000000;
        const p_t = (currentExperiment.before.shystSetting.vacuumGauge || 0) * 0.00133322; // Torr to bar
        const p_a = (currentExperiment.before.shystSetting.airPressure || 1013) / 1000; // hPa to bar
        
        // 드리븐 절대압 [bar] = 1 + 드리븐압력[barg]
        const drivenPressureBarg = currentExperiment.before?.shystSetting?.drivenPressure;
        const p_driven = (drivenPressureBarg !== undefined && drivenPressureBarg !== null) 
            ? (1.0 + drivenPressureBarg) 
            : p_t; // fallback to p_t if not available
        
        console.log('실험 조건:', {
            FPS: FPS,
            p_t: p_t,
            p_driven: p_driven,
            p_a: p_a,
            vacuumGauge_Torr: currentExperiment.before.shystSetting.vacuumGauge,
            airPressure_hPa: currentExperiment.before.shystSetting.airPressure
        });
        
        // 데이터 매칭 검증
        console.log('=== 데이터 매칭 검증 ===');
        validateDataMatching(uploadedExpData, uploadedDAQConnection);
        
        // Step 1: Driver 채널 찾기 및 압력 강하 감지
        updateProgress(10, '1/7 Driver 압력 강하 감지 중...');
        
        let driverChannel, driverData, driverIndex;
        
        try {
            console.log('=== Step 1: Driver 채널 검색 시작 ===');
            console.log('업로드된 실험 데이터 채널:', Object.keys(uploadedExpData.channels));
            console.log('DAQ Connection 채널:', uploadedDAQConnection.map(c => `${c.channel}:${c.description}`));
            
            driverChannel = findDriverChannel(uploadedDAQConnection);
            if (driverChannel === null) {
                const availableChannels = uploadedDAQConnection
                    .map(c => `  포트 ${c.channel}: ${c.description} (${c.type})`)
                    .join('\n');
                throw new Error(`Driver 채널을 찾을 수 없습니다.\n\nDAQ Connection에서 'etc' 컬럼에 'driver'가 있는 행을 찾을 수 없습니다.\n\n사용 가능한 포트:\n${availableChannels}`);
            }
            
            console.log('✅ Driver 포트 번호:', driverChannel);
            
        } catch (e) {
            console.error('❌ Step 1-1 실패 (Driver 채널 찾기):', e);
            throw e;
        }
        
        try {
            // 실험 데이터에서 해당 채널 찾기
            const channelKey = `ch${driverChannel}`;
            driverData = uploadedExpData.channels[channelKey];
            
            if (!driverData || driverData.length === 0) {
                const availableDataChannels = Object.keys(uploadedExpData.channels).join(', ');
                throw new Error(`Driver 포트 ${driverChannel}의 데이터가 실험 데이터에 없습니다.\n\n찾는 채널: ${channelKey}\n사용 가능한 채널: ${availableDataChannels}\n\n실험 데이터 파일의 2번째 시트에 "전압_${driverChannel}" 컬럼이 있는지 확인해주세요.`);
            }
            
            const driverStats = arrayMinMax(driverData);
            console.log('✅ Driver 데이터 로드 성공:', {
                channel: driverChannel,
                channelKey: channelKey,
                samples: driverData.length,
                min: driverStats.min !== null ? driverStats.min.toFixed(6) : 'N/A',
                max: driverStats.max !== null ? driverStats.max.toFixed(6) : 'N/A',
                avg: average(driverData).toFixed(6),
                first5: driverData.slice(0, 5).map(v => v.toFixed(6))
            });
            
        } catch (e) {
            console.error('❌ Step 1-2 실패 (Driver 데이터 로드):', e);
            throw e;
        }
        
        try {
            driverIndex = findDriverDropIndex(driverData, FPS, driverThresholdCoeff);
            
            if (driverIndex === null) {
                const driverStats = arrayMinMax(driverData);
                throw new Error(`Driver 압력 강하를 감지할 수 없습니다.\n\n데이터 정보:\n- 샘플 수: ${driverData.length}\n- 최소값: ${driverStats.min !== null ? driverStats.min.toFixed(4) : 'N/A'}\n- 최대값: ${driverStats.max !== null ? driverStats.max.toFixed(4) : 'N/A'}\n- 평균값: ${average(driverData).toFixed(4)}\n\n임계값 계수를 조정해보세요 (현재: ${driverThresholdCoeff})`);
            }
            
            console.log('✅ Driver 압력 강하 감지:', driverIndex, '/', driverData.length, '샘플');
            
        } catch (e) {
            console.error('❌ Step 1-3 실패 (압력 강하 감지):', e);
            throw e;
        }
        
        // Step 2: 데이터 슬라이싱 (-1ms ~ 30ms)
        let slicedData;
        try {
            console.log('=== Step 2: 데이터 슬라이싱 ===');
            updateProgress(25, '2/7 데이터 슬라이싱 (-1ms ~ 30ms)...');
            slicedData = sliceData(uploadedExpData, driverIndex, FPS);
            console.log('✅ 슬라이싱 완료:', slicedData);
        } catch (e) {
            console.error('❌ Step 2 실패 (슬라이싱):', e);
            throw new Error(`Step 2 실패: ${e.message}`);
        }
        
        // Step 3: 전압 → 물리량 변환
        let convertedData;
        try {
            console.log('=== Step 3: 전압 → 물리량 변환 ===');
            updateProgress(40, '3/7 전압 → 물리량 변환 중...');
            convertedData = convertVoltageToPhysical(slicedData, uploadedDAQConnection, p_t, p_a, p_driven);
            console.log('✅ 변환 완료:', convertedData);
        } catch (e) {
            console.error('❌ Step 3 실패 (변환):', e);
            throw new Error(`Step 3 실패: ${e.message}`);
        }
        
        // Step 4: 필터 적용
        let filteredData;
        try {
            console.log('=== Step 4: 필터 적용 ===');
            updateProgress(55, '4/7 필터 적용 중...');
            filteredData = applyAllFilters(convertedData, uploadedDAQConnection, FPS);
            console.log('✅ 필터 적용 완료:', filteredData);
        } catch (e) {
            console.error('❌ Step 4 실패 (필터):', e);
            throw new Error(`Step 4 실패: ${e.message}`);
        }
        
        // Step 5: Driven 압력 상승 감지 (슬라이스 기준)
        let driven7Channel, driven8Channel, driven7Index, driven8Index;
        let modelFrontChannel, modelFrontIndex;
        try {
            console.log('=== Step 5: Driven 압력 상승 감지 ===');
            updateProgress(70, '5/7 Driven 압력 상승 감지 중...');
            
            driven7Channel = findChannelByDescription(uploadedDAQConnection, 'driven7');
            driven8Channel = findChannelByDescription(uploadedDAQConnection, 'driven8');
            
            console.log('Driven 채널:', {driven7Channel, driven8Channel});
            
            driven7Index = null;
            driven8Index = null;
            modelFrontIndex = null;
            
            const riseSearchStartMs = 2;
            const riseSearchStartIdx = Math.floor((riseSearchStartMs + 1) / 1000 * FPS);
            
            if (driven7Channel !== null) {
                const driven7Slice = filteredData.channels[`ch${driven7Channel}`];
                driven7Index = driven7Slice ? findPressureRise(driven7Slice, FPS, {
                    startIndex: riseSearchStartIdx,
                    thresholdCoeff: 4,
                    stdCoeff: 4,
                    sustainMs: 0.5
                }) : null;
                console.log('Driven7 압력 상승:', driven7Index);
            }
            
            if (driven8Channel !== null) {
                const driven8Slice = filteredData.channels[`ch${driven8Channel}`];
                driven8Index = driven8Slice ? findPressureRise(driven8Slice, FPS, {
                    startIndex: riseSearchStartIdx,
                    thresholdCoeff: 3,
                    stdCoeff: 3,
                    sustainMs: 0.3
                }) : null;
                console.log('Driven8 압력 상승:', driven8Index);
            }
            
            if (detectModelFront) {
                modelFrontChannel = findChannelByDescription(uploadedDAQConnection, 'model front');
                if (modelFrontChannel !== null) {
                    const modelFrontSlice = filteredData.channels[`ch${modelFrontChannel}`];
                    modelFrontIndex = modelFrontSlice ? findPressureRise(modelFrontSlice, FPS, { startIndex: riseSearchStartIdx }) : null;
                    console.log('Model front 압력 상승:', modelFrontIndex);
                }
            }
            
            console.log('✅ Driven 압력 상승 감지 완료');
        } catch (e) {
            console.error('❌ Step 5 실패 (Driven 압력 상승):', e);
            throw new Error(`Step 5 실패: ${e.message}`);
        }
        
        // Step 6: 시작/끝점 선정 (RMS 기반 또는 수동 입력)
        let testTimeResult;
        try {
            console.log('=== Step 6: 시험시간 계산 ===');
            updateProgress(85, '6/7 시험시간 계산 중...');
            
            if (manualTestTimeStart !== null && manualTestTimeLength !== null) {
                // 수동 입력값 사용
                console.log('수동 입력된 Test Time 사용:', {
                    start: manualTestTimeStart,
                    length: manualTestTimeLength
                });
                
                const startIndex = Math.floor((manualTestTimeStart + 1) / 1000 * FPS);
                const endIndex = startIndex + Math.floor(manualTestTimeLength / 1000 * FPS);
                
                testTimeResult = {
                    startIndex: startIndex,
                    endIndex: endIndex,
                    testTime: manualTestTimeLength
                };
            } else {
                // 자동 계산
                testTimeResult = calculateTestTime(filteredData, driven8Channel, FPS);
            }
            
            console.log('✅ 시험시간 계산 완료:', testTimeResult);
        } catch (e) {
            console.error('❌ Step 6 실패 (시험시간):', e);
            throw new Error(`Step 6 실패: ${e.message}`);
        }
        
        // Step 7: 측정값 계산
        let measurements;
        try {
            console.log('=== Step 7: 측정값 계산 ===');
            updateProgress(95, '7/7 측정값 계산 중...');
            const t1FromBefore = currentExperiment?.before?.shystSetting?.drivenTemp ?? currentExperiment?.before?.shystSetting?.airTemp ?? null;
            const sliceStartMs = slicedData.timeRange?.start ?? -1;
            const testTimeStartMs = manualTestTimeStart !== null ? manualTestTimeStart : null;
            measurements = calculateMeasurements(filteredData, uploadedDAQConnection, testTimeResult, FPS, {
                driverIndex,
                driven7Index,
                driven8Index,
                modelFrontIndex: modelFrontIndex ?? null,
                timeOffsetStartMs: sliceStartMs,
                indicesOrigin: 'slice',
                testTimeStartMs,
                t1FromBefore
            });
            console.log('✅ 측정값 계산 완료:', measurements);
        } catch (e) {
            console.error('❌ Step 7 실패 (측정값 계산):', e);
            throw new Error(`Step 7 실패: ${e.message}`);
        }
        
        // 결과 저장
        processedResults = {
            slicedData: slicedData,
            convertedData: convertedData,
            filteredData: filteredData,
            measurements: measurements,
            driverIndex: driverIndex,
            driven7Index: driven7Index,
            driven8Index: driven8Index,
            modelFrontIndex: modelFrontIndex ?? null,
            testTimeResult: testTimeResult
        };
        
        // UI 업데이트
        updateMeasurementFields(measurements);
        
        // 결과 미리보기
        drawResultPreview(filteredData, uploadedDAQConnection);
        
        updateProgress(100, '✅ 처리 완료!');
        
        console.log('처리 결과:', processedResults);
        
        alert('데이터 처리가 완료되었습니다!');
        
    } catch (e) {
        console.error('❌❌❌ 데이터 처리 실패 ❌❌❌');
        console.error(e);
        
        // 복사 가능한 JSON 형태로 모든 디버그 정보 출력
        const debugInfo = {
            timestamp: new Date().toISOString(),
            error: {
                message: e.message,
                stack: e.stack
            },
            uploadedExpData: uploadedExpData ? {
                numChannels: uploadedExpData.numChannels,
                numSamples: uploadedExpData.numSamples,
                channels: Object.keys(uploadedExpData.channels),
                portNumbers: uploadedExpData.portNumbers,
                columnToPort: uploadedExpData.columnToPort,
                portToColumn: uploadedExpData.portToColumn,
                sampleData: Object.fromEntries(
                    Object.entries(uploadedExpData.channels).map(([ch, data]) => 
                        [ch, {
                            length: data.length,
                            first10: data.slice(0, 10),
                            last10: data.slice(-10),
                            min: arrayMinMax(data).min,
                            max: arrayMinMax(data).max,
                            avg: average(data),
                            std: standardDeviation(data)
                        }]
                    )
                )
            } : null,
            uploadedDAQConnection: uploadedDAQConnection ? uploadedDAQConnection.map(config => ({
                channel: config.channel,
                type: config.type,
                PN: config.PN,
                SN: config.SN,
                cal: config.cal,
                a: config.a,
                b: config.b,
                description: config.description,
                filter: config.filter
            })) : null,
            currentExperiment: currentExperiment ? {
                before: {
                    shystSetting: currentExperiment.before.shystSetting,
                    testCondition: currentExperiment.before.testCondition
                }
            } : null
        };
        
        console.log('');
        console.log('========================================');
        console.log('=== 🔍 복사 가능한 디버그 정보 시작 ===');
        console.log('========================================');
        console.log(JSON.stringify(debugInfo, null, 2));
        console.log('========================================');
        console.log('=== 🔍 복사 가능한 디버그 정보 끝 ===');
        console.log('========================================');
        console.log('');
        console.log('👆 위의 JSON 전체를 복사해서 전달해주세요!');
        console.log('');
        
        // 에러 메시지를 보기 좋게 표시
        const errorHtml = `
            <div style="background: #fee; border: 2px solid #c33; border-radius: 8px; padding: 20px; margin-top: 20px;">
                <h3 style="color: #c33; margin-top: 0;">❌ 처리 실패</h3>
                <pre style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${e.message}</pre>
                <p style="margin-top: 15px; font-weight: bold;">
                    👉 브라우저 콘솔(F12)을 열어서 JSON 디버그 정보를 복사해주세요!
                </p>
            </div>
        `;
        
        document.getElementById('processing-progress').innerHTML = errorHtml;
    }
}

// 디버그 정보 표시 함수 (더 이상 사용하지 않음 - 콘솔에 자동 출력됨)

// ============================================
// 4. Driver 압력 강하 감지
// ============================================

function findDriverChannel(daqConnection) {
    console.log('Driver 채널 검색 중...');
    
    for (let config of daqConnection) {
        const desc = config.description.toLowerCase().trim();
        
        console.log(`채널 ${config.channel}: "${desc}"`);
        
        if (desc === 'driver' || desc.includes('driver')) {
            console.log('✅ Driver 채널 발견:', config.channel);
            return config.channel;
        }
    }
    
    console.error('❌ Driver 채널을 찾을 수 없습니다.');
    console.log('사용 가능한 채널:', daqConnection.map(c => `${c.channel}:${c.description}`).join(', '));
    
    return null;
}

function findDriverDropIndex(driverData, fps, thresholdCoeff = 3) {
    console.log('=== Driver 압력 강하 감지 (원본 Python 알고리즘) ===');
    console.log('Driver 데이터:', {
        samples: driverData.length,
        fps: fps,
        thresholdCoeff: thresholdCoeff,
        firstValue: driverData[0].toFixed(6),
        lastValue: driverData[driverData.length - 1].toFixed(6)
    });
    
    // 1. 10000개 이동평균 필터 적용 (원본 Python: window_size = 10000)
    console.log('⏳ Step 1: 이동평균 필터 적용 중... (윈도우 크기: 10000)');
    const windowSize = 10000;
    
    try {
        const filtered = movingAverage(driverData, windowSize);
        console.log('✅ 이동평균 필터 완료:', filtered.length, '샘플');
        
        // 2. 초반 10,000개 데이터로 기울기 계산 (원본 Python: initial_data = filtered_data.iloc[:10000])
        console.log('⏳ Step 2: 초반 10000개 데이터로 기울기 계산 중...');
        const initialSize = 10000;
        const initialData = filtered.slice(0, initialSize);
        
        // 기울기 계산 (gradient = np.diff(initial_data))
        const gradient = [];
        for (let i = 1; i < initialData.length; i++) {
            gradient.push(initialData[i] - initialData[i-1]);
        }
        
        const maxGradient = Math.max(...gradient);
        const minGradient = Math.min(...gradient);
        
        console.log('초반 기울기 분석:', {
            maxGradient: maxGradient.toFixed(6),
            minGradient: minGradient.toFixed(6)
        });
        
        // 3. 임계값: 최대/최소 기울기 절댓값의 N배 (사용자 지정)
        const threshold = thresholdCoeff * Math.max(Math.abs(maxGradient), Math.abs(minGradient));
        
        console.log('✅ 임계값 설정:', {
            thresholdCoeff: thresholdCoeff,
            threshold: threshold.toFixed(6),
            negativeThreshold: (-threshold).toFixed(6)
        });
        
        // 4. 전체 데이터에서 감소 시작점 탐색
        console.log('⏳ Step 3: 전체 데이터에서 감소 시작점 탐색 중...');
        
        // 전체 필터링된 데이터의 기울기 계산
        const filteredGradient = [];
        for (let i = 1; i < filtered.length; i++) {
            filteredGradient.push(filtered[i] - filtered[i-1]);
            
            // 진행 상황 표시
            if (i % Math.floor(filtered.length / 10) === 0) {
                console.log(`  진행: ${Math.floor(i / filtered.length * 100)}%`);
            }
        }
        
        // 임계값보다 작은 (급격한 감소) 지점 찾기
        let declineIndex = null;
        for (let i = 0; i < filteredGradient.length; i++) {
            if (filteredGradient[i] < -threshold) {
                declineIndex = i;
                console.log('✅ 감소 시작점 발견:', {
                    index: declineIndex,
                    gradient: filteredGradient[i].toFixed(6),
                    value: filtered[declineIndex].toFixed(6)
                });
                break;
            }
        }
        
        if (declineIndex === null) {
            console.error('❌ 임계값 조건을 만족하는 감소 시작점을 찾을 수 없습니다.');
            console.log('디버그 정보:', {
                threshold: -threshold,
                minGradientFound: arrayMinMax(filteredGradient).min,
                maxGradientFound: arrayMinMax(filteredGradient).max,
                sampleGradients: filteredGradient.slice(0, 10).map(g => g.toFixed(6))
            });
            return null;
        }
        
        // driver_index 반환
        const driverIndex = declineIndex;
        console.log('✅ 최종 driver_index:', driverIndex);
        
        return driverIndex;
        
    } catch (error) {
        console.error('❌ Driver 압력 강하 감지 중 오류:', error);
        console.error('Error stack:', error.stack);
        throw error;
    }
}

// ============================================
// 5. 데이터 슬라이싱
// ============================================

function sliceData(expData, centerIndex, fps) {
    // -1ms ~ 30ms 구간
    const startOffset = Math.floor(fps * 0.001); // -1ms
    const endOffset = Math.floor(fps * 0.030);   // +30ms
    
    const startIndex = Math.max(0, centerIndex - startOffset);
    const endIndex = Math.min(expData.numSamples, centerIndex + endOffset);
    
    const slicedChannels = {};
    
    for (let channelName in expData.channels) {
        slicedChannels[channelName] = expData.channels[channelName].slice(startIndex, endIndex);
    }
    
    return {
        channels: slicedChannels,
        startIndex: startIndex,
        endIndex: endIndex,
        numSamples: endIndex - startIndex,
        timeRange: {
            start: -startOffset / fps * 1000, // ms
            end: endOffset / fps * 1000        // ms
        }
    };
}

// ============================================
// 6. 전압 → 물리량 변환
// ============================================

function convertVoltageToPhysical(slicedData, daqConnection, p_t, p_a, p_driven) {
    console.log('전압 → 물리량 변환 시작...');
    
    const convertedChannels = {};
    let convertedCount = 0;
    let skippedCount = 0;
    const baseDriven = Number.isFinite(p_driven) ? p_driven : p_t;
    
    // DAQ Connection의 각 설정에 대해
    for (let config of daqConnection) {
        const portNum = config.channel;
        const channelName = `ch${portNum}`;
        
        // 실험 데이터에 해당 포트가 있는지 확인
        if (!slicedData.channels[channelName]) {
            console.log(`⏭️ 포트 ${portNum} 스킵: 실험 데이터에 없음`);
            skippedCount++;
            continue;
        }
        
        // type이 'X'면 스킵
        if (config.type === 'X') {
            console.log(`⏭️ 포트 ${portNum} 스킵: type='X' (사용 안 함)`);
            skippedCount++;
            continue;
        }
        
        const voltageData = slicedData.channels[channelName];
        
        // 원본 Python: 초반 2500개 평균을 V0로 사용
        const V0 = voltageData.slice(0, 2500).reduce((sum, v) => sum + v, 0) / 2500;
        
        // driven7, driven8은 드리븐 압력 기준 사용
        const desc = (config.description || '').toLowerCase();
        const useDriverPressure = desc.includes('driven7') || desc.includes('driven8');
        const coeffB = Number.isFinite(config.coeffB) ? config.coeffB : 0;
        const useDrivenBaseline = useDriverPressure && config.calibration === 'p_t+a(V-c)+b' && Number.isFinite(baseDriven);
        const p_base = useDrivenBaseline ? (baseDriven - coeffB) : p_t;
        
        const convertedData = voltageData.map(v => 
            convertSingleValue(v, config, p_base, p_a, V0)
        );
        
        convertedChannels[channelName] = convertedData;
        convertedCount++;
        
        const sampleConverted = convertedData.slice(0, 3);
        const formatNumber = (value, digits = 4) =>
            Number.isFinite(value) ? value.toFixed(digits) : String(value);
        console.log(`✅ 포트 ${portNum} 변환 완료: ${config.description || ''} (${config.calibration}), p_base=${formatNumber(p_base)}, 샘플: [${sampleConverted.map(v => formatNumber(v)).join(', ')}]`);
    }
    
    console.log(`변환 완료: ${convertedCount}개 변환, ${skippedCount}개 스킵`);
    
    return {
        channels: convertedChannels,
        numSamples: slicedData.numSamples,
        timeRange: slicedData.timeRange
    };
}

function convertSingleValue(voltage, config, p_t, p_a, V0) {
    const {calibration, coeffA, coeffB, type} = config;
    
    // 원본 Python: V0는 각 채널의 초반 2500개 평균값
    switch(calibration) {
        case 'a(V-c)':
            // 압력 센서: a * (V - V0)
            return coeffA * (voltage - V0);
        
        case 'p_t+a(V-c)+b':
            // 압력 센서 (진공압 보정): p_t + a * (V - V0) + b
            return p_t + coeffA * (voltage - V0) + coeffB;
        
        case 'p_a+aV+b':
            // 압력 센서 (대기압 보정): p_a + a*V + b
            return p_a + coeffA * voltage + coeffB;
        
        case 'E':
            // E-type 열전대
            // 원본 Python: inv_amp(V, V0) = (V - V0) / 500
            const invAmpValue = (voltage - V0) / 500;
            return voltToKelvinE(invAmpValue);
        
        case 'aV+b':
            // K-type 열전대
            return coeffA * voltage + coeffB;
        
        default:
            // 변환 없음
            return voltage;
    }
}

// E-type 열전대 변환 (NIST ITS-90 표준 다항식)
function voltToKelvinE(volt) {
    // Convert volts to millivolts
    const mv = volt * 1000;
    
    // NIST ITS-90 coefficients for -200°C ~ 0°C (-8.825 ~ 0 mV)
    const coeffsNegative = [
        0.0000000E+00, 1.6977288E+01, -4.3514970E-01, -1.5859697E-01,
        -9.2502871E-02, -2.6084314E-02, -4.1360199E-03, -3.4034030E-04,
        -1.1564890E-05
    ];
    
    // NIST ITS-90 coefficients for 0°C ~ 1000°C (0 ~ 76.373 mV)
    const coeffsPositive = [
        0.0000000E+00, 1.7057035E+01, -2.3301759E-01, 6.5435585E-03,
        -7.3562749E-05, -1.7896001E-06, 8.4036165E-08, -1.3735879E-09,
        1.0629823E-11, -3.2447087E-14
    ];
    
    let celsius;
    
    // Check range and apply appropriate coefficients
    if (mv >= -8.825 && mv <= 0) {
        // Negative range: -200°C ~ 0°C
        celsius = 0;
        for (let i = 0; i < coeffsNegative.length; i++) {
            celsius += coeffsNegative[i] * Math.pow(mv, i);
        }
    } else if (mv > 0 && mv <= 76.373) {
        // Positive range: 0°C ~ 1000°C
        celsius = 0;
        for (let i = 0; i < coeffsPositive.length; i++) {
            celsius += coeffsPositive[i] * Math.pow(mv, i);
        }
    } else {
        // Out of range: return NaN
        return NaN;
    }
    
    // Convert Celsius to Kelvin
    return celsius + 273.15;
}

// ============================================
// 7. 필터 적용
// ============================================

function applyAllFilters(convertedData, daqConnection, fps) {
    console.log('필터 적용 시작...');
    
    const filteredChannels = {};
    let filteredCount = 0;
    
    // DAQ Connection의 각 설정에 대해
    for (let config of daqConnection) {
        const portNum = config.channel;
        const channelName = `ch${portNum}`;
        
        // 변환된 데이터에 해당 채널이 있는지 확인
        if (!convertedData.channels[channelName]) {
            continue;
        }
        
        const data = convertedData.channels[channelName];
        let filtered = data;
        let filterApplied = 'None';
        
        // 원본 Python 코드와 동일: PN 값에 따라 필터 적용
        const pnValueRaw = (config.partNumber || config.PN || '').toString().trim().toLowerCase();
        
        if (pnValueRaw.includes('medtherm') && pnValueRaw.includes('thermocouple')) {
            // Moving Average (window_size=300)
            filtered = movingAverage(data, 300);
            filterApplied = 'MA (300샘플)';
        } else if (pnValueRaw.includes('pcb') && pnValueRaw.includes('113b22')) {
            // Low Pass Filter (cutoff=500kHz)
            filtered = lowpassFilter(data, 500000, fps);
            filterApplied = 'LP (500kHz)';
        } else if (pnValueRaw.includes('pcb') && pnValueRaw.includes('132b38')) {
            // Band Pass Filter (11kHz - 1MHz)
            filtered = bandpassFilter(data, 11000, 1000000, fps);
            filterApplied = 'BP (11kHz-1MHz)';
        } else {
            // 조건에 없는 경우 그대로 사용
            filtered = data;
            filterApplied = '필터 없음';
        }
        
        filteredChannels[channelName] = filtered;
        filteredCount++;
        
        console.log(`✅ 포트 ${portNum} 필터 적용: ${config.description} → ${filterApplied}`);
    }
    
    console.log(`필터 적용 완료: ${filteredCount}개 채널`);
    
    return {
        channels: filteredChannels,
        numSamples: convertedData.numSamples,
        timeRange: convertedData.timeRange
    };
}

// ============================================
// 8. Driven 압력 상승 감지
// ============================================

function findPressureRise(data, fps, options = {}) {
    // 압력 임계값 기반 단순 감지
    if (!data || data.length === 0) return null;
    
    const {
        startIndex = 0,
        pressureThreshold = 0.1  // bar 단위
    } = options;
    const source = data.slice(Math.max(0, startIndex));
    
    console.log(`압력 상승 감지 시작: ${data.length} 샘플, 검색 시작: ${startIndex}, 임계값: ${pressureThreshold} bar`);
    
    // 첫 번째로 임계값을 초과하는 지점 찾기
    for (let i = 0; i < source.length; i++) {
        if (source[i] >= pressureThreshold) {
            const absoluteIndex = startIndex + i;
            console.log(`✅ 압력 상승 감지: index=${absoluteIndex}, 압력=${source[i].toFixed(4)} bar, 임계값=${pressureThreshold} bar`);
            return absoluteIndex;
        }
    }
    
    // 못 찾으면 null
    console.log(`⚠️ 압력 상승을 찾을 수 없습니다. (${pressureThreshold} bar 초과 지점 없음)`);
    return null;
}

// ============================================
// 9. 시험시간 계산 (RMS 기반)
// ============================================

function calculateTestTime(filteredData, driven8Channel, fps) {
    if (driven8Channel === null) {
        return {
            startIndex: null,
            endIndex: null,
            testTime: null
        };
    }
    
    const data = filteredData.channels[`ch${driven8Channel}`];
    if (!data) return { startIndex: null, endIndex: null, testTime: null };
    
    // RMS 계산 (100샘플 윈도우)
    const windowSize = 100;
    const rmsData = [];
    
    for (let i = 0; i < data.length - windowSize; i++) {
        const window = data.slice(i, i + windowSize);
        const rms = Math.sqrt(window.reduce((sum, v) => sum + v*v, 0) / windowSize);
        rmsData.push(rms);
    }
    
    // 최대 RMS 찾기
    const maxRMS = arrayMax(rmsData);
    const threshold = maxRMS * 0.05; // 5% 임계값
    
    // 시작점: RMS가 임계값을 넘는 첫 지점
    let startIndex = null;
    for (let i = 0; i < rmsData.length; i++) {
        if (rmsData[i] > threshold) {
            startIndex = i;
            break;
        }
    }
    
    // 끝점: RMS가 임계값 아래로 떨어지는 마지막 지점
    let endIndex = null;
    for (let i = rmsData.length - 1; i >= 0; i--) {
        if (rmsData[i] > threshold) {
            endIndex = i;
            break;
        }
    }
    
    const testTime = (startIndex !== null && endIndex !== null) 
        ? (endIndex - startIndex) / fps * 1000 // ms
        : null;
    
    return {
        startIndex: startIndex,
        endIndex: endIndex,
        testTime: testTime
    };
}

// ============================================
// 10. 측정값 계산
// ============================================

function calculateMeasurements(filteredData, daqConnection, testTimeResult, fps, options = {}) {
    // 각 채널 찾기
    const driven7Ch = findChannelByDescription(daqConnection, 'driven7');
    const driven8Ch = findChannelByDescription(daqConnection, 'driven8');
    
    const {
        driverIndex = null,
        driven7Index = null,
        driven8Index = null,
        modelFrontIndex = null,
        timeOffsetStartMs = -1,
        testTimeStartMs = null,
        distanceMeters = 0.5,
        t1FromBefore = null,
        indicesOrigin = 'slice'
    } = options;
    
    const measurements = {
        p1_avg: null,
        t1_avg: t1FromBefore ?? null,
        p4_avg: null,
        p4_std: null,
        t4_avg: null,
        p5_avg: null,
        p5_std: null,
        test_time: testTimeResult.testTime,
        shock_speed: null,
        output_delay_time: null,
        output_ready_time: null,
        first_diaphragm_rupture: 0.0,
        second_diaphragm_rupture: null,
        test_time_start: null,
        test_time_end: null,
        model_front_time: null
    };
    
    // ⚠️ 주의: p1, p4는 실험 전 입력값 기준으로 계산해야 함!
    // filteredData는 이미 전압→압력 변환이 완료된 상태이지만,
    // 기준점이 잘못되어 있을 수 있음.
    // 
    // 올바른 방법:
    // 1. p1 = 1 + 드리븐압력[barg] (실험 전 입력값)
    // 2. p4, p5는 전압 변화량 × 기울기 + p1
    
    // p1은 실험 전 입력값에서 계산 (유동조건 계산에서 사용)
    // 여기서는 참고용으로만 표시
    if (driven7Ch !== null) {
        const data = filteredData.channels[`ch${driven7Ch}`];
        if (data) {
            const baseline = data.slice(0, Math.min(1000, data.length));
            // 주의: 이 값은 전압→압력 변환된 값이므로 부정확할 수 있음
            // 실제 p1은 유동조건 계산에서 실험 전 입력값 사용
            measurements.p1_avg = average(baseline);
        }
    }
    
    // p4, p5 (driven7, driven8의 시험시간 구간 평균)
    if (testTimeResult.startIndex !== null && testTimeResult.endIndex !== null) {
        if (driven7Ch !== null) {
            const data = filteredData.channels[`ch${driven7Ch}`];
            if (data) {
                const testRegion = data.slice(testTimeResult.startIndex, testTimeResult.endIndex);
                measurements.p4_avg = average(testRegion);
                measurements.p4_std = standardDeviation(testRegion);
            }
        }
        
        if (driven8Ch !== null) {
            const data = filteredData.channels[`ch${driven8Ch}`];
            if (data) {
                const testRegion = data.slice(testTimeResult.startIndex, testTimeResult.endIndex);
                measurements.p5_avg = average(testRegion);
                measurements.p5_std = standardDeviation(testRegion);
            }
        }
    }
    
    // 시험 시작/끝 시간 (ms) 계산
    let resolvedTestTimeStartMs = testTimeStartMs;
    if (resolvedTestTimeStartMs === null && testTimeResult.startIndex !== null) {
        resolvedTestTimeStartMs = (testTimeResult.startIndex / fps * 1000) + timeOffsetStartMs;
    }
    if (resolvedTestTimeStartMs !== null) {
        measurements.test_time_start = resolvedTestTimeStartMs;
        if (testTimeResult.testTime !== null) {
            measurements.test_time_end = resolvedTestTimeStartMs + testTimeResult.testTime;
        }
    }
    
    // driven7/8, model front 시간 계산
    let driven7TimeSec = null;
    let driven8TimeSec = null;
    let modelFrontTimeSec = null;
    
    if (indicesOrigin === 'full' && driverIndex !== null) {
        driven7TimeSec = driven7Index !== null ? (driven7Index - driverIndex) / fps : null;
        driven8TimeSec = driven8Index !== null ? (driven8Index - driverIndex) / fps : null;
        modelFrontTimeSec = modelFrontIndex !== null ? (modelFrontIndex - driverIndex) / fps : null;
    } else {
        const offsetSec = (timeOffsetStartMs || 0) / 1000;
        driven7TimeSec = driven7Index !== null ? (driven7Index / fps) + offsetSec : null;
        driven8TimeSec = driven8Index !== null ? (driven8Index / fps) + offsetSec : null;
        modelFrontTimeSec = modelFrontIndex !== null ? (modelFrontIndex / fps) + offsetSec : null;
    }
    
    if (driven8TimeSec !== null) {
        measurements.second_diaphragm_rupture = driven8TimeSec * 1000;
    }
    if (modelFrontTimeSec !== null) {
        measurements.model_front_time = modelFrontTimeSec * 1000;
    }
    
    // shock_speed 계산 (driven7과 driven8 사이 거리 / 시간차)
    if (driven7TimeSec !== null && driven8TimeSec !== null) {
        const deltaT = driven8TimeSec - driven7TimeSec;
        if (deltaT > 0) {
            measurements.shock_speed = distanceMeters / deltaT;
        }
    }
    
    // output_delay_time, output_ready_time
    if (modelFrontTimeSec !== null && driven8TimeSec !== null) {
        measurements.output_delay_time = (modelFrontTimeSec - driven8TimeSec) * 1000;
    }
    if (resolvedTestTimeStartMs !== null && driven8TimeSec !== null) {
        measurements.output_ready_time = resolvedTestTimeStartMs - (driven8TimeSec * 1000);
    }
    
    return measurements;
}

// ============================================
// 유틸리티 함수
// ============================================

function validateDataMatching(expData, daqConnection) {
    console.log('데이터 매칭 검증 시작...');
    
    // 실험 데이터의 포트 번호
    const expPortNumbers = expData.portNumbers || [];
    console.log('실험 데이터 포트:', expPortNumbers);
    
    // DAQ Connection의 포트 번호 (type이 'X'가 아닌 것만)
    const daqPortNumbers = daqConnection
        .filter(c => c.type !== 'X')
        .map(c => c.channel)
        .sort((a, b) => a - b);
    console.log('DAQ Connection 포트 (사용 중):', daqPortNumbers);
    
    // 매칭 확인
    const matchedPorts = [];
    const unmatchedExpPorts = [];
    const unmatchedDaqPorts = [];
    
    expPortNumbers.forEach(port => {
        if (daqPortNumbers.includes(port)) {
            matchedPorts.push(port);
        } else {
            unmatchedExpPorts.push(port);
        }
    });
    
    daqPortNumbers.forEach(port => {
        if (!expPortNumbers.includes(port)) {
            unmatchedDaqPorts.push(port);
        }
    });
    
    console.log('매칭 결과:', {
        matched: matchedPorts,
        expOnly: unmatchedExpPorts,
        daqOnly: unmatchedDaqPorts
    });
    
    // 경고 메시지
    if (unmatchedExpPorts.length > 0) {
        console.warn(`⚠️ 실험 데이터에만 있는 포트: ${unmatchedExpPorts.join(', ')}`);
        console.warn('→ DAQ Connection에 해당 포트가 없습니다. 변환되지 않습니다.');
    }
    
    if (unmatchedDaqPorts.length > 0) {
        console.warn(`⚠️ DAQ Connection에만 있는 포트: ${unmatchedDaqPorts.join(', ')}`);
        console.warn('→ 실험 데이터에 해당 포트가 없습니다.');
    }
    
    console.log(`✅ 매칭 완료: ${matchedPorts.length}개 포트`);
    
    return {
        matched: matchedPorts,
        expOnly: unmatchedExpPorts,
        daqOnly: unmatchedDaqPorts
    };
}

function findChannelByDescription(daqConnection, description) {
    for (let config of daqConnection) {
        if (config.description === description) {
            return config.channel;
        }
    }
    return null;
}

function arrayMinMax(arr) {
    if (!arr || arr.length === 0) return { min: null, max: null };
    
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    
    if (!isFinite(min) || !isFinite(max)) return { min: null, max: null };
    return { min, max };
}

function arrayMax(arr) {
    return arrayMinMax(arr).max;
}

function average(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a,b) => a+b, 0) / arr.length;
}

function standardDeviation(arr) {
    if (!arr || arr.length === 0) return null;
    const avg = average(arr);
    const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
}

function updateProgress(percent, text) {
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').textContent = text;
}

function updateMeasurementFields(measurements) {
    document.getElementById('p1-avg').value = measurements.p1_avg?.toFixed(4) || '';
    document.getElementById('t1-avg').value = measurements.t1_avg?.toFixed(2) || '';
    document.getElementById('p4-avg').value = measurements.p4_avg?.toFixed(4) || '';
    document.getElementById('p4-std').value = measurements.p4_std?.toFixed(4) || '';
    document.getElementById('t4-avg').value = measurements.t4_avg?.toFixed(2) || '';
    document.getElementById('p5-avg').value = measurements.p5_avg?.toFixed(4) || '';
    document.getElementById('p5-std').value = measurements.p5_std?.toFixed(4) || '';
    document.getElementById('test-time').value = measurements.test_time?.toFixed(3) || '';
    document.getElementById('shock-speed').value = measurements.shock_speed?.toFixed(2) || '';
}
