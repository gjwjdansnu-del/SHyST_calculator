// ============================================
// 후처리 UI 및 시각화
// ============================================

// ============================================
// 1. 결과 미리보기 그래프
// ============================================

function drawResultPreview(filteredData, daqConnection) {
    const canvas = document.getElementById('result-preview');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);
    
    // 주요 채널 찾기
    const driven7Ch = findChannelByDescription(daqConnection, 'driven7');
    const driven8Ch = findChannelByDescription(daqConnection, 'driven8');
    const driverCh = findChannelByDescription(daqConnection, 'driver');
    
    const channels = [];
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
    
    if (driven7Ch !== null) {
        channels.push({
            name: 'Driven 7 (p4)',
            data: filteredData.channels[`ch${driven7Ch}`],
            color: colors[0]
        });
    }
    
    if (driven8Ch !== null) {
        channels.push({
            name: 'Driven 8 (p5)',
            data: filteredData.channels[`ch${driven8Ch}`],
            color: colors[1]
        });
    }
    
    if (driverCh !== null) {
        channels.push({
            name: 'Driver',
            data: filteredData.channels[`ch${driverCh}`],
            color: colors[2]
        });
    }
    
    if (channels.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('표시할 데이터가 없습니다', width/2, height/2);
        return;
    }
    
    // 그래프 영역 설정
    const padding = { top: 40, right: 150, bottom: 60, left: 80 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    
    // 데이터 범위 계산
    let minY = Infinity;
    let maxY = -Infinity;
    
    channels.forEach(ch => {
        const stats = arrayMinMax(ch.data);
        if (stats.min === null || stats.max === null) return;
        if (stats.min < minY) minY = stats.min;
        if (stats.max > maxY) maxY = stats.max;
    });
    
    // 여유 공간 추가
    const yRange = maxY - minY;
    minY -= yRange * 0.1;
    maxY += yRange * 0.1;
    
    let maxX = 0;
    channels.forEach(ch => {
        if (ch.data.length > maxX) maxX = ch.data.length;
    });
    
    // 축 그리기
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();
    
    // Y축 눈금
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (plotHeight * i / 5);
        const value = maxY - (yRange * i / 5);
        
        ctx.fillText(value.toFixed(2), padding.left - 10, y + 4);
        
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }
    
    // X축 눈금
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
        const x = padding.left + (plotWidth * i / 5);
        const value = (maxX * i / 5);
        
        ctx.fillText(Math.round(value), x, height - padding.bottom + 20);
    }
    
    // 축 레이블
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Sample Index', width / 2, height - 20);
    
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Pressure [bar]', 0, 0);
    ctx.restore();
    
    // 제목
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Filtered Data Preview', width / 2, 25);
    
    // 데이터 플롯
    channels.forEach((ch, idx) => {
        ctx.strokeStyle = ch.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < ch.data.length; i++) {
            const x = padding.left + (i / maxX) * plotWidth;
            const y = padding.top + plotHeight - ((ch.data[i] - minY) / yRange) * plotHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 범례
        const legendY = padding.top + 20 + idx * 25;
        ctx.fillStyle = ch.color;
        ctx.fillRect(width - padding.right + 10, legendY - 8, 20, 3);
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(ch.name, width - padding.right + 35, legendY);
    });
}

// ============================================
// 2. 엑셀 다운로드 함수들
// ============================================

