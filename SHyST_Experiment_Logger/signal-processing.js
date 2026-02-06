// ============================================
// 신호 처리 함수들
// scipy.signal의 butter, filtfilt 등을 JavaScript로 구현
// ============================================

// ============================================
// 1. 이동평균 필터 (Moving Average)
// ============================================

function movingAverage(data, windowSize) {
    if (!data || data.length === 0) return [];
    if (windowSize <= 1) return [...data];
    
    const result = new Array(data.length);
    const halfWindow = Math.floor(windowSize / 2);
    
    // 최적화: 슬라이딩 윈도우 방식 (O(n) 복잡도)
    // 첫 윈도우의 합 계산
    let windowSum = 0;
    let windowCount = 0;
    
    // 초기 윈도우 설정 (i=0일 때)
    for (let j = 0; j < Math.min(halfWindow + 1, data.length); j++) {
        windowSum += data[j];
        windowCount++;
    }
    result[0] = windowSum / windowCount;
    
    // 슬라이딩 윈도우로 나머지 계산
    for (let i = 1; i < data.length; i++) {
        const leftIdx = i - halfWindow - 1;
        const rightIdx = i + halfWindow;
        
        // 왼쪽 값 제거
        if (leftIdx >= 0) {
            windowSum -= data[leftIdx];
            windowCount--;
        }
        
        // 오른쪽 값 추가
        if (rightIdx < data.length) {
            windowSum += data[rightIdx];
            windowCount++;
        }
        
        result[i] = windowSum / windowCount;
    }
    
    return result;
}

// ============================================
// 2. 저역통과 필터 (Low Pass Filter)
// ============================================

function lowpassFilter(data, cutoffHz, fs) {
    // Butterworth 저역통과 필터 (2차)
    // cutoffHz: 차단 주파수
    // fs: 샘플링 주파수
    
    const nyquist = fs / 2;
    const normalizedCutoff = cutoffHz / nyquist;
    
    // Butterworth 필터 계수 계산
    const coeffs = butterworth2ndOrder(normalizedCutoff, 'lowpass');
    
    // filtfilt 적용 (양방향 필터링으로 위상 왜곡 제거)
    return filtfilt(data, coeffs.b, coeffs.a);
}

// ============================================
// 3. 대역통과 필터 (Band Pass Filter)
// ============================================

function bandpassFilter(data, lowcutHz, highcutHz, fs) {
    // Butterworth 대역통과 필터 (2차)
    
    const nyquist = fs / 2;
    const normalizedLow = lowcutHz / nyquist;
    const normalizedHigh = highcutHz / nyquist;
    
    // Butterworth 필터 계수 계산
    const coeffs = butterworth2ndOrderBandpass(normalizedLow, normalizedHigh);
    
    // filtfilt 적용
    return filtfilt(data, coeffs.b, coeffs.a);
}

// ============================================
// 4. Butterworth 필터 계수 계산
// ============================================

function butterworth2ndOrder(cutoff, filterType) {
    // 2차 Butterworth 필터 계수
    // cutoff: 정규화된 차단 주파수 (0~1)
    
    const omega = Math.tan(Math.PI * cutoff);
    const omega2 = omega * omega;
    const sqrt2 = Math.sqrt(2);
    
    let b, a;
    
    if (filterType === 'lowpass') {
        // 저역통과 필터
        const k = omega2 / (1 + sqrt2 * omega + omega2);
        
        b = [k, 2*k, k];
        a = [
            1,
            2 * (omega2 - 1) / (1 + sqrt2 * omega + omega2),
            (1 - sqrt2 * omega + omega2) / (1 + sqrt2 * omega + omega2)
        ];
    } else if (filterType === 'highpass') {
        // 고역통과 필터
        const k = 1 / (1 + sqrt2 * omega + omega2);
        
        b = [k, -2*k, k];
        a = [
            1,
            2 * (omega2 - 1) / (1 + sqrt2 * omega + omega2),
            (1 - sqrt2 * omega + omega2) / (1 + sqrt2 * omega + omega2)
        ];
    }
    
    return { b, a };
}

function butterworth2ndOrderBandpass(lowcut, highcut) {
    // 대역통과 필터 = 저역통과 + 고역통과
    // 간단한 구현: 중심 주파수와 대역폭 사용
    
    const centerFreq = Math.sqrt(lowcut * highcut);
    const bandwidth = highcut - lowcut;
    
    const omega = Math.tan(Math.PI * centerFreq);
    const bw = Math.tan(Math.PI * bandwidth / 2);
    
    const omega2 = omega * omega;
    const bw2 = bw * bw;
    
    const k = bw / (1 + bw + omega2 / (1 + bw));
    
    const b = [k, 0, -k];
    const a = [
        1,
        -2 * omega2 / (1 + bw + omega2 / (1 + bw)),
        (1 - bw + omega2 / (1 + bw)) / (1 + bw + omega2 / (1 + bw))
    ];
    
    return { b, a };
}

