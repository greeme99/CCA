# CCA Project Agent Instructions

이 프로젝트는 CCA(기업경쟁력분석) React/Vite 앱입니다. 개발 작업은 Codex agent harness 기준으로 진행합니다.

## Project Root

- Current project root: `/Users/greeme/Codex/Projects/기업_경쟁력_분석`
- Deprecated old root: `/Users/greeme/Documents/기업_경쟁력_분석`
- The old root is scheduled for deletion. Do not edit, run, commit, or deploy from the old root unless the user explicitly asks for recovery work.

## Harness Guidance

- Follow `/Users/greeme/Codex/AGENTS.md` for the Hermes-style closed learning loop.
- Load durable memory from `/Users/greeme/Codex/work/codex-memory/` at the start of meaningful work.
- Use reusable procedures under `/Users/greeme/Codex/work/codex-skills/**/SKILL.md` when they match the task.
- Use Hermes reference material under `/Users/greeme/Codex/work/hermes-agent/` only as guidance; prefer the CCA app architecture and local tooling.

## Development

- Package manager: npm, using `package-lock.json`.
- Local dev server: `npm run dev -- --host 127.0.0.1 --port 5173`.
- Build verification: `npm run build`.
- API secrets belong in `.env` locally and GitHub Actions Secrets for deployment. Do not commit secret values.
- GitHub Pages deployment relies on generated/static OpenDART data under `public/data/` and the existing Actions workflow.

## Working Style

- Prefer small, verified changes that preserve the current React/Vite structure.
- Search with `rg` before editing; avoid broad refactors unless required by the task.
- When a task teaches a reusable project fact or fix, update Codex memory or skills after verification.

