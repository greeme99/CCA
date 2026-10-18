# Project: CCA

상위 Workspace 지침을 따르며, 이 파일은 프로젝트 고유 사실과 명령만 정의한다.

## Mission
- 목적: 기업경쟁력분석(CCA) 대시보드 및 가치사슬/경쟁사 분석 React 웹 애플리케이션
- 주요 사용자: 기업/산업 분석가 및 경영진
- 완료 기준: OpenDART 데이터 기반 기업 분석, 가치사슬 및 경쟁사 비교 차트/테이블 정상 렌더링 및 빌드 통과

## Stack
- Runtime: Node.js (LTS)
- Package manager: npm (with package-lock.json)
- Framework: React 19 + TypeScript + Vite 7
- UI / Visualization: @xyflow/react, Lucide React, Vanilla CSS
- Data: OpenDART 정적 데이터 (`public/data/`)

## Architecture
- `src/`: React UI 컴포넌트, 상태 관리 및 차트/가치사슬 렌더링 로직
- `public/data/`: OpenDART 기반 기업/경쟁사 정적 데이터셋
- `scripts/`: 데이터 가공 및 동기화 스크립트
- `.github/workflows/`: GitHub Actions 배포 워크플로우 (GitHub Pages)

## Canonical Commands
```powershell
# install
npm install

# dev server
npm run dev -- --host 127.0.0.1 --port 5173

# typecheck
npx tsc -b

# build
npm run build
```

## Coding Rules
- 기존 코드 스타일과 네이밍을 따른다.
- 새 의존성은 필요성과 대안을 설명한 후 추가한다.
- 요청과 무관한 포맷/리팩터링을 금지한다.
- 공개 인터페이스 변경은 명시적으로 보고한다.
- API 비밀키는 `.env` 파일에만 보관하며 Git에 커밋하지 않는다.

## Verification Matrix
| 변경 유형 | 필수 검증 |
|---|---|
| 로직/타입 | `npx tsc -b` 타입체크 및 빌드 검증 |
| UI/시각화 | 브라우저/로컬 개발 서버 실행 및 레이아웃 검증 |
| 설정/빌드 | `npm run build` 클린 빌드 검증 |
| 보안/시크릿 | `.env` 및 시크릿 커밋 방지 확인 |

## Memory
- 이 프로젝트 고유 사실은 `.claude\memory\MEMORY.md`에 있다. 세션 시작 시 읽는다.
- 새 기록은 `.claude\memory\pending\`에 초안으로 남기고 승인 후 반영한다.
