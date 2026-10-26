"""Run results: parquet writer, summary/KPIs and read-side queries."""

from gridsim.results.query import RESULTS, QueryError, ResultStore
from gridsim.results.summary import compute_summary, find_episodes
from gridsim.results.writer import ResultWriter

__all__ = [
    "RESULTS",
    "QueryError",
    "ResultStore",
    "ResultWriter",
    "compute_summary",
    "find_episodes",
]
