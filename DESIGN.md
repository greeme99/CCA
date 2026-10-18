# DESIGN.md (Project Design System Source of Truth)

본 문서는 현재 프로젝트 전용 디자인 토큰 및 디자인 시스템 수칙(1순위 소스 오브 트루스)이다.

---

## 0. Source of Truth Rules
- 현재 프로젝트에 선언된 토큰 및 가이드라인이 전역 가이드라인보다 우선 적용된다.
- 새로운 디자인 값(색상, 폰트, 여백) 임의 생성을 금지하고 `DESIGN.md` 토큰을 준수한다.
- 디자인 수정 후에는 `npm.cmd run design:lint`를 실행한다.

---

## 1. Project Tokens
- **Theme**: Light Mode / Dark Mode Dual Theme Supported
- **Primary Color**: `var(--color-primary, #0066ff)`
- **Data Table Sort Symbols**: 비활성 `⇅` (opacity 0.35 muted), 활성 `▲`/`▼` (bold/primary)
