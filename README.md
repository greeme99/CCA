# CCA(기업경쟁력분석)

경영후계자가 자사와 경쟁사의 경쟁력, 전략, SCM 리스크, SWOT/TOWS, 실행 KPI를 한 화면 흐름으로 정리하는 반응형 웹앱입니다.

## 실행

React/Vite 앱입니다.

API 키는 `.env`에 입력합니다.

```bash
VITE_OPENDART_API_KEY=발급받은_OpenDART_키
KOSIS_API_KEY=발급받은_KOSIS_키
```

브라우저 CORS 제한 때문에 외부 데이터는 모두 **빌드 시 정적 캐시로 만들어** 앱이 그 캐시만 읽습니다. 키는 스크립트 실행 시에만 쓰이고 배포 번들에는 포함되지 않습니다.

```bash
# DART 전체 기업목록 캐시 (public/data/opendart-companies.json)
node scripts/prefetch-opendart.mjs

# KOSIS 업종 통계 캐시 (public/data/kosis-industry.json)
node scripts/prefetch-kosis.mjs
```

KOSIS는 통계표마다 분류코드와 항목이 달라 요청 URL을 직접 지정합니다. KOSIS 통계표 화면의 `OpenAPI > URL 생성`으로 만든 주소를 `scripts/kosis-series.json`의 `url`에 넣으면 됩니다(`apiKey`와 `format`은 스크립트가 덮어씁니다). URL이 비어 있으면 KOSIS 수치를 쓰지 않고 업종 가중치(내부 규칙)만 사용하며, 화면에도 KOSIS를 근거로 표시하지 않습니다.

개발 서버는 `.env`의 DART 키로 `/api/opendart/company` 로컬 프록시를 제공해 대표자·업종코드를 보강합니다. 키를 수정한 뒤에는 서버를 재시작해야 합니다.

GitHub Actions는 배포 시 두 캐시를 다시 생성합니다. 저장소 Secret에 `VITE_OPENDART_API_KEY`와 `KOSIS_API_KEY`를 등록하세요. KOSIS 단계는 실패해도 배포를 막지 않습니다.

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

브라우저에서 `http://localhost:5173`를 열면 됩니다.

## 주요 기능

- 회사명, 산업, 분석 목적, 기간 입력
- DART 전체 기업목록(corpCode) 캐시 기반 경쟁사 확인 (상장사 전체 + 비상장 벤치마크)
- KOSIS 업종 통계 연동: 최근 시점 수치와 전기 대비 증감률을 6축 시장·채널 축 보정 근거로 사용
- 업종 기준 Top5 경쟁사 제안과 선정사유 표시
- 수기 입력 경쟁사 기반 경쟁력 비교 자동 적용
- 분석 목적, 기간, 경쟁사 벤치마크 입력
- JSON 가져오기/내보내기, 초기화 전 확인
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
