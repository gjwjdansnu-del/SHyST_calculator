# 🚀 GitHub Pages 설정 가이드

## 1️⃣ GitHub 저장소 생성

### 웹 브라우저에서:
1. https://github.com 접속 및 로그인
2. 우측 상단 `+` 버튼 → `New repository` 클릭
3. 저장소 설정:
   - **Repository name**: `SHyST_calculator` (또는 원하는 이름)
   - **Description**: `SHyST 실험 로거 - 충격파 풍동 실험 데이터 관리 및 후처리`
   - **Public** 선택 (GitHub Pages는 Public 저장소에서만 무료)
   - ❌ **Initialize this repository with a README** 체크 해제 (이미 로컬에 있음)
4. `Create repository` 버튼 클릭

## 2️⃣ 로컬 저장소와 GitHub 연결

저장소 생성 후 나오는 화면에서 "…or push an existing repository from the command line" 섹션의 명령어를 복사하거나, 아래 명령어를 실행하세요:

```bash
cd /Users/apl/Downloads/coding/SHyST_calculator

# GitHub 저장소 URL로 변경 (YOUR_USERNAME을 실제 GitHub 사용자명으로 변경)
git remote add origin https://github.com/YOUR_USERNAME/SHyST_calculator.git

# 기본 브랜치 이름을 main으로 설정
git branch -M main

# GitHub에 푸시
git push -u origin main
```

### 예시:
만약 GitHub 사용자명이 `john-doe`라면:
```bash
git remote add origin https://github.com/john-doe/SHyST_calculator.git
git branch -M main
git push -u origin main
```

## 3️⃣ GitHub Pages 활성화

### 웹 브라우저에서:
1. GitHub 저장소 페이지로 이동
2. `Settings` 탭 클릭
3. 왼쪽 메뉴에서 `Pages` 클릭
4. **Source** 섹션:
   - Branch: `main` 선택
   - Folder: `/ (root)` 선택
5. `Save` 버튼 클릭
6. 몇 분 후 페이지 상단에 배포 URL이 표시됨:
   ```
   Your site is live at https://YOUR_USERNAME.github.io/SHyST_calculator/
   ```

## 4️⃣ 웹사이트 접속

### 메인 애플리케이션:
```
https://YOUR_USERNAME.github.io/SHyST_calculator/SHyST_Experiment_Logger/
```

### 테스트 페이지:
```
https://YOUR_USERNAME.github.io/SHyST_calculator/SHyST_Experiment_Logger/FILE_UPLOAD_TEST.html
```

## 5️⃣ README.md 업데이트

배포 후 README.md 파일의 URL을 실제 주소로 업데이트하세요:

```bash
# README.md 파일 편집 (YOUR_USERNAME을 실제 사용자명으로 변경)
# 그 후:
git add README.md
git commit -m "Update GitHub Pages URL in README"
git push
```

---

## 🔧 터미널에서 실행할 명령어 요약

```bash
# 1. 저장소 디렉토리로 이동
cd /Users/apl/Downloads/coding/SHyST_calculator

# 2. GitHub 원격 저장소 추가 (YOUR_USERNAME 변경 필요!)
git remote add origin https://github.com/YOUR_USERNAME/SHyST_calculator.git

# 3. 브랜치 이름을 main으로 설정
git branch -M main

# 4. GitHub에 푸시
git push -u origin main
```

---

## 🎯 완료 체크리스트

- [ ] GitHub 계정 로그인
- [ ] 새 저장소 생성 (`SHyST_calculator`)
- [ ] 로컬 저장소와 GitHub 연결 (`git remote add origin`)
- [ ] 코드 푸시 (`git push -u origin main`)
- [ ] GitHub Pages 활성화 (Settings → Pages)
- [ ] 웹사이트 접속 확인
- [ ] README.md의 URL 업데이트

---

## ⚠️ 문제 해결

### 푸시 시 인증 오류
GitHub는 2021년부터 비밀번호 인증을 중단했습니다. 다음 중 하나를 사용하세요:

#### 방법 1: Personal Access Token (PAT)
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. `Generate new token (classic)` 클릭
3. 권한 선택: `repo` 전체 체크
4. 토큰 생성 후 복사 (한 번만 표시됨!)
5. 푸시 시 비밀번호 대신 토큰 입력

#### 방법 2: SSH 키
```bash
# SSH 키 생성
ssh-keygen -t ed25519 -C "your_email@example.com"

# SSH 키를 GitHub에 추가
# 1. ~/.ssh/id_ed25519.pub 파일 내용 복사
cat ~/.ssh/id_ed25519.pub

# 2. GitHub → Settings → SSH and GPG keys → New SSH key
# 3. 복사한 내용 붙여넣기

# 4. 원격 저장소 URL을 SSH로 변경
git remote set-url origin git@github.com:YOUR_USERNAME/SHyST_calculator.git
```

### GitHub Pages가 작동하지 않을 때
1. Settings → Pages에서 Source가 올바르게 설정되었는지 확인
2. 저장소가 Public인지 확인
3. 몇 분 기다린 후 다시 시도
4. 브라우저 캐시 삭제 후 재접속

---

## 📱 모바일에서 접속

GitHub Pages는 모바일에서도 작동합니다:
- iOS Safari, Chrome
- Android Chrome, Samsung Internet

---

## 🔄 코드 업데이트 방법

코드를 수정한 후:

```bash
cd /Users/apl/Downloads/coding/SHyST_calculator

# 변경사항 확인
git status

# 변경된 파일 추가
git add .

# 커밋
git commit -m "설명 메시지"

# GitHub에 푸시
git push

# 몇 분 후 웹사이트에 자동 반영됨
```

---

## 💡 팁

1. **커스텀 도메인**: Settings → Pages에서 자신의 도메인 연결 가능
2. **HTTPS 강제**: Settings → Pages에서 "Enforce HTTPS" 체크
3. **배포 상태 확인**: Actions 탭에서 배포 진행 상황 확인
4. **로컬 테스트**: 푸시 전에 로컬에서 먼저 테스트
   ```bash
   cd SHyST_Experiment_Logger
   python -m http.server 8000
   # http://localhost:8000 접속
   ```

---

## 📞 도움이 필요하면

- GitHub 문서: https://docs.github.com/en/pages
- GitHub Pages 가이드: https://pages.github.com/

---

**준비 완료!** 이제 위 단계를 따라하면 웹사이트가 만들어집니다! 🚀
