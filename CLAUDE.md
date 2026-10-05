# OpenClick

Browser-based sound design tool (UI, foley and game sounds), static site for sounds.camlc.dev.
Read `docs/PLAN.md` before working: it defines the architecture, which workstream owns which
directories, and the rules for parallel work.

## Commands

- `npm run dev` – dev server
- `npm run check` – typecheck, lint (ESLint + Prettier), unit tests, build. Run before pushing.
- `npm run e2e` – Playwright smoke test (builds and serves the app)
- `npm run format` – apply Prettier

## Conventions

- Import core only via `src/core` (index); lint enforces it.
- Modules describe params with `ParamSchema`; the UI is generated from schemas.
- All randomness goes through `createRng` so renders are reproducible.
- Test audio for real with `renderForTest` from `src/test/audio.ts`.
- Stay inside your workstream's directories; shared files change only in small "core change" PRs.
