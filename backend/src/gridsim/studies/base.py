"""Study type interface."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from gridsim.models import CaseStudy, ResultSummary, ValidationIssue
from gridsim.networks.base import LoadedNetwork

ProgressCallback = Callable[[float, str], None]
CancelCheck = Callable[[], bool]


class RunCancelled(Exception):
    """Raised by a study when the cancel check returns True."""


@dataclass
class StudyOutcome:
    summary: ResultSummary
    n_failed_timesteps: int


class StudyType(Protocol):
    key: str
    name: str

    def validate(self, case: CaseStudy, net: LoadedNetwork) -> list[ValidationIssue]: ...

    def run(
        self,
        run_id: str,
        case: CaseStudy,
        net: LoadedNetwork,
        run_dir: Path,
        progress: ProgressCallback,
        is_cancelled: CancelCheck,
    ) -> StudyOutcome: ...
