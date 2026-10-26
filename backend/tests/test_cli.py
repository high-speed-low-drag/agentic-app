import json

from typer.testing import CliRunner

from gridsim.cli import app

from .conftest import make_case

runner = CliRunner()


def test_cases_and_run_by_file(tmp_path, workspace) -> None:
    r = runner.invoke(app, ["cases"])
    assert r.exit_code == 0 and "vision-mv-summer-week" in r.output
    path = tmp_path / "case.json"
    path.write_text(make_case().model_dump_json())
    r = runner.invoke(app, ["run", str(path)])
    assert r.exit_code == 0, r.output
    assert "Status: succeeded" in r.output and "energy_import_mwh" in r.output
    assert len(list(workspace.runs_dir.glob("*/summary.json"))) == 1


def test_export_openapi(tmp_path) -> None:
    out = tmp_path / "openapi.json"
    r = runner.invoke(app, ["export-openapi", str(out)])
    assert r.exit_code == 0
    assert "/api/cases" in json.loads(out.read_text())["paths"]
