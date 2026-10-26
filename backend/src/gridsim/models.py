"""Pydantic models for the HTTP API (see docs/api-contract.md, which is binding)."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any, Literal

import pandas as pd
from pydantic import BaseModel, Field, field_validator, model_validator

MAX_TIMESTEPS = 100_000

CalculationMethodName = Literal["newton_raphson", "iterative_current", "linear", "linear_current"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
TERMINAL_STATUSES: frozenset[str] = frozenset({"succeeded", "failed", "cancelled"})
BranchType = Literal[
    "line", "asym_line", "link", "transformer", "generic_branch", "three_winding_transformer"
]
ApplianceType = Literal["sym_load", "sym_gen", "asym_load", "asym_gen", "shunt"]
TargetComponent = Literal["sym_load", "sym_gen"]
ResultComponent = Literal["node", "branch", "source", "appliance"]


def _naive(value: datetime) -> datetime:
    """Drop timezone info: the API works with naive local timestamps."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


# --- Meta -------------------------------------------------------------------------------------


class Health(BaseModel):
    status: str = "ok"
    pgm_version: str


# --- Networks ---------------------------------------------------------------------------------


class NetworkRef(BaseModel):
    source: str = Field(description="Network source key, e.g. 'sample' or 'upload'")
    key: str = Field(description="Network key within the source")


class NetworkItem(BaseModel):
    source: str
    key: str
    name: str
    description: str = ""
    counts: dict[str, int] = Field(default_factory=dict)


EditableFieldKind = Literal["float", "int", "bool"]


class EditableField(BaseModel):
    """An input attribute a case may override (see networks/editable.py)."""

    field: str
    label: str
    unit: str = Field("", description="Display unit")
    scale: float = Field(1.0, description="display value = SI value * scale")
    kind: EditableFieldKind = "float"
    min: float | None = Field(None, description="Minimum SI value (inclusive)")
    max: float | None = Field(None, description="Maximum SI value (inclusive)")


# None = the network file has no value for that field (e.g. a generic_branch without `sn`).
ParamValues = dict[str, float | None]


class TopologyNode(BaseModel):
    id: int
    name: str
    u_rated: float


class TopologyBranch(BaseModel):
    id: int
    type: BranchType
    name: str
    from_node: int
    to_node: int
    node_3: int | None = None
    in_service: bool = True
    params: ParamValues = Field(
        default_factory=dict, description="File values of the editable fields (SI units)"
    )


class TopologyAppliance(BaseModel):
    id: int
    type: ApplianceType
    name: str
    node: int
    p_specified: float | None = None
    q_specified: float | None = None
    b1: float | None = Field(
        None, description="Shunt positive-sequence susceptance (S); >0 capacitive, <0 inductive"
    )
    in_service: bool = True
    params: ParamValues = Field(
        default_factory=dict, description="File values of the editable fields (SI units)"
    )


class TopologySource(BaseModel):
    id: int
    name: str
    node: int
    u_ref: float
    params: ParamValues = Field(
        default_factory=dict, description="File values of the editable fields (SI units)"
    )


class NetworkTopology(BaseModel):
    source: str
    key: str
    name: str
    nodes: list[TopologyNode]
    branches: list[TopologyBranch]
    appliances: list[TopologyAppliance]
    sources: list[TopologySource]
    counts: dict[str, int]


# --- Case study -------------------------------------------------------------------------------


class TimeSettings(BaseModel):
    start: datetime
    end: datetime
    resolution_minutes: int = Field(15, ge=1, le=1440)

    @field_validator("start", "end")
    @classmethod
    def _strip_tz(cls, v: datetime) -> datetime:
        return _naive(v)

    @model_validator(mode="after")
    def _check_window(self) -> TimeSettings:
        if self.end <= self.start:
            raise ValueError("end must be after start")
        if self.n_timesteps > MAX_TIMESTEPS:
            raise ValueError(
                f"time window has {self.n_timesteps} timesteps; the maximum is {MAX_TIMESTEPS}"
            )
        return self

    @property
    def n_timesteps(self) -> int:
        """Number of timesteps `start, start+res, ...` with `end` excluded."""
        return math.ceil((self.end - self.start) / timedelta(minutes=self.resolution_minutes))

    def timestamps(self) -> pd.DatetimeIndex:
        return pd.date_range(
            self.start, periods=self.n_timesteps, freq=f"{self.resolution_minutes}min"
        )


class CalculationSettings(BaseModel):
    method: CalculationMethodName = "newton_raphson"
    error_tolerance: float = Field(1e-8, gt=0)
    max_iterations: int = Field(20, ge=1, le=1000)


class Limits(BaseModel):
    u_min_pu: float = 0.95
    u_max_pu: float = 1.05
    loading_max: float = 1.0


class ProfileTarget(BaseModel):
    component: TargetComponent = "sym_load"
    ids: list[int] | None = Field(None, description="null = all elements of the component")


