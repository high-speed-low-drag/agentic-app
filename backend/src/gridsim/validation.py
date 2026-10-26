"""Case validation: network availability + study-type specific checks."""

from __future__ import annotations

from gridsim.models import CaseStudy, ValidationIssue, ValidationResult
from gridsim.networks import load_network
from gridsim.networks.overrides import apply_overrides, check_overrides
from gridsim.studies import STUDY_TYPES


def validate_case(case: CaseStudy) -> ValidationResult:
    issues: list[ValidationIssue] = []
    n = case.time.n_timesteps
    if case.study_type not in STUDY_TYPES:
        issues.append(
            ValidationIssue(level="error", message=f"Unknown study type '{case.study_type}'")
        )
    try:
        net = load_network(case.network.source, case.network.key)
    except Exception as exc:  # noqa: BLE001
        issues.append(ValidationIssue(level="error", message=f"Network: {exc}"))
        net = None
    if net is not None and case.network_overrides:
        override_issues = check_overrides(net, case.network_overrides)
        issues += override_issues
        if not any(i.level == "error" for i in override_issues):
            net = apply_overrides(net, case.network_overrides)
    if net is not None and case.study_type in STUDY_TYPES:
        issues += STUDY_TYPES.get(case.study_type).validate(case, net)
    ok = not any(i.level == "error" for i in issues)
    return ValidationResult(ok=ok, n_timesteps=n, issues=issues)
