"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.routing import APIRoute

from gridsim import __version__
from gridsim.api.routes import cases, health, networks, profiles, results, runs
from gridsim.networks.upload import InvalidNetworkError
from gridsim.profiles.base import ProfileParamsError
from gridsim.profiles.csv_store import CsvProfileError
from gridsim.registry import UnknownKeyError
from gridsim.results import QueryError
from gridsim.runner import RunManager
from gridsim.workspace import (
    REPO_ROOT,
    ConflictError,
    NotFoundError,
    Workspace,
    get_workspace,
    set_workspace,
)

FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

ERROR_STATUS: dict[type[Exception], int] = {
    NotFoundError: 404,
    UnknownKeyError: 404,
    ConflictError: 409,
    QueryError: 400,
    ProfileParamsError: 400,
    CsvProfileError: 400,
    InvalidNetworkError: 400,
    ValueError: 400,
}


def _operation_id(route: APIRoute) -> str:
    return route.name


def _format_validation(exc: RequestValidationError) -> str:
    parts = []
    for e in exc.errors():
        loc = ".".join(str(p) for p in e.get("loc", ()) if p not in ("body", "query", "path"))
        parts.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
    return "; ".join(parts) or "Invalid request"


def _mount_spa(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(index)


def create_app(workspace_root: Path | str | None = None, max_workers: int = 1) -> FastAPI:
    """Build the app. `workspace_root` overrides `GRIDSIM_WORKSPACE`."""
    if workspace_root is not None:
        set_workspace(Workspace(workspace_root))
    ws = get_workspace()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        ws.seed_demo_cases()
        app.state.runner = RunManager(ws, max_workers=max_workers)
        try:
            yield
        finally:
            app.state.runner.shutdown()

    app = FastAPI(
        title="GridSim API",
        version=__version__,
        lifespan=lifespan,
        generate_unique_id_function=_operation_id,
    )
    app.state.workspace = ws
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for exc_type, code in ERROR_STATUS.items():

        def handler(_req: Request, exc: Exception, code: int = code) -> JSONResponse:
            return JSONResponse(status_code=code, content={"detail": str(exc)})

        app.add_exception_handler(exc_type, handler)

    @app.exception_handler(RequestValidationError)
    def _validation(_req: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({"detail": _format_validation(exc), "errors": exc.errors()}),
        )

    for module in (health, networks, profiles, cases, runs, results):
        app.include_router(module.router, prefix="/api")

    if (FRONTEND_DIST / "index.html").exists():
        _mount_spa(app, FRONTEND_DIST)
    return app