// ============================================
// 5. filtfilt 구현 (양방향 필터링)
// ============================================

function filtfilt(data, b, a) {
    // scipy.signal.filtfilt와 동일한 동작
    // 순방향 + 역방향 필터링으로 위상 왜곡 제거
    
    // 순방향 필터링
    const forward = filter(data, b, a);
    
    // 역방향 필터링
    const reversed = forward.slice().reverse();
    const backward = filter(reversed, b, a);
    
    // 다시 뒤집기
    return backward.reverse();
}

// ============================================
// 6. IIR 필터 적용
// ============================================

function filter(data, b, a) {
    // IIR 필터 (Infinite Impulse Response)
    // y[n] = (b[0]*x[n] + b[1]*x[n-1] + ... - a[1]*y[n-1] - a[2]*y[n-2] - ...) / a[0]
    
    const result = new Array(data.length);
    const order = Math.max(b.length, a.length) - 1;
    
    // 초기 조건 (0으로 패딩)
    const x = new Array(order).fill(0).concat(data);
    const y = new Array(order).fill(0);
    
    for (let n = 0; n < data.length; n++) {
        let sum = 0;
        
        // b 계수 (입력)
        for (let k = 0; k < b.length; k++) {
            sum += b[k] * x[n + order - k];
        }
        
        // a 계수 (출력 피드백)
        for (let k = 1; k < a.length; k++) {
            sum -= a[k] * y[n + order - k];
        }
        
        y.push(sum / a[0]);
        result[n] = sum / a[0];
    }
    
    return result;
}

// ============================================
// 7. 기울기 계산
// ============================================

function calculateGradients(data) {
    const gradients = [];
    
    for (let i = 1; i < data.length; i++) {
        gradients.push(data[i] - data[i-1]);
    }
    
    return gradients;
}

// ============================================
// 8. RMS 계산
// ============================================

function calculateRMS(data, windowSize) {
    const rmsData = [];
    
    for (let i = 0; i < data.length - windowSize; i++) {
        const window = data.slice(i, i + windowSize);
        const squareSum = window.reduce((sum, v) => sum + v * v, 0);
        const rms = Math.sqrt(squareSum / windowSize);
        rmsData.push(rms);
    }
    
    return rmsData;
}

// ============================================
// 9. FFT (고속 푸리에 변환) - 간단한 구현
// ============================================

function fft(data) {
    // Cooley-Tukey FFT 알고리즘
    const n = data.length;
    
    if (n <= 1) return data;
    
    // 2의 거듭제곱으로 패딩
    const paddedN = Math.pow(2, Math.ceil(Math.log2(n)));
    const padded = data.concat(new Array(paddedN - n).fill(0));
    
    return fftRecursive(padded.map(v => ({re: v, im: 0})));
}

function fftRecursive(data) {
    const n = data.length;
    
    if (n <= 1) return data;
    
    // 짝수/홀수 분리
    const even = fftRecursive(data.filter((_, i) => i % 2 === 0));
    const odd = fftRecursive(data.filter((_, i) => i % 2 === 1));
    
    const result = new Array(n);
    
    for (let k = 0; k < n/2; k++) {
        const angle = -2 * Math.PI * k / n;
        const twiddle = {
            re: Math.cos(angle),
            im: Math.sin(angle)
        };
        
        const t = complexMultiply(twiddle, odd[k]);
        
        result[k] = complexAdd(even[k], t);
        result[k + n/2] = complexSubtract(even[k], t);
    }
    
    return result;
}

function complexMultiply(a, b) {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    };
}

function complexAdd(a, b) {
    return {
        re: a.re + b.re,
        im: a.im + b.im
    };
}

function complexSubtract(a, b) {
    return {
        re: a.re - b.re,
        im: a.im - b.im
    };
}

// ============================================
// 10. 파워 스펙트럼 밀도 (PSD)
// ============================================

function powerSpectralDensity(data, fs) {
    // FFT를 사용한 PSD 계산
    const fftResult = fft(data);
    const n = fftResult.length;
    
    const psd = fftResult.slice(0, n/2).map(c => {
        const magnitude = Math.sqrt(c.re * c.re + c.im * c.im);
        return magnitude * magnitude / n;
    });
    
    const frequencies = [];
    for (let i = 0; i < psd.length; i++) {
        frequencies.push(i * fs / n);
    }
    
    return { frequencies, psd };
}
