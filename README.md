# CCA(기업경쟁력분석)

경영후계자가 자사와 경쟁사의 경쟁력, 전략, SCM 리스크, SWOT/TOWS, 실행 KPI를 한 화면 흐름으로 정리하는 반응형 웹앱입니다.

## 실행

React/Vite 앱입니다.

API 키는 `.env`에 입력합니다.

```bash
VITE_OPENDART_API_KEY=발급받은_OpenDART_키
VITE_KOSIS_API_KEY=발급받은_KOSIS_키
```

개발 서버는 `.env` 키를 사용해 `/api/opendart/list`, `/api/opendart/company`, `/api/kosis/proxy` 로컬 프록시를 제공합니다. 키를 수정한 뒤에는 서버를 재시작해야 합니다.

GitHub Pages 배포판은 브라우저 CORS 제한을 피하기 위해 GitHub Actions에서 OpenDART 데이터를 미리 조회해 `public/data/opendart-companies.json` 정적 캐시로 생성합니다. API 키는 GitHub Actions Secret에만 저장하고 배포 번들에는 포함하지 않습니다.

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

브라우저에서 `http://localhost:5173`를 열면 됩니다.

## 주요 기능

- 회사명, 산업, 분석 목적, 기간 입력
- 로컬 개발 환경의 OpenDART 실시간 공시목록/회사개황 조회
- GitHub Pages 배포 환경의 OpenDART 정적 캐시 기반 경쟁사 확인
- 회사명 기준 Top5 경쟁사 제안과 선정사유 표시
- 수기 입력 경쟁사 기반 경쟁력 비교 자동 적용
- 분석 목적, 기간, 경쟁사 벤치마크 입력
- 경영자 관점 6축 점수화: 전략, 수익구조, SCM, 시장·채널, 조직·운영, 재무건전성
- 레이더 차트로 자사와 경쟁사 평균 비교
- SWOT 입력 후 TOWS 전략 초안 생성
- 공급처 의존도, 리드타임, 위험도 기반 SCM 리스크 기록
- 실행 과제, 책임자, KPI, 기한 관리
- 경영진 1페이지 보고서 미리보기
- 브라우저 로컬 저장, JSON/Markdown 내보내기, 보고서 인쇄

## 설계 메모

제공된 `기업 경쟁력 분석 101 가이드`의 핵심 흐름을 앱 워크플로우로 바꿨습니다.

1. 목적과 범위 설정
2. Top 경쟁사와 벤치마크 정의
3. 6축 경쟁력 점수화
4. SWOT에서 TOWS 전략 도출
5. SCM 리스크와 실행 KPI 연결

서버 없이도 사용할 수 있도록 모든 데이터는 브라우저 `localStorage`에 저장됩니다.