class ProfileAssignment(BaseModel):
    id: str = "a1"
    label: str = ""
    generator: str
    params: dict[str, Any] = Field(default_factory=dict)
    target: ProfileTarget = Field(default_factory=ProfileTarget)
    mode: Literal["scale", "add"] = "scale"
    magnitude_w: float | None = Field(None, description="Required for mode 'add' (W)")
    factor: float = Field(
        1.0, ge=0, le=100, description="Multiplier on the profile m(t), e.g. 2 = twice the peak"
    )


class NetworkOverride(BaseModel):
    """Per-case override of one editable input attribute of one network element."""

    component: str = Field(description="PGM component, e.g. 'sym_load'")
    id: int
    field: str
    value: float = Field(description="New value in SI/PGM units (booleans as 0/1)")


class CaseStudy(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1)
    description: str = ""
    study_type: str = "timeseries_powerflow"
    network: NetworkRef
    time: TimeSettings
    calculation: CalculationSettings = Field(default_factory=CalculationSettings)
    limits: Limits = Field(default_factory=Limits)
    profile_assignments: list[ProfileAssignment] = Field(default_factory=list)
    network_overrides: list[NetworkOverride] = Field(
        default_factory=list, description="Edits on top of the unchanged network file"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ValidationIssue(BaseModel):
    level: Literal["error", "warning"]
    message: str


class ValidationResult(BaseModel):
    ok: bool
    n_timesteps: int
    issues: list[ValidationIssue] = Field(default_factory=list)


# --- Runs -------------------------------------------------------------------------------------


class RunInfo(BaseModel):
    id: str
    case_id: str
    case_name: str
    status: RunStatus = "queued"
    progress: float = 0.0
    message: str = ""
    n_timesteps: int = 0
    n_failed_timesteps: int = 0
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_s: float | None = None
    error: str | None = None


class CaseSummary(BaseModel):
    id: str
    name: str
    description: str
    network: NetworkRef
    time: TimeSettings
    updated_at: datetime | None
    last_run: RunInfo | None = None


# --- Profiles ---------------------------------------------------------------------------------


class ProfileGeneratorInfo(BaseModel):
    key: str
    name: str
    description: str
    applies_to: list[TargetComponent]
    default_mode: Literal["scale", "add"]
    params_schema: dict[str, Any]


class ProfilePreviewRequest(BaseModel):
    generator: str
    params: dict[str, Any] = Field(default_factory=dict)
    time: TimeSettings
    n_elements: int = Field(3, ge=1, le=20)


class ProfilePreviewResponse(BaseModel):
    timestamps: list[datetime]
    series: list[list[float]]


class ProfileUploadInfo(BaseModel):
    file_id: str
    filename: str
    columns: list[str]
    n_rows: int
    start: datetime
    end: datetime


# --- Results ----------------------------------------------------------------------------------


class Kpis(BaseModel):
    u_min_pu: float | None
    u_max_pu: float | None
    loading_max: float | None
    n_voltage_violations: int
    n_loading_violations: int
    energy_import_mwh: float
    energy_losses_mwh: float
    n_failed_timesteps: int


class NodeExtremes(BaseModel):
    id: int
    name: str
    u_min_pu: float | None
    u_max_pu: float | None
    u_mean_pu: float | None
    t_u_min: datetime | None
    t_u_max: datetime | None


class BranchExtremes(BaseModel):
    id: int
    type: BranchType
    name: str
    loading_max: float | None
    loading_mean: float | None
    t_loading_max: datetime | None


class Violation(BaseModel):
    component: Literal["node", "branch"]
    id: int
    name: str
    kind: Literal["undervoltage", "overvoltage", "overloading"]
    start: datetime
    end: datetime
    n_timesteps: int
    worst_value: float
    limit: float


class ResultSummary(BaseModel):
    run_id: str
    n_timesteps: int
    timestamps_start: datetime
    resolution_minutes: int
    kpis: Kpis
    nodes: list[NodeExtremes]
    branches: list[BranchExtremes]
    violations: list[Violation]


class TimeseriesSeries(BaseModel):
    id: int
    name: str
    values: list[float | None]


class TimeseriesResponse(BaseModel):
    timestamps: list[datetime]
    field: str
    unit: str
    series: list[TimeseriesSeries]


class EnvelopeResponse(BaseModel):
    timestamps: list[datetime]
    field: str
    unit: str
    min: list[float | None]
    mean: list[float | None]
    max: list[float | None]
    p05: list[float | None]
    p95: list[float | None]


class HeatmapResponse(BaseModel):
    timestamps: list[datetime]
    ids: list[int]
    names: list[str]
    values: list[list[float | None]]
    aggregation: Literal["max"] = "max"


class SnapshotResponse(BaseModel):
    index: int
    timestamp: datetime
    nodes: dict[str, float | None]
    branches: dict[str, float | None]
