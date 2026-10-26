"""Profile generators (extension point).

To add a generator: create `profiles/<name>.py` with a `ProfileGenerator` subclass
(key, name, description, applies_to, default_mode, a Pydantic `Params` model and a
vectorised `generate(timestamps, n_elements, params) -> (n_steps, n_elements)` array of
dimensionless multipliers, deterministic given a seed), register it below and add a test.
The frontend renders the parameter form from `Params.model_json_schema()`.
"""

from gridsim.profiles.base import ProfileGenerator, ProfileParamsError
from gridsim.profiles.commercial import CommercialLoadGenerator
from gridsim.profiles.constant import ConstantGenerator
from gridsim.profiles.csv_profile import CsvGenerator
from gridsim.profiles.ev import EvChargingGenerator
from gridsim.profiles.pv import PvGenerator
from gridsim.profiles.residential import ResidentialLoadGenerator
from gridsim.registry import Registry

PROFILE_GENERATORS: Registry[ProfileGenerator] = Registry("profile generator")
for _gen in (
    ConstantGenerator(),
    ResidentialLoadGenerator(),
    CommercialLoadGenerator(),
    PvGenerator(),
    EvChargingGenerator(),
    CsvGenerator(),
):
    PROFILE_GENERATORS.register(_gen.key, _gen)

__all__ = ["PROFILE_GENERATORS", "ProfileGenerator", "ProfileParamsError"]
