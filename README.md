# 🚀 SHyST 실험 로거 (SHyST Experiment Logger)

충격파 풍동(Shock Tunnel) 실험 데이터 관리 및 후처리를 위한 웹 기반 애플리케이션

## 📋 주요 기능

### 1. 실험 전 데이터 입력 (Before Experiment)
- 실험 정보 (번호, 날짜, 실험자, 모델, 목적, 목표 마하수)
- SHyST 설정 (대기압, 온도, 습도, 가스 종류, 압력, 진공도 등)
- 시각화 설정 (Schlieren 방법 및 타겟)
- 카메라 설정 (모델, FPS, 해상도, 렌즈, 노출 시간)

### 2. 데이터 후처리 (Data Processing)
- 실험 측정 데이터 및 DAQ Connection 파일 업로드
- Driver 압력 강하 자동 감지
- 데이터 슬라이싱 (-1ms ~ 30ms)
- 전압 → 물리량 변환 (압력, 온도)
- 필터 적용 (Moving Average, Low Pass, Band Pass)
- Driven 압력 상승 감지
- 시험시간 자동 계산 (RMS 기반)
- 측정값 계산 (p1, T1, p4, p5, T4, test_time, shock_speed)

### 3. 유동조건 계산 (Flow Condition Calculation)
- ESTCN 방법 (평형 상태 가정)
- 1D 수치 계산 (온도 의존 물성치)
- Stage 1~7 계산
- 마하수, 레이놀즈수, 토탈 엔탈피 계산

### 4. 실험 관리
- IndexedDB 기반 로컬 데이터베이스
- 실험 목록 조회 및 검색
- 엑셀 내보내기/불러오기
- 실험 데이터 백업 및 복원

## 🌐 온라인 데모

**GitHub Pages**: [https://YOUR_USERNAME.github.io/SHyST_calculator/SHyST_Experiment_Logger/](https://YOUR_USERNAME.github.io/SHyST_calculator/SHyST_Experiment_Logger/)

## 🚀 사용 방법

### 웹 브라우저에서 바로 사용
1. 위 링크를 클릭하거나
2. `SHyST_Experiment_Logger/index.html` 파일을 브라우저에서 열기

### 로컬 서버 실행 (선택사항)
```bash
# Python 3
cd SHyST_Experiment_Logger
python -m http.server 8000

# 브라우저에서 http://localhost:8000 접속
```

## 📂 프로젝트 구조

```
SHyST_calculator/
├── SHyST_Experiment_Logger/          # 웹 애플리케이션
│   ├── index.html                    # 메인 페이지
│   ├── style.css                     # 스타일시트
│   ├── app.js                        # 메인 애플리케이션
│   ├── database.js                   # IndexedDB 관리
│   ├── calculator-core-full.js       # 유동조건 계산 엔진
│   ├── signal-processing.js          # 신호 처리 (필터)
│   ├── post-processing.js            # 데이터 후처리 메인 로직
│   ├── post-processing-step.js       # 단계별 처리
│   ├── post-processing-ui.js         # UI 업데이트
│   ├── data-processing.js            # 데이터 처리 유틸리티
│   ├── excel-handler.js              # 엑셀 입출력
│   ├── simple-upload.js              # 파일 업로드
│   ├── import-data.js                # 데이터 가져오기
│   ├── xlsx.full.min.js              # SheetJS 라이브러리
│   ├── experiments_data.json         # 샘플 데이터
│   ├── USAGE_GUIDE_KR.md            # 사용 가이드 (한글)
│   ├── FIX_SUMMARY_KR.md            # 문제 해결 가이드
│   └── FILE_UPLOAD_TEST.html        # 파일 업로드 테스트
│
├── post_SHyST_ver1.ipynb             # 원본 Python 코드
├── SHyST Exp Check List ver1.xlsx    # 실험 체크리스트 샘플
├── DAQ connection.xlsx               # DAQ 연결 설정 샘플
└── README.md                         # 이 파일

```

## 🔧 기술 스택

- **Frontend**: Vanilla JavaScript (ES6+)
- **Database**: IndexedDB (브라우저 내장)
- **Excel**: SheetJS (xlsx.js)
- **Styling**: CSS3
- **Hosting**: GitHub Pages

## 📖 문서

- **[사용 가이드 (한글)](SHyST_Experiment_Logger/USAGE_GUIDE_KR.md)**: 전체 사용 방법 및 Python 코드와의 차이점
- **[문제 해결 가이드](SHyST_Experiment_Logger/FIX_SUMMARY_KR.md)**: 엑셀 업로드 문제 해결
- **[파일 업로드 테스트](SHyST_Experiment_Logger/FILE_UPLOAD_TEST.html)**: 파일 업로드 기능 테스트

## 🐛 알려진 문제 및 해결 방법

### 엑셀 파일 업로드가 안 될 때
1. 페이지 강제 새로고침 (Ctrl+F5 / Cmd+Shift+R)
2. 브라우저 콘솔(F12) 확인
3. 실험 전 데이터를 먼저 저장했는지 확인
4. 파일 형식이 `.xlsx` 또는 `.xls`인지 확인

자세한 내용은 [문제 해결 가이드](SHyST_Experiment_Logger/FIX_SUMMARY_KR.md)를 참고하세요.

## 🔄 Python 코드와의 차이점

| 항목 | Python (post_SHyST_ver1.ipynb) | JavaScript 웹앱 |
|------|-------------------------------|-----------------|
| 파일 선택 | 폴더 선택 → 자동 검색 | 개별 파일 업로드 |
| 체크리스트 | 자동 로드 및 검색 | 수동 입력 |
| 실험 번호 | 파일명에서 자동 추출 | 수동 입력 |
| 데이터 저장 | 로컬 파일 | IndexedDB |
| 알고리즘 | ✅ 동일 | ✅ 동일 |

자세한 비교는 [사용 가이드](SHyST_Experiment_Logger/USAGE_GUIDE_KR.md)를 참고하세요.

## 📊 파일 형식

### 실험 데이터 파일 (`.xlsx`)
- **Sheet 1**: 메타데이터
  - B5 셀: 채널 수
- **Sheet 2**: 실제 데이터
  - 헤더: `전압_0`, `전압_1`, `전압_2`, ...
  - 데이터: 각 채널의 전압 값

### DAQ Connection 파일 (`.xlsx`)
- **Sheet 1**: 센서 설정
  - 컬럼: `#`, `type`, `PN`, `SN`, `cal`, `a`, `b`, `etc`, `filter`
  - `#`: 포트 번호
  - `etc`: 센서 설명 (예: `driver`, `driven7`, `driven8`)

## 🤝 기여

이 프로젝트는 충격파 풍동 실험 데이터 관리를 위해 개발되었습니다.

## 📝 라이선스

이 프로젝트는 연구 및 교육 목적으로 사용할 수 있습니다.

## 📞 문제 보고

문제가 발생하면 다음 정보를 제공해주세요:
1. 브라우저 정보 (Chrome, Firefox, Safari 등)
2. 콘솔 로그 (F12 → Console 탭)
3. 파일 정보 (크기, 형식)
4. 스크린샷

## 🎯 향후 계획

- [ ] 폴더 업로드 지원 (File System Access API)
- [ ] 체크리스트 자동 검색
- [ ] 실험 번호 자동 추출
- [ ] 드래그 앤 드롭 파일 업로드
- [ ] 다국어 지원 (영어)
- [ ] 모바일 반응형 디자인 개선

---

**개발**: SHyST 실험실  
**최종 업데이트**: 2026년 2월
