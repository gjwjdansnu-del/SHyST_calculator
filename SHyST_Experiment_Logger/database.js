// ============================================
// SHyST 실험 데이터베이스 관리
// IndexedDB + LocalStorage 백업
// ============================================

const DB_NAME = 'SHyST_Experiments';
const DB_VERSION = 1;
const STORE_NAME = 'experiments';

let db = null;

// IndexedDB 초기화
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('Database failed to open');
            reject(request.error);
        };
        
        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // experiments 스토어 생성
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                
                // 인덱스 생성
                objectStore.createIndex('date', 'date', { unique: false });
                objectStore.createIndex('name', 'name', { unique: false });
                objectStore.createIndex('expNumber', 'expNumber', { unique: true });
                objectStore.createIndex('status', 'status', { unique: false });
                
                console.log('Object store created');
            }
        };
    });
}

// 실험 데이터 구조
function createExperimentData() {
    return {
        id: null,
        expNumber: null,
        status: 'pending', // pending, processing, completed
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        
        // Before Experiment
        before: {
            expInfo: {
                name: '',
                date: '',
                testModel: '',
                objective: '',
                targetMach: null
            },
            shystSetting: {
                airPressure: null,
                airTemp: null,
                airHumidity: null,
                driverGas: '',
                boosterPressure: null,
                firstDiaphragm: '',
                secondDiaphragm: '',
                drivenGas: 'air',
                drivenPressure: null,
                drivenTemp: null,
                vacuumGauge: null,
                daqSampling: 1000000
            },
            visualizationSetting: {
                method: 'Z-type Schlieren',
                target: ''
            },
            cameraSetting: {
                model: '',
                fps: null,
                width: null,
                height: null,
                lensFocal: '',
                exposeTime: null
            }
        },
        
        // After Experiment - LabVIEW Log
        after: {
            labviewLog: {
                p1_avg: null,
                t1_avg: null,
                p4_avg: null,
                p4_std: null,
                t4_avg: null,
                p5_avg: null,
                p5_std: null,
                testTime: null,
                shockSpeed: null,
                outputDelayTime: null,
                outputReadyTime: null
            },
            
            // 원시 데이터 파일 정보
            rawDataFiles: [],
            
            // 센서 캘리브레이션
            sensorCalibrations: [],
            
            // 선택된 시험시간
            selectedTestTime: {
                start: null,
                end: null,
                duration: null
            }
        },
        
        // Calculation Results - ESTCN
        calculation: {
            method: 'estcn', // estcn or 1d
            stages: {
                stage1: null,
                stage2: null,
                stage5: null,
                stage5s: null,
                stage6: null,
                stage7: null
            }
        }
    };
}

// 실험 저장
async function saveExperiment(experimentData) {
    experimentData.updatedAt = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        let request;
        if (experimentData.id) {
            // 업데이트
            request = objectStore.put(experimentData);
        } else {
            // 새로 생성
            delete experimentData.id;
            request = objectStore.add(experimentData);
        }
        
        request.onsuccess = () => {
            console.log('Experiment saved:', request.result);
            
            // LocalStorage 백업
            backupToLocalStorage();
            
            resolve(request.result);
        };
        
        request.onerror = () => {
            console.error('Failed to save experiment');
            reject(request.error);
        };
    });
}

// 실험 불러오기
async function loadExperiment(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.get(id);
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// 모든 실험 불러오기
async function loadAllExperiments() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// 실험 삭제
async function deleteExperiment(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(id);
        
        request.onsuccess = () => {
            backupToLocalStorage();
            resolve();
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// LocalStorage 백업
function backupToLocalStorage() {
    loadAllExperiments().then(experiments => {
        localStorage.setItem('shyst_experiments_backup', JSON.stringify(experiments));
        localStorage.setItem('shyst_backup_time', new Date().toISOString());
    });
}

// LocalStorage에서 복구
async function restoreFromLocalStorage() {
    const backup = localStorage.getItem('shyst_experiments_backup');
    if (!backup) return;
    
    try {
        const experiments = JSON.parse(backup);
        
        for (const exp of experiments) {
            const id = exp.id;
            delete exp.id;
            await saveExperiment(exp);
        }
        
        console.log('Restored from LocalStorage backup');
    } catch (e) {
        console.error('Failed to restore from backup:', e);
    }
}

// 다음 실험 번호 생성
async function getNextExpNumber() {
    const experiments = await loadAllExperiments();
    
    if (experiments.length === 0) {
        return 1;
    }
    
    // 가장 큰 expNumber 찾기
    const maxNum = experiments.reduce((max, exp) => {
        const num = parseInt(exp.expNumber) || 0;
        return num > max ? num : max;
    }, 0);
    
    return maxNum + 1;
}

// 가장 최근 실험 가져오기
async function getLastExperiment() {
    const experiments = await loadAllExperiments();
    
    if (experiments.length === 0) {
        return null;
    }
    
    // 실험 번호 기준 내림차순 정렬 (가장 큰 번호가 최신)
    experiments.sort((a, b) => b.expNumber - a.expNumber);
    
    return experiments[0];
}

// 데이터베이스 초기화 실행
initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    alert('데이터베이스 초기화 실패. LocalStorage만 사용됩니다.');
});
