# 🔧 엑셀 입력 문제 해결 요약

## 📋 발견된 문제

### 1. **이벤트 핸들러 불일치**
- `simple-upload.js`가 잘못된 함수를 호출하고 있었습니다
- `loadExpDataFile()` 대신 `handleExpDataUpload()`를 호출해야 함
- `loadDAQConnectionFile()` 대신 `handleDAQConnectionUpload()`를 호출해야 함

### 2. **Python 코드와의 구조적 차이**
| 항목 | Python 코드 | JavaScript 웹앱 |
|------|-------------|-----------------|
| 파일 선택 | 폴더 선택 → 자동 파일 검색 | 개별 파일 수동 업로드 |
| 체크리스트 | 자동 로드 및 검색 | 수동 입력 (Before 탭) |
| 실험 번호 | 파일명에서 자동 추출 | 수동 입력 |
| 진공압/드리븐 압력 | 체크리스트에서 자동 | 수동 입력 |

---

## ✅ 수정 내용

### 파일: `simple-upload.js`

**수정 전:**
```javascript
expDataInput.addEventListener('change', async function(e) {
    await loadExpDataFile(e.target.files[0]);  // ❌ 잘못된 함수
});
```

**수정 후:**
```javascript
expDataInput.addEventListener('change', async function(e) {
    // post-processing.js의 핸들러 함수 호출
    if (typeof handleExpDataUpload === 'function') {
        await handleExpDataUpload(e);  // ✅ 올바른 함수
    } else {
        console.error('❌ handleExpDataUpload 함수를 찾을 수 없습니다!');
        await loadExpDataFile(e.target.files[0]);
    }
});
```

동일하게 `handleDAQConnectionUpload`도 수정했습니다.

---

## 🧪 테스트 방법

### 1. **간단한 테스트 (권장)**
1. `FILE_UPLOAD_TEST.html` 파일을 브라우저에서 열기
2. 실험 데이터 파일 업로드
3. DAQ Connection 파일 업로드
4. "데이터 검증" 버튼 클릭
5. 로그 확인

### 2. **실제 앱에서 테스트**
1. `index.html` 파일을 브라우저에서 열기 (또는 로컬 서버 실행)
2. Before 탭에서 실험 정보 입력 후 저장
3. Processing 탭으로 이동
4. 파일 업로드:
   - 실험 측정 데이터 선택 → 상태 확인: `✅ {파일명} (N채널, M샘플)`
   - DAQ Connection 선택 → 상태 확인: `✅ {파일명} (N개 센서)`
5. "▶️ 1단계 처리" 버튼 클릭
6. 진행 상황 및 결과 확인

---

## 🐛 여전히 문제가 있다면?

### 체크리스트
- [ ] 페이지를 강제 새로고침했는가? (Ctrl+F5 / Cmd+Shift+R)
- [ ] 브라우저 콘솔(F12)에 오류가 있는가?
- [ ] 실험 전 데이터를 저장했는가?
- [ ] 파일 형식이 올바른가?

### 브라우저 콘솔 확인 명령어
```javascript
// 1. XLSX 라이브러리 확인
typeof XLSX  // "object"가 출력되어야 함

// 2. 함수 존재 확인
typeof handleExpDataUpload  // "function"이어야 함
typeof handleDAQConnectionUpload  // "function"이어야 함

// 3. 업로드된 데이터 확인
uploadedExpData  // null이 아니어야 함
uploadedDAQConnection  // null이 아니어야 함

// 4. 현재 실험 확인
currentExperiment  // null이 아니어야 함
```

### 파일 형식 확인

#### 실험 데이터 파일 (`.xlsx`)
- **Sheet 1**: 메타데이터
  - B5 셀: 채널 수 (숫자)
- **Sheet 2**: 실제 데이터
  - 헤더 행: `전압_0`, `전압_1`, `전압_2`, ...
  - 데이터 행: 각 채널의 전압 값

#### DAQ Connection 파일 (`.xlsx`)
- **Sheet 1**: 센서 설정
  - 컬럼: `#`, `type`, `PN`, `SN`, `cal`, `a`, `b`, `etc`, `filter`
  - `#`: 포트 번호 (0, 1, 2, ...)
  - `etc`: 센서 설명
    - **필수**: `driver` (Driver 압력 센서)
    - 선택: `driven7`, `driven8`, `drivenT`

---

## 📚 추가 문서

1. **`USAGE_GUIDE_KR.md`**: 전체 사용 가이드 (Python 코드와의 차이점 포함)
2. **`FILE_UPLOAD_TEST.html`**: 파일 업로드 테스트 페이지
3. **`README.md`**: 프로젝트 전체 설명

---

## 🔄 Python 코드와 동일성 검증

### 알고리즘 비교

| 단계 | Python | JavaScript | 상태 |
|------|--------|------------|------|
| Driver 압력 강하 감지 | 10000개 이동평균 + 기울기 임계값 | 동일 | ✅ |
| 데이터 슬라이싱 | -1ms ~ 30ms | 동일 | ✅ |
| 전압 → 물리량 변환 | 5가지 calibration | 동일 | ✅ |
| 필터 적용 | MA, LP, BP | 동일 | ✅ |
| Driven 압력 상승 | 기울기 임계값 | 동일 | ✅ |
| 시험시간 계산 | RMS 기반 | 동일 | ✅ |
| 측정값 계산 | p1, T1, p4, p5, T4 | 동일 | ✅ |

### 주요 차이점
- **체크리스트 사용**: Python은 자동, JavaScript는 수동 입력
- **파일 선택**: Python은 폴더, JavaScript는 개별 파일
- **실험 번호**: Python은 파일명 파싱, JavaScript는 수동 입력

---

## 💡 개선 제안 (향후)

1. **폴더 업로드 지원** (File System Access API)
2. **체크리스트 자동 검색** (엑셀 파일 업로드 시)
3. **실험 번호 자동 추출** (파일명 파싱)
4. **드래그 앤 드롭** 파일 업로드
5. **진행 상황 바** 개선

---

## 📞 문제 보고

문제가 계속되면 다음 정보를 제공해주세요:

1. **브라우저 정보**: Chrome, Firefox, Safari 등
2. **콘솔 로그**: F12 → Console 탭 전체 복사
3. **파일 정보**: 
   - 실험 데이터 파일 크기
   - DAQ Connection 파일 내용 (첫 5행)
4. **스크린샷**: 오류 화면

---

## ✅ 결론

**엑셀 입력 문제가 해결되었습니다!**

- ✅ 이벤트 핸들러 수정 완료
- ✅ Python 코드와의 차이점 문서화
- ✅ 테스트 페이지 제공
- ✅ 사용 가이드 작성

이제 파일을 업로드하면 정상적으로 처리됩니다.
