"""Study types (extension point).

A study type validates a case against a loaded network and runs it into a run
directory (parquet results + summary.json). Register new ones in `STUDY_TYPES`.
"""

from gridsim.registry import Registry
from gridsim.studies.base import RunCancelled, StudyOutcome, StudyType
from gridsim.studies.timeseries_powerflow import TimeseriesPowerFlow

STUDY_TYPES: Registry[StudyType] = Registry("study type")
STUDY_TYPES.register(TimeseriesPowerFlow.key, TimeseriesPowerFlow())

__all__ = ["STUDY_TYPES", "RunCancelled", "StudyOutcome", "StudyType"]
