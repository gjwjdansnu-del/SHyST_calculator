// 간단한 파일 업로드 처리
console.log('=== simple-upload.js 로드됨 ===');

// 전역 변수
let uploadedExpData = null;
let uploadedDAQConnection = null;

// 페이지 로드 후 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOM 로드 완료 (simple-upload.js) ===');
    
    // 실험 데이터 파일 입력
    const expDataInput = document.getElementById('exp-data-file');
    if (expDataInput) {
        console.log('✅ exp-data-file 요소 찾음');
        expDataInput.addEventListener('change', async function(e) {
            console.log('=== 실험 데이터 파일 변경 이벤트 ===');
            // post-processing.js의 핸들러 함수 호출
            if (typeof handleExpDataUpload === 'function') {
                await handleExpDataUpload(e);
            } else {
                console.error('❌ handleExpDataUpload 함수를 찾을 수 없습니다!');
                await loadExpDataFile(e.target.files[0]);
            }
        });
    } else {
        console.error('❌ exp-data-file 요소를 찾을 수 없습니다!');
    }
    
    // DAQ Connection 파일 입력
    const daqInput = document.getElementById('daq-connection-file');
    if (daqInput) {
        console.log('✅ daq-connection-file 요소 찾음');
        daqInput.addEventListener('change', async function(e) {
            console.log('=== DAQ Connection 파일 변경 이벤트 ===');
            // post-processing.js의 핸들러 함수 호출
            if (typeof handleDAQConnectionUpload === 'function') {
                await handleDAQConnectionUpload(e);
            } else {
                console.error('❌ handleDAQConnectionUpload 함수를 찾을 수 없습니다!');
                await loadDAQConnectionFile(e.target.files[0]);
            }
        });
    } else {
        console.error('❌ daq-connection-file 요소를 찾을 수 없습니다!');
    }
    
    console.log('=== 이벤트 리스너 등록 완료 ===');
});

// 실험 데이터 파일 로드
async function loadExpDataFile(file) {
    if (!file) {
        console.log('파일이 선택되지 않음');
        return;
    }
    
    console.log('파일 정보:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    const statusEl = document.getElementById('exp-data-status');
    statusEl.textContent = '⏳ 로딩 중...';
    statusEl.style.color = 'orange';
    
    try {
        // XLSX 라이브러리 확인
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX 라이브러리가 로드되지 않았습니다.');
        }
        
        console.log('⏳ 파일 읽기 시작...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('✅ ArrayBuffer 크기:', arrayBuffer.byteLength);
        
        console.log('⏳ XLSX 파싱...');
        const workbook = XLSX.read(arrayBuffer);
        console.log('✅ Workbook 로드 완료');
        console.log('시트:', workbook.SheetNames);
        
        // Sheet 1에서 채널 수 읽기 (B5)
        const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
        const numChannels = sheet1['B5'] ? parseInt(sheet1['B5'].v) : null;
        console.log('채널 수 (B5):', numChannels);
        
        // Sheet 2에서 데이터 읽기
        const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
        const jsonData = XLSX.utils.sheet_to_json(sheet2, {header: 1});
        console.log('데이터 행 수:', jsonData.length);
        
        // 데이터 파싱
        uploadedExpData = parseExpData(jsonData, numChannels);
        console.log('✅ 파싱 완료:', uploadedExpData);
        
        statusEl.textContent = `✅ ${file.name} (${uploadedExpData.numChannels}채널, ${uploadedExpData.numSamples}샘플)`;
        statusEl.style.color = 'green';
        
    } catch (error) {
        console.error('❌ 오류:', error);
        statusEl.textContent = '❌ 로드 실패: ' + error.message;
        statusEl.style.color = 'red';
        alert('파일 로드 실패:\n' + error.message);
    }
}

// DAQ Connection 파일 로드
async function loadDAQConnectionFile(file) {
    if (!file) {
        console.log('파일이 선택되지 않음');
        return;
    }
    
    console.log('파일 정보:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    const statusEl = document.getElementById('daq-status');
    statusEl.textContent = '⏳ 로딩 중...';
    statusEl.style.color = 'orange';
    
    try {
        // XLSX 라이브러리 확인
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX 라이브러리가 로드되지 않았습니다.');
        }
        
        console.log('⏳ 파일 읽기 시작...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('✅ ArrayBuffer 크기:', arrayBuffer.byteLength);
        
        console.log('⏳ XLSX 파싱...');
        const workbook = XLSX.read(arrayBuffer);
        console.log('✅ Workbook 로드 완료');
        
        // 첫 번째 시트 읽기
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        console.log('데이터 행 수:', jsonData.length);
        
        // 데이터 파싱
        uploadedDAQConnection = parseDAQConnection(jsonData);
        console.log('✅ 파싱 완료:', uploadedDAQConnection);
        
        statusEl.textContent = `✅ ${file.name} (${uploadedDAQConnection.length}개 센서)`;
        statusEl.style.color = 'green';
        
    } catch (error) {
        console.error('❌ 오류:', error);
        statusEl.textContent = '❌ 로드 실패: ' + error.message;
        statusEl.style.color = 'red';
        alert('파일 로드 실패:\n' + error.message);
    }
}

console.log('=== simple-upload.js 로드 완료 ===');
