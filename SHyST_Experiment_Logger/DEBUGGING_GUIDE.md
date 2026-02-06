# 🔍 디버깅 가이드

## Driver 압력 강하 감지 실패 시 해결 방법

### 1. 개선된 감지 알고리즘

이제 3가지 방법으로 Driver 압력 강하를 감지합니다:

#### 방법 1: 절대값 기반
- Baseline 평균의 90% 이하로 떨어지는 지점 감지
- 가장 확실한 방법

#### 방법 2: 기울기 기반
- 급격한 압력 감소 감지
- Baseline 기울기의 2배 이상 감소

#### 방법 3: 연속 감소 감지
- 100샘플 이상 연속으로 감소하는 구간 감지
- 느린 감소에도 대응

### 2. 콘솔 로그 확인

브라우저 개발자 도구(F12)를 열고 Console 탭에서 다음 정보를 확인하세요:

```
Driver 데이터 분석 시작: {samples, fps, firstValue, lastValue}
Baseline 분석: {baselineSize, baselineAvg, baselineStd}
임계값 설정: {dropThreshold, gradThreshold}
방법1 감지 (절대값): index, value
방법2 감지 (기울기): index, gradient
방법3 감지 (연속 감소): index
최종 감지 지점: index / total
```

### 3. 디버그 정보 버튼

에러 발생 시 "🔍 디버그 정보 보기" 버튼을 클릭하면:
- 업로드된 데이터 정보
- DAQ Connection 설정
- 실험 조건
- 채널 목록

을 확인할 수 있습니다.

### 4. 일반적인 문제와 해결

#### 문제 1: Driver 채널을 찾을 수 없습니다

**원인:**
- DAQ Connection 파일의 'etc' 컬럼에 'driver'가 없음

**해결:**
- DAQ Connection 파일을 열어서 확인
- 'etc' 컬럼에 정확히 'driver'라고 입력되어 있는지 확인
- 대소문자 구분 없음 (driver, Driver, DRIVER 모두 인식)

**확인 방법:**
```
콘솔에서 "Driver 채널 검색 중..." 메시지 확인
각 채널의 description이 출력됨
```

#### 문제 2: Driver 압력 강하를 감지할 수 없습니다

**원인 A: 데이터가 이미 슬라이싱되어 있음**
- 업로드한 파일이 이미 처리된 파일일 수 있음
- 전체 데이터가 아닌 일부만 있을 수 있음

**해결:**
- 원본 LabVIEW 데이터 파일 사용
- 2번째 시트에 전체 데이터가 있는지 확인

**원인 B: 압력 변화가 없음**
- 실험이 제대로 진행되지 않았을 수 있음
- 센서 연결 문제

**해결:**
- 데이터를 엑셀에서 직접 열어 확인
- Driver 채널의 압력이 실제로 떨어지는지 확인

**원인 C: 노이즈가 너무 심함**
- 이동평균 필터로도 제거되지 않는 노이즈

**해결:**
- 콘솔에서 데이터 샘플 확인
- 필요시 윈도우 크기 조정

### 5. 수동 디버깅

콘솔에서 다음 명령어로 직접 확인:

```javascript
// 업로드된 데이터 확인
console.log(uploadedExpData);
console.log(uploadedDAQConnection);

// Driver 채널 확인
const driverCh = uploadedDAQConnection.find(c => c.description.includes('driver'));
console.log('Driver 채널:', driverCh);

// Driver 데이터 확인
const driverData = uploadedExpData.channels[`ch${driverCh.channel}`];
console.log('Driver 데이터:', {
    length: driverData.length,
    min: Math.min(...driverData),
    max: Math.max(...driverData),
    first10: driverData.slice(0, 10),
    last10: driverData.slice(-10)
});

// 이동평균 적용 후 확인
const smoothed = movingAverage(driverData, 1000);
console.log('Smoothed 데이터:', {
    length: smoothed.length,
    min: Math.min(...smoothed),
    max: Math.max(...smoothed),
    first10: smoothed.slice(0, 10),
    last10: smoothed.slice(-10)
});
```

### 6. 데이터 형식 확인

#### 실험 측정 데이터 엑셀 (2번째 시트)
```
전압_0    전압_1    전압_2    ...
0.000609  0.000857  0.000062  ...
0.000297  0.000232 -0.000250  ...
...
```

#### DAQ Connection 엑셀
```
#   type  PN            SN     cal         a         b         etc      filter
0   P     PCB 132B38    10952  a(V-c)      0.533669  0.000000  model    BP
15  P     sensys...     X6B840 p_a+aV+b    74.970    -75.163   driver   MA
```

### 7. 알고리즘 파라미터 조정

필요시 `post-processing.js`에서 다음 값을 조정:

```javascript
// 이동평균 윈도우 크기 (기본: 1000)
const smoothed = movingAverage(driverData, 1000);

// Baseline 크기 (기본: 10000 또는 전체의 10%)
const baselineSize = Math.min(10000, Math.floor(smoothed.length * 0.1));

// 압력 강하 임계값 (기본: baseline의 90%)
const dropThreshold = baselineAvg * 0.9;

// 기울기 임계값 배수 (기본: 2배)
const gradThreshold = -maxAbsGrad * 2;

// 연속 감소 샘플 수 (기본: 100)
if (consecutiveDrops >= 100) {
```

### 8. 문의하기

위 방법으로도 해결되지 않으면:
1. 콘솔 로그 전체 복사
2. 실험 데이터 파일 일부 (처음 100행)
3. DAQ Connection 파일 전체
4. 에러 메시지 스크린샷

을 함께 제공해주세요.