function downloadSlicedData() {
    if (!processedResults) {
        alert('먼저 데이터를 처리해주세요.');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    // 시계열 데이터를 행렬로 변환
    const data = convertChannelsToMatrix(processedResults.slicedData.channels);
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    XLSX.utils.book_append_sheet(wb, ws, "Sliced Data");
    
    const filename = `exp${currentExperiment.expNumber}_01_sliced.xlsx`;
    XLSX.writeFile(wb, filename);
    
    console.log('슬라이스 데이터 다운로드:', filename);
}

function downloadConvertedData() {
    if (!processedResults) {
        alert('먼저 데이터를 처리해주세요.');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    const data = convertChannelsToMatrix(
        processedResults.convertedData.channels,
        (channelName) => getConvertedHeader(channelName, uploadedDAQConnection)
    );
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    XLSX.utils.book_append_sheet(wb, ws, "Converted Data");
    
    const filename = `exp${currentExperiment.expNumber}_02_converted.xlsx`;
    XLSX.writeFile(wb, filename);
    
    console.log('변환 데이터 다운로드:', filename);
}

function downloadFilteredData() {
    if (!processedResults) {
        alert('먼저 데이터를 처리해주세요.');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    const data = convertChannelsToMatrix(processedResults.filteredData.channels);
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    XLSX.utils.book_append_sheet(wb, ws, "Filtered Data");
    
    const filename = `exp${currentExperiment.expNumber}_03_filtered.xlsx`;
    XLSX.writeFile(wb, filename);
    
    console.log('필터 데이터 다운로드:', filename);
}

function downloadFinalResults() {
    if (!processedResults || !currentExperiment) {
        alert('먼저 데이터를 처리해주세요.');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    
    // 단일 시트: 최종 결과(1행)
    const summary = createParametersSheet();
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    
    const filename = `exp${currentExperiment.expNumber}_final.xlsx`;
    XLSX.writeFile(wb, filename);
    
    console.log('최종 결과 다운로드:', filename);
}

function downloadAllResults() {
    // 모든 파일을 ZIP으로 묶어서 다운로드
    // 간단하게 하나씩 다운로드
    downloadSlicedData();
    setTimeout(() => downloadConvertedData(), 500);
    setTimeout(() => downloadFilteredData(), 1000);
    setTimeout(() => downloadFinalResults(), 1500);
}

// ============================================
// 3. 데이터 변환 유틸리티
// ============================================

function convertChannelsToMatrix(channels, headerMapper = null) {
    // 채널 데이터를 2D 배열로 변환 (엑셀 형식)
    
    const channelNames = Object.keys(channels).sort((a, b) => {
        const numA = parseInt(a.replace('ch', ''));
        const numB = parseInt(b.replace('ch', ''));
        return numA - numB;
    });
    
    if (channelNames.length === 0) return [[]];
    
    // 헤더 행
    const header = channelNames.map(name => {
        if (typeof headerMapper === 'function') {
            return headerMapper(name);
        }
        return name.replace('ch', '전압_');
    });
    
    // 데이터 행
    const numSamples = channels[channelNames[0]].length;
    const rows = [header];
    
    for (let i = 0; i < numSamples; i++) {
        const row = channelNames.map(name => channels[name][i]);
        rows.push(row);
    }
    
    return rows;
}

function createSummarySheet() {
    const exp = currentExperiment;
    const measurements = processedResults.measurements;
    
    const summary = [
        ['SHyST 실험 결과 요약'],
        [],
        ['실험 정보'],
        ['실험 번호', exp.expNumber],
        ['날짜', exp.before.expInfo.date],
        ['실험자', exp.before.expInfo.name],
        ['테스트 모델', exp.before.expInfo.testModel],
        ['실험 목적', exp.before.expInfo.objective],
        ['목표 마하수', exp.before.expInfo.targetMach],
        [],
        ['실험 조건'],
        ['대기압 [hPa]', exp.before.shystSetting.airPressure],
        ['대기 온도 [°C]', exp.before.shystSetting.airTemp],
        ['대기 습도 [%]', exp.before.shystSetting.airHumidity],
        ['드라이버 가스', exp.before.shystSetting.driverGas],
        ['드리븐 가스', exp.before.shystSetting.drivenGas],
        ['드리븐 압력 [barg]', exp.before.shystSetting.drivenPressure],
        ['진공 게이지 [Torr]', exp.before.shystSetting.vacuumGauge],
        ['DAQ 샘플링 [Hz]', exp.before.shystSetting.daqSampling],
        [],
        ['측정 결과'],
        ['p1 평균 [bar]', measurements.p1_avg],
        ['T1 평균 [°C]', measurements.t1_avg],
        ['p4 평균 [bar]', measurements.p4_avg],
        ['p4 표준편차 [bar]', measurements.p4_std],
        ['T4 평균 [°C]', measurements.t4_avg],
        ['p5 평균 [bar]', measurements.p5_avg],
        ['p5 표준편차 [bar]', measurements.p5_std],
        ['시험시간 [ms]', measurements.test_time],
        ['충격파 속도 [m/s]', measurements.shock_speed],
        ['Output Delay Time [ms]', measurements.output_delay_time],
        ['Output Ready Time [ms]', measurements.output_ready_time],
        ['Test Time Start [ms]', measurements.test_time_start],
        ['Test Time End [ms]', measurements.test_time_end],
        ['First Diaphragm Rupture [ms]', measurements.first_diaphragm_rupture],
        ['Second Diaphragm Rupture [ms]', measurements.second_diaphragm_rupture],
        ['Model Front Time [ms]', measurements.model_front_time],
    ];
    
    return summary;
}

function getConvertedHeader(channelName, daqConnection) {
    const portNum = parseInt(channelName.replace('ch', ''), 10);
    const config = daqConnection?.find(c => c.channel === portNum);
    const base = `전압_${portNum}`;
    
    if (!config) return `${base}_value`;
    
    const cal = String(config.calibration || '').toLowerCase();
    const pn = String(config.partNumber || config.PN || '').toLowerCase();
    const type = String(config.type || '').toLowerCase();
    
    const isTemp = type === 't' || pn.includes('thermocouple') || cal === 'e' || cal === 'av+b';
    const unit = isTemp ? (cal === 'e' ? 'K' : '°C') : 'bar';
    const label = isTemp ? 'temperature' : 'pressure';
    const desc = config.description ? `_${config.description}` : '';
    
    return `${base}${desc}_${label} [${unit}]`;
}

function createParametersSheet() {
    const m = processedResults.measurements;
    const headers = [
        'p4_avg[bar]',
        'p5_avg[bar]',
        'p5_std[bar]',
        'test_time[ms]',
        'shock_speed[m/s]',
        'output_delay_time[ms]',
        'output_ready_time[ms]',
        'first diaphragm rupture[ms]',
        'second diaphragm rupture[ms]',
        'test time start(nozzle reservoir)[ms]',
        'test time end(nozzle reservoir)[ms]',
        'cone_shock_time[ms]'
    ];
    
    const row = [
        m.p4_avg,
        m.p5_avg,
        m.p5_std,
        m.test_time,
        m.shock_speed,
        m.output_delay_time,
        m.output_ready_time,
        m.first_diaphragm_rupture,
        m.second_diaphragm_rupture,
        m.test_time_start,
        m.test_time_end,
        m.model_front_time
    ];
    
    return [headers, row];
}

// ============================================
// 4. 저장 버튼 핸들러
// ============================================

async function saveProcessingData() {
    if (!currentExperiment || !processedResults) {
        alert('먼저 데이터를 처리해주세요.');
        return;
    }
    
    // 측정값을 currentExperiment에 저장
    currentExperiment.after.labviewLog = processedResults.measurements;
    
    // 상태 업데이트
    currentExperiment.status = 'processing_complete';
    
    try {
        await saveExperiment(currentExperiment);
        alert('✅ 후처리 데이터가 저장되었습니다.');
        console.log('Processing data saved:', currentExperiment);
    } catch (e) {
        console.error('Failed to save:', e);
        alert('❌ 저장 실패: ' + e.message);
    }
}
