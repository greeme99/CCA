#!/bin/zsh
set -e
cd "$(dirname "$0")"

echo "CCA(기업경쟁력분석) 개발 서버를 준비합니다."
if [ ! -d node_modules ]; then
  echo "node_modules가 없어 npm install을 먼저 실행합니다."
  npm install
fi

echo "TypeScript/Vite 빌드 검증을 실행합니다."
npm run build

echo "로컬 서버를 시작합니다: http://localhost:5173"
npm run dev -- --host 127.0.0.1 --port 5173
