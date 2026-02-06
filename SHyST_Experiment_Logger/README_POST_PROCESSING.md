# SHyST 실험 로거 - 데이터 후처리 기능

## 📋 개요

Python Jupyter 노트북 `post_SHyST_ver1.ipynb`의 기능을 웹 애플리케이션으로 구현했습니다.

## 🎯 기능

### 1. 데이터 입력
- **실험 측정 데이터 엑셀**: LabVIEW에서 생성된 전압 데이터 (2번째 시트)
- **DAQ Connection 엑셀**: 센서 보정 정보 및 필터 설정

### 2. 자동 처리 과정
1. **Driver 압력 강하 감지**
   - 이동평균 필터 (1000샘플)
   - 기울기 기반 자동 감지
   
2. **데이터 슬라이싱**
   - 감지 시점 기준 -1ms ~ 30ms 구간 추출
   
3. **전압 → 물리량 변환**
   - `a(V-c)`: 압력 센서
   - `p_t+a(V-c)+b`: 진공압 보정 압력 센서
   - `p_a+aV+b`: 대기압 보정 압력 센서
   - `E`: E-type 열전대
   - `aV+b`: K-type 열전대
   
4. **필터 적용**
   - `MA`: Moving Average (1000샘플)
   - `LP`: Low Pass Filter (10kHz)
   - `BP`: Band Pass Filter (200-350kHz)
   
5. **Driven 압력 상승 감지**
   - driven7, driven8 채널 분석
   
6. **시험시간 계산**
   - RMS 기반 시작/끝점 선정
   
7. **측정값 자동 계산**
   - p1, T1, p4, p4_std, T4, p5, p5_std
   - test_time, shock_speed
   - output_delay_time, output_ready_time

### 3. 출력

#### 다운로드 파일
1. **슬라이스 데이터**: `exp###_01_sliced.xlsx`
2. **물리량 변환 데이터**: `exp###_02_converted.xlsx`
3. **필터 적용 데이터**: `exp###_03_filtered.xlsx`
4. **최종 결과**: `exp###_final.xlsx`
   - Sheet 1: 시계열 데이터
   - Sheet 2: 실험 요약 및 측정값

#### DB 저장
- 11개 측정값이 `currentExperiment.after.labviewLog`에 저장됨
- 다음 단계(Calculation 탭)에서 자동으로 사용됨

## 🔧 기술 스택

### JavaScript 파일
- `post-processing.js`: 메인 로직
- `signal-processing.js`: 필터 및 신호처리
- `post-processing-ui.js`: UI 및 시각화

### 주요 라이브러리
- **SheetJS (xlsx)**: 엑셀 파일 읽기/쓰기
- **Canvas API**: 그래프 시각화

## 📊 데이터 흐름

```
[실험 전 정보] (Before 탭)
         ↓
[실험 데이터 업로드] (Processing 탭)
         ↓
[자동 처리] → 11개 측정값 계산
         ↓
[결과 확인 및 다운로드]
         ↓
[DB 저장] → after.labviewLog
         ↓
[유동조건 계산] (Calculation 탭) ← 이건 나중에
```

## 🚀 사용 방법

1. **Before 탭**에서 실험 전 정보 입력 및 저장

2. **Processing 탭**으로 이동

3. 파일 업로드
   - 실험 측정 데이터 엑셀 선택
   - DAQ Connection 엑셀 선택

4. "데이터 처리 시작" 버튼 클릭

5. 처리 완료 후:
   - 그래프에서 결과 확인
   - 측정값 자동 입력 확인
   - 필요한 파일 다운로드
   - "후처리 데이터 저장" 클릭

6. **Calculation 탭**에서 유동조건 계산 (나중에 구현)

## ⚠️ 주의사항

- 실험 측정 데이터는 2번째 시트를 사용합니다
- DAQ Connection 파일 형식이 일치해야 합니다
- 대용량 데이터(수백만 샘플)는 처리 시간이 걸릴 수 있습니다

## 🔮 향후 계획

- [ ] Shock speed 자동 계산 (센서 간 거리 정보 필요)
- [ ] Output delay/ready time 계산
- [ ] Model front 압력 상승 감지
- [ ] 더 정확한 E-type 열전대 변환 (NIST 표준)
- [ ] 실시간 진행 상황 표시 개선
