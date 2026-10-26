"""Command line interface: `gridsim serve | run | cases | export-openapi`."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Annotated

import typer

from gridsim.models import CaseStudy, RunInfo
from gridsim.workspace import get_workspace, read_json

app = typer.Typer(help="GridSim: time-series load flow studies on power-grid-model.")


@app.command()
def serve(
    host: str = "127.0.0.1",
    port: int = 8000,
    reload: Annotated[bool, typer.Option(help="Auto-reload on code changes")] = False,
) -> None:
    """Start the web server (API under /api, frontend/dist at / if built)."""
    import uvicorn

    uvicorn.run("gridsim.api.app:create_app", factory=True, host=host, port=port, reload=reload)


@app.command()
def run(case: Annotated[str, typer.Argument(help="Path to a case JSON file or a case id")]) -> None:
    """Run a case headless (synchronously) and store the run in the workspace."""
    from gridsim.runner import RunManager
    from gridsim.validation import validate_case

    ws = get_workspace()
    path = Path(case)
    if path.suffix == ".json" and path.exists():
        study = CaseStudy.model_validate(read_json(path))
    else:
        study = ws.get_case(case)
    result = validate_case(study)
    for issue in result.issues:
        typer.echo(f"[{issue.level}] {issue.message}", err=True)
    if not result.ok:
        raise typer.Exit(2)

    runner = RunManager(ws, mark_stale=False)  # a server may own active runs
    info = runner.create(study)
    typer.echo(f"Run {info.id}: {study.name} ({info.n_timesteps} timesteps)")
    t0 = time.monotonic()
    last = [0.0]

    def show(i: RunInfo) -> None:
        if time.monotonic() - last[0] > 0.5 or i.status != "running":
            last[0] = time.monotonic()
            typer.echo(f"  {i.progress * 100:5.1f}%  {i.message}")

    try:
        final = runner.execute(info.id, show)
    finally:
        runner.shutdown()
    typer.echo(f"Status: {final.status} in {time.monotonic() - t0:.2f} s")
    if final.status != "succeeded":
        typer.echo(f"Error: {final.error}", err=True)
        raise typer.Exit(1)
    summary = read_json(runner.run_dir(info.id) / "summary.json")
    for k, v in summary["kpis"].items():
        typer.echo(f"  {k:22s} {v:.4g}" if isinstance(v, float) else f"  {k:22s} {v}")
    typer.echo(f"Results: {runner.run_dir(info.id)}")


@app.command()
def cases() -> None:
    """List cases in the workspace."""
    ws = get_workspace()
    ws.seed_demo_case()
    for c in ws.list_cases():
        typer.echo(f"{c.id:40s} {c.name}  [{c.network.source}/{c.network.key}]")


@app.command("export-openapi")
def export_openapi(path: Path) -> None:
    """Write the OpenAPI spec (JSON) to PATH."""
    from gridsim.api.app import create_app

    spec = create_app().openapi()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    typer.echo(f"Wrote {path}")


if __name__ == "__main__":
    app()
