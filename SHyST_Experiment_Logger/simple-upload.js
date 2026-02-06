// 간단한 파일 업로드 처리
console.log('=== simple-upload.js 로드됨 ===');

// 전역 변수는 post-processing.js에서 관리됨

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
                console.log('✅ handleExpDataUpload 함수 호출');
                await handleExpDataUpload(e);
            } else {
                console.error('❌ handleExpDataUpload 함수를 찾을 수 없습니다!');
                console.error('post-processing.js가 로드되지 않았을 수 있습니다.');
                alert('오류: 파일 처리 함수를 찾을 수 없습니다.\n페이지를 새로고침(Ctrl+Shift+R)해주세요.');
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
                console.log('✅ handleDAQConnectionUpload 함수 호출');
                await handleDAQConnectionUpload(e);
            } else {
                console.error('❌ handleDAQConnectionUpload 함수를 찾을 수 없습니다!');
                console.error('post-processing.js가 로드되지 않았을 수 있습니다.');
                alert('오류: 파일 처리 함수를 찾을 수 없습니다.\n페이지를 새로고침(Ctrl+Shift+R)해주세요.');
            }
        });
    } else {
        console.error('❌ daq-connection-file 요소를 찾을 수 없습니다!');
    }
    
    console.log('=== 이벤트 리스너 등록 완료 ===');
});

// 이 파일의 함수들은 더 이상 사용하지 않습니다.
// 모든 파일 처리는 post-processing.js의 handleExpDataUpload와 handleDAQConnectionUpload에서 처리됩니다.

console.log('=== simple-upload.js 로드 완료 ===');
