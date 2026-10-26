# Sample networks

These PGM JSON input files (serialization format version 1.0) are copied from the validation
test data of the [power-grid-model](https://github.com/PowerGridModel/power-grid-model)
repository (`tests/data/power_flow/...`):

| File             | Origin in the PGM repository                                   |
|------------------|----------------------------------------------------------------|
| `vision_mv.json` | Vision MV validation case (`tests/data/power_flow/` test data) |
| `ieee14.json`    | IEEE 14-bus validation case (`tests/data/power_flow/` test data) |

SPDX-FileCopyrightText: Contributors to the Power Grid Model project <powergridmodel@lfenergy.org>

SPDX-License-Identifier: MPL-2.0

Extra fields such as `Name` and `id_reference` (in `vision_mv.json`) are ignored by
`power_grid_model.utils.json_deserialize`; GridSim reads `Name` separately for display.
