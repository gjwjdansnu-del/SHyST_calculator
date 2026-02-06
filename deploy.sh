#!/bin/bash

echo "🚀 SHyST Calculator GitHub 배포 스크립트"
echo "========================================"
echo ""

# 현재 디렉토리 확인
if [ ! -d ".git" ]; then
    echo "❌ Git 저장소가 아닙니다!"
    exit 1
fi

echo "✅ Git 저장소 확인 완료"
echo ""

# 원격 저장소 확인
REMOTE=$(git remote get-url origin 2>/dev/null)
if [ -z "$REMOTE" ]; then
    echo "❌ 원격 저장소가 설정되지 않았습니다!"
    exit 1
fi

echo "✅ 원격 저장소: $REMOTE"
echo ""

# 저장소 존재 확인
echo "📋 다음 단계를 따라주세요:"
echo ""
echo "1️⃣ GitHub 저장소 만들기"
echo "   https://github.com/new"
echo "   - Repository name: SHyST_calculator"
echo "   - Public 선택"
echo "   - ❌ README 체크 해제"
echo ""
echo "2️⃣ Personal Access Token 만들기 (처음 한 번만)"
echo "   https://github.com/settings/tokens"
echo "   - Generate new token (classic)"
echo "   - repo 권한 선택"
echo "   - 토큰 복사"
echo ""
echo "3️⃣ 준비되었으면 Enter를 눌러주세요..."
read -p ""

echo ""
echo "🚀 GitHub에 푸시 중..."
echo ""

# 푸시 시도
if git push -u origin main; then
    echo ""
    echo "✅ 푸시 성공!"
    echo ""
    echo "🌐 이제 GitHub Pages를 활성화하세요:"
    echo "   1. https://github.com/gjwjdansnu-del/SHyST_calculator/settings/pages"
    echo "   2. Source: main 브랜치, / (root) 폴더"
    echo "   3. Save 클릭"
    echo ""
    echo "📱 웹사이트 주소 (몇 분 후 활성화):"
    echo "   https://gjwjdansnu-del.github.io/SHyST_calculator/SHyST_Experiment_Logger/"
    echo ""
else
    echo ""
    echo "❌ 푸시 실패!"
    echo ""
    echo "💡 문제 해결:"
    echo "   1. GitHub 저장소를 만들었나요?"
    echo "   2. Personal Access Token을 만들었나요?"
    echo "   3. 토큰을 비밀번호로 입력했나요?"
    echo ""
    echo "다시 시도하려면 이 스크립트를 다시 실행하세요:"
    echo "   bash deploy.sh"
    echo ""
fi
