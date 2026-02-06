// ============================================
// 데이터 후처리 모듈
// CSV/TXT 파일 파싱, 전압-물리량 변환, 시각화
// ============================================

let rawDataFiles = [];
let parsedData = {};
let chartData = null;

// 파일 업로드 핸들러
document.getElementById('raw-data-upload').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        const reader = new FileReader();
        
        reader.onload = function(event) {
            const content = event.target.result;
            const parsed = parseCSVData(content, file.name);
            
            if (parsed) {
                rawDataFiles.push({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: parsed
                });
                
                parsedData[file.name] = parsed;
                
                updateUploadedFilesList();
                visualizeData();
            }
        };
        
        reader.readAsText(file);
    });
});

// CSV 데이터 파싱
function parseCSVData(content, filename) {
    try {
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            console.error('파일이 너무 짧습니다:', filename);
            return null;
        }
        
        // 헤더 파싱
        const headers = lines[0].split(/[,\t]/).map(h => h.trim());
        
        // 데이터 파싱
        const data = {};
        headers.forEach(header => {
            data[header] = [];
        });
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(/[,\t]/);
            
            headers.forEach((header, idx) => {
                const value = parseFloat(values[idx]);
                if (!isNaN(value)) {
                    data[header].push(value);
                }
            });
        }
        
        return {
            headers: headers,
            data: data,
            length: data[headers[0]].length
        };
        
    } catch (e) {
        console.error('CSV 파싱 오류:', e);
        return null;
    }
}

// 업로드된 파일 목록 업데이트
function updateUploadedFilesList() {
    const listDiv = document.getElementById('uploaded-files-list');
    listDiv.innerHTML = '';
    
    rawDataFiles.forEach((file, idx) => {
        const item = document.createElement('div');
        item.className = 'uploaded-file-item';
        item.innerHTML = `
            <div class="file-info">
                <span class="file-icon">📄</span>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${(file.size / 1024).toFixed(2)} KB · ${file.data.length} 샘플</div>
                </div>
            </div>
            <button class="action-btn delete" onclick="removeUploadedFile(${idx})">삭제</button>
        `;
        listDiv.appendChild(item);
    });
}

function removeUploadedFile(idx) {
    const file = rawDataFiles[idx];
    delete parsedData[file.name];
    rawDataFiles.splice(idx, 1);
    
    updateUploadedFilesList();
    visualizeData();
}

