# Demo cases

GridSim seeds these cases into a workspace (see `Workspace.seed_demo_cases`), next to the
original "Vision MV – summer week" demo, which is built in code. Each file is a `CaseStudy`
whose `id` equals its file name. All three run in well under a second, with 0 failed timesteps,
and were tuned so that the violations are clearly visible. The network edits are deliberate
and listed below. Nothing changes the network files themselves: every edit is a case-level
network override.

**`demo-mv-summer-pv`: Vision MV – summer PV overvoltage.** A midsummer week (22–29 June 2026,
15 min) with rooftop PV of about 125 % of each LV area's peak demand (`mode: add` PV profiles on
the LV loads: -1.2 MW per 1 MVA area, 200 kWp barn roofs on the rural 160 kVA areas, -1.9 MW on
the 1.6 MVA area), plus the PV parks and wind from the network file. The weather is mostly sunny
(cloudiness 0.6, seed 3). In the UI, look at the KPI tiles (u_max about 1.06 pu, loading about
115 %), the Violations tab (about 120 overvoltage and 50 overloading episodes, every sunny
midday) and the voltage heatmap. The source power goes negative at midday: the network exports.
The overrides are what an operator would set for the winter peak and then leave in place. The HV
source is at `u_ref` 1.03 pu (a typical HV set point), the main transformer is on tap -1 instead
of -3, and all LS transformers are on tap 4 instead of 3, one step (+2.4 %) of boost. So the
summer midday rise starts from an already high voltage.

**`demo-mv-winter-peak`: Vision MV – winter evening peak.** A cold January week (11–18 January
2027, 15 min). Household demand is scaled +10 % (heat-pump growth), with amplitude jitter 0.05
so the areas do not peak in lockstep. Two cohorts of evening EV home charging (60 kW per 1 MVA
area each, seeds 4 and 5) are added on top. In the UI, look at the Violations tab (about 80
overloading and 7 undervoltage episodes, all 17–21 h) and the loading views. The LS transformers
and feeder cable R1 run up to about 140 %, and KNP 1 (LS) drops to about 0.92 pu. That node is
behind transformer 78, which has a high impedance. The only overrides are `q_specified` on the 20
LV loads. They give the loads power factor 0.97 (q = p·tan(acos 0.97), rounded to 100 var),
because the network file has q = 0, which hides the voltage drop of a real winter load.

**`demo-ieee14-n1`: IEEE 14 – rated, line 2–4 outage.** The IEEE 14-bus network in a January week
(11–18 January 2027, 60 min) with +20 % demand. A residential profile is on the nine
residential/commercial buses, and an industrial (commercial-load) profile, open 07–22 h, is on
the large loads at buses 3 and 4. Voltage limits are 0.95–1.10 pu (a transmission band). In the
UI, look at the Violations tab (about 50 overloading episodes, no voltage violations) and branch
loading. Line 4–5 is overloaded through every weekday from 07 to 22 h, up to about 150 %. Lines
2–5, 2–3 and 1–5 are overloaded at the evening peak, while the generators' voltage control
holds every bus voltage. The overrides are needed because the network file has no branch
ratings (`sn` is empty, so loading would be undefined). Each branch is rated at 1.3x its
base-case flow, rounded up to 5 MVA: a network with 30 % headroom today. Line 2–4 (generic
branch 104) is switched out on both ends to model a maintenance outage. That is the N-1
situation the study is about.
