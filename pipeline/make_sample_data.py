"""
SEESAW - SYNTHETIC sample data, so the website runs before the real download.

THIS IS NOT NASA DATA. The values are random numbers with an invented pattern.
The website shows a "SAMPLE DATA" banner while these files are in web/data.
Replace them by running 01_fetch_power.py and 02_trends.py.

SI acknowledgement: written with the assistance of a large language model
(Claude, by Anthropic) and reviewed by the team.
"""
from pathlib import Path

import numpy as np

from seesaw_stats import VARIABLES, analyse_cube, write_manifest

OUT = Path(__file__).parent.parent / "web" / "data"
rng = np.random.default_rng(2026)

lats = np.arange(-34, 7, 1.0)
lons = np.arange(-74, -33, 1.0)
years = np.arange(1981, 2026)
t = (years - years.mean()) / 10.0  # decades
LA, LO = np.meshgrid(lats, lons, indexing="ij")


def ar1(shape, phi, sd):
    e = rng.normal(0, sd, shape)
    out = np.zeros(shape)
    out[..., 0] = e[..., 0]
    for k in range(1, shape[-1]):
        out[..., k] = phi * out[..., k - 1] + e[..., k]
    return out


def blob(lat0, lon0, s):
    return np.exp(-(((LA - lat0) / s) ** 2 + ((LO - lon0) / s) ** 2))


# Temperature: warming almost everywhere, stronger inland, one weak cooling patch.
t_trend = 0.12 + 0.22 * blob(-12, -52, 14) - 0.20 * blob(-30, -40, 5)
temp = (24 - 0.25 * np.abs(LA + 5))[..., None] + t_trend[..., None] * t + ar1(LA.shape + (years.size,), 0.3, 0.28)

# Precipitation: an invented dipole. One shared year-to-year mode loads with
# opposite signs on two regions, which also carry opposite trends.
mode = rng.normal(0, 1, years.size)
load = blob(-8, -41, 7) - blob(-28, -53, 7)
p_trend = -0.30 * blob(-8, -41, 7) + 0.28 * blob(-28, -53, 7)
prec = ((4.0 + 1.5 * blob(-3, -62, 12))[..., None]
        + p_trend[..., None] * t
        - 0.35 * load[..., None] * mode
        + ar1(LA.shape + (years.size,), 0.1, 0.30))
prec = np.clip(prec, 0.05, None)

OUT.mkdir(parents=True, exist_ok=True)
metas = []
for var, cube in (("T2M", temp), ("PRECTOTCORR", prec)):
    m = analyse_cube(lats, lons, years, cube, var,
                     source="SYNTHETIC sample data (not NASA data)", synthetic=True,
                     out_path=OUT / f"{VARIABLES[var]['id']}.json", res=1.0)
    metas.append(m)
    print(var, m["n_cells"], "cells | p<0.05:", m["n_sig_uncorrected"], "| FDR:", m["n_sig_fdr"])
write_manifest(metas, OUT / "manifest.json")
