# SHyST 실험 로거

SHyST (Shock Tunnel) 실험 데이터를 관리하고 유동조건을 계산하는 웹 애플리케이션입니다.

## 주요 기능

### 1. 실험 전 데이터 입력 (Before Experiment)
- 실험 정보 (실험자, 날짜, 모델, 목적, 목표 마하수)
- SHyST 설정 (대기 조건, 격막, 가스 종류 및 압력/온도)
- 슐리렌 설정
- 카메라 설정

### 2. 실험 후 데이터 후처리 (Processing)
- LabVIEW 원시 데이터 업로드 (CSV, TXT, TDMS)
- 센서 캘리브레이션 (전압 → 물리량 변환)
- 데이터 시각화
- 시험시간 선택
- 평균값 및 표준편차 자동 계산

### 3. 유동조건 계산 (Calculation)
- **ESTCN 방법**: 평형 상태 가정, 빠른 계산
- **1D 수치 계산**: 온도 의존 물성치 (NASA 다항식), 정확한 계산
- 자동 Stage 계산 (1, 2, 5, 7)
- 마하수, 레이놀즈수, 토탈 엔탈피 계산

### 4. 데이터 관리
- IndexedDB 기반 로컬 데이터베이스
- LocalStorage 백업
- 실험 목록 조회 및 편집
- 실험 검색 기능

### 5. 엑셀 연동
- **엑셀 내보내기**: 실험 데이터를 Excel 파일로 저장
- **엑셀 불러오기**: 기존 Excel 파일에서 데이터 가져오기
- 기존 체크리스트 형식 호환

## 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Database**: IndexedDB + LocalStorage
- **Excel**: SheetJS (xlsx)
- **Physics**: NASA 7-coefficient polynomials, Rankine-Hugoniot equations
- **Visualization**: HTML5 Canvas

## 파일 구조

```
SHyST_Experiment_Logger/
├── index.html              # 메인 HTML
├── style.css               # 스타일시트
├── app.js                  # 메인 애플리케이션 로직
├── database.js             # IndexedDB 데이터베이스 관리
├── calculator-core-full.js # 충격파 계산 엔진 (v5에서 복사)
├── data-processing.js      # 데이터 후처리 모듈
├── excel-handler.js        # 엑셀 import/export
├── import-data.js          # 기존 데이터 가져오기
├── import-excel-data.py    # 엑셀 → JSON 변환 스크립트
├── experiments_data.json   # 변환된 실험 데이터 (159개)
└── README.md               # 이 파일
```

## 사용 방법

### 0. 기존 실험 데이터 가져오기 (최초 1회)
1. 웹 페이지 열기
2. 상단의 "💾 기존 데이터 가져오기" 버튼 클릭
3. 확인 → 자동으로 159개 실험 데이터(#1~#161) 가져오기
4. 완료!

**참고**: 
- `experiments_data.json` 파일에 엑셀에서 변환된 데이터가 저장되어 있습니다
- 이미 존재하는 실험은 자동으로 건너뜁니다
- 한 번만 실행하면 됩니다

### 1. 새 실험 시작
1. 페이지를 열면 자동으로 새 실험이 생성됩니다
2. "실험 전 (Before)" 탭에서 실험 정보 입력
3. "💾 저장" 버튼 클릭

### 2. 데이터 후처리
1. "데이터 후처리 (Processing)" 탭으로 이동
2. LabVIEW 데이터 파일 업로드
3. 센서 캘리브레이션 설정 (옵션)
4. 시각화된 데이터에서 시험시간 선택
5. 평균값 확인 및 저장

### 3. 유동조건 계산
1. "유동조건 계산 (Calculation)" 탭으로 이동
2. 계산 방법 선택 (ESTCN 또는 1D)
3. "▶️ 계산 시작" 버튼 클릭
4. 결과 확인 및 저장

### 4. 실험 관리
- "📋 실험 목록" 버튼: 저장된 모든 실험 조회
- 실험 검색, 열기, 삭제 가능

### 5. 엑셀 연동
- "📥 엑셀 내보내기": 현재 실험을 Excel 파일로 저장
- "📤 엑셀 불러오기": Excel 파일에서 데이터 가져오기

## 물리 모델

### 온도 의존 물성치
- NASA 7-coefficient polynomials 사용
- 지원 가스: Air, N2, O2, He, Ar, H2, CO2
- 온도 범위: 200-6000K

### 충격파 계산
- Rankine-Hugoniot 관계식
- 반복 계산으로 온도 의존 gamma 고려
- 입사 충격파 (State 1 → 2)
- 반사 충격파 (State 2 → 5)

### 노즐 팽창
- 등엔트로피 팽창 (State 5 → 7)
- 에너지 보존: h0 = h7 + 0.5*u7²
- 레이놀즈수 및 토탈 엔탈피 계산

## 브라우저 호환성

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

IndexedDB를 지원하는 모든 최신 브라우저에서 동작합니다.

## 개발자 정보

- 개발: APL
- 버전: 1.0.0
- 날짜: 2026-02-06

## 라이선스

내부 연구용
