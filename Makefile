.PHONY: install dev backend frontend types check check-backend check-frontend e2e build serve

install:            ## Install backend (uv) and frontend (npm) dependencies
	cd backend && uv sync
	cd frontend && npm install

dev:                ## Run backend (:8000) and frontend dev server (:5173) together
	@trap 'kill 0' INT TERM EXIT; \
	(cd backend && uv run gridsim serve --reload) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	cd backend && uv run gridsim serve --reload

frontend:
	cd frontend && npm run dev

types:              ## Regenerate frontend API types from the backend OpenAPI spec
	cd backend && uv run gridsim export-openapi ../frontend/openapi.json
	cd frontend && npx openapi-typescript openapi.json -o src/api/openapi.d.ts

check: check-backend check-frontend  ## Everything an agent must pass before calling a change done

check-backend:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q

check-frontend:
	cd frontend && npm run lint && npm run build && npm run test

e2e:                ## End-to-end browser test (Playwright) against a fresh workspace
	cd frontend && npm run e2e

build:              ## Production build: FastAPI serves frontend/dist on :8000
	cd frontend && npm run build

serve: build
	cd backend && uv run gridsim serve
