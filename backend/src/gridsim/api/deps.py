"""Request-scoped dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from gridsim.runner import RunManager
from gridsim.workspace import Workspace


def _workspace(request: Request) -> Workspace:
    return request.app.state.workspace


def _runner(request: Request) -> RunManager:
    return request.app.state.runner


WorkspaceDep = Annotated[Workspace, Depends(_workspace)]
RunnerDep = Annotated[RunManager, Depends(_runner)]
