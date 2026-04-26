# Repository Guidelines

## Project Structure & Module Organization

This repository is a full-stack gateway for exposing Qwen web capabilities through OpenAI-, Anthropic-, and Gemini-compatible APIs. Backend code lives in `backend/`: routes in `backend/api/`, protocol normalization in `backend/adapter/`, services in `backend/services/`, upstream execution in `backend/upstream/`, and tool-call parsing in `backend/toolcall/`. Frontend code lives in `frontend/src/`, with pages in `pages/`, layout in `layouts/`, and shared API/auth helpers in `lib/`. Runtime state uses `data/` and `logs/`; do not commit secrets or local logs.

## Build, Test, and Development Commands

- `python start.py`: installs backend requirements, starts FastAPI on `127.0.0.1:7860`, and starts Vite on `127.0.0.1:5174`.
- `cd backend && python -m pip install -r requirements.txt`: installs Python dependencies.
- `python -m uvicorn backend.main:app --host 0.0.0.0 --port 7860`: runs only the API service.
- `cd frontend && npm install`: installs frontend dependencies.
- `cd frontend && npm run dev`: starts the Vite dev server.
- `cd frontend && npm run build`: creates a production frontend build.
- `cd frontend && npm run lint`: runs ESLint over the React/TypeScript code.
- `docker compose up -d`: runs the packaged service with `data/` and `logs/` mounted.

## Coding Style & Naming Conventions

Use Python 3.10+ and keep backend modules focused by layer. Prefer typed Pydantic/FastAPI models at API boundaries, snake_case for Python files/functions, and explicit errors over silent fallbacks. Frontend code uses React 19, TypeScript, Vite, Tailwind CSS, and ESLint. Use PascalCase for components/pages, camelCase for variables/functions, and keep shared helpers in `frontend/src/lib/`.

## Testing Guidelines

No dedicated test suite is currently checked in. For existing changes, at minimum run `cd frontend && npm run lint` and `cd frontend && npm run build`, then start the backend and verify `GET /healthz`. Add backend tests under `backend/tests/` as `test_*.py`; add frontend tests beside components or under `frontend/src/__tests__/` as `*.test.tsx`.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries such as `Harden admin auth and CORS` or `Update Dockerfile`. Keep commits focused and describe the user-visible behavior or infrastructure change. Pull requests should include a summary, validation commands, linked issues when applicable, and screenshots or recordings for WebUI changes. Call out environment variable or persistence changes.

## Security & Configuration Tips

Configure secrets through `.env` or deployment settings, not source files. Treat `backend/accounts.json`, `backend/data/accounts.json`, `data/`, and `logs/` as local/runtime state unless intentionally updating documented examples. Validate external inputs at FastAPI boundaries and keep database access parameterized.