// 데이터 시각화
function visualizeData() {
    const canvas = document.getElementById('data-preview-canvas');
    const ctx = canvas.getContext('2d');
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (rawDataFiles.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('데이터 파일을 업로드하면 여기에 표시됩니다', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // 첫 번째 파일의 데이터 시각화 (간단한 구현)
    const firstFile = rawDataFiles[0];
    const data = firstFile.data.data;
    const headers = firstFile.data.headers;
    
    // 시간 축 찾기 (Time, t, time 등)
    let timeKey = headers.find(h => h.toLowerCase().includes('time'));
    if (!timeKey) timeKey = headers[0];
    
    const timeData = data[timeKey];
    
    if (!timeData || timeData.length === 0) {
        return;
    }
    
    // 그래프 그리기
    const padding = { top: 40, right: 40, bottom: 60, left: 80 };
    const plotWidth = canvas.width - padding.left - padding.right;
    const plotHeight = canvas.height - padding.top - padding.bottom;
    
    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 축
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();
    
    // 데이터 플롯 (첫 3개 채널만)
    const colors = ['#58a6ff', '#3fb950', '#f85149', '#d29922', '#a371f7'];
    let channelIdx = 0;
    
    for (const header of headers) {
        if (header === timeKey) continue;
        if (channelIdx >= 3) break;
        
        const channelData = data[header];
        if (!channelData || channelData.length === 0) continue;
        
        // 정규화
        const minTime = Math.min(...timeData);
        const maxTime = Math.max(...timeData);
        const minVal = Math.min(...channelData);
        const maxVal = Math.max(...channelData);
        
        if (maxTime === minTime || maxVal === minVal) continue;
        
        // 플롯
        ctx.strokeStyle = colors[channelIdx];
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < timeData.length; i++) {
            const x = padding.left + ((timeData[i] - minTime) / (maxTime - minTime)) * plotWidth;
            const y = canvas.height - padding.bottom - ((channelData[i] - minVal) / (maxVal - minVal)) * plotHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 범례
        ctx.fillStyle = colors[channelIdx];
        ctx.fillRect(canvas.width - padding.right - 150, padding.top + channelIdx * 25, 20, 10);
        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(header, canvas.width - padding.right - 125, padding.top + channelIdx * 25 + 10);
        
        channelIdx++;
    }
    
    // 축 레이블
    ctx.fillStyle = '#e6edf3';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time [s]', canvas.width / 2, canvas.height - 20);
    
    ctx.save();
    ctx.translate(20, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Signal', 0, 0);
    ctx.restore();
}

// 센서 캘리브레이션 적용
function applySensorCalibration(voltage, calibration) {
    const { slope, offset, type } = calibration;
    
    if (type === 'linear') {
        return voltage * slope + offset;
    } else if (type === 'polynomial') {
        // 다항식 변환 (추후 구현)
        return voltage * slope + offset;
    }
    
    return voltage;
}

// 평균값 계산
function calculateAverage(data, startIdx, endIdx) {
    if (!data || data.length === 0) return null;
    
    const slice = data.slice(startIdx, endIdx);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / slice.length;
}

// 표준편차 계산
function calculateStdDev(data, startIdx, endIdx) {
    if (!data || data.length === 0) return null;
    
    const slice = data.slice(startIdx, endIdx);
    const avg = calculateAverage(data, startIdx, endIdx);
    
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / slice.length;
    return Math.sqrt(variance);
}

// 자동 데이터 분석 (간단한 구현)
function autoAnalyzeData() {
    if (rawDataFiles.length === 0) {
        alert('먼저 데이터 파일을 업로드해주세요.');
        return;
    }
    
    const firstFile = rawDataFiles[0];
    const data = firstFile.data.data;
    const headers = firstFile.data.headers;
    
    // p1, p4, p5, T1, T4 찾기
    const p1Key = headers.find(h => h.toLowerCase().includes('p1'));
    const p4Key = headers.find(h => h.toLowerCase().includes('p4'));
    const p5Key = headers.find(h => h.toLowerCase().includes('p5'));
    const t1Key = headers.find(h => h.toLowerCase().includes('t1'));
    const t4Key = headers.find(h => h.toLowerCase().includes('t4'));
    
    // 전체 데이터의 평균 계산 (간단한 구현)
    if (p1Key && data[p1Key]) {
        const avg = calculateAverage(data[p1Key], 0, data[p1Key].length);
        document.getElementById('p1-avg').value = avg.toFixed(4);
    }
    
    if (p4Key && data[p4Key]) {
        const avg = calculateAverage(data[p4Key], 0, data[p4Key].length);
        const std = calculateStdDev(data[p4Key], 0, data[p4Key].length);
        document.getElementById('p4-avg').value = avg.toFixed(4);
        document.getElementById('p4-std').value = std.toFixed(4);
    }
    
    if (p5Key && data[p5Key]) {
        const avg = calculateAverage(data[p5Key], 0, data[p5Key].length);
        const std = calculateStdDev(data[p5Key], 0, data[p5Key].length);
        document.getElementById('p5-avg').value = avg.toFixed(4);
        document.getElementById('p5-std').value = std.toFixed(4);
    }
    
    if (t1Key && data[t1Key]) {
        const avg = calculateAverage(data[t1Key], 0, data[t1Key].length);
        document.getElementById('t1-avg').value = avg.toFixed(2);
    }
    
    if (t4Key && data[t4Key]) {
        const avg = calculateAverage(data[t4Key], 0, data[t4Key].length);
        document.getElementById('t4-avg').value = avg.toFixed(2);
    }
    
    alert('✅ 자동 분석이 완료되었습니다. 결과를 확인해주세요.');
}
