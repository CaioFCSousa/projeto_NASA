"""
SEESAW - step 2: turn the raw NASA POWER files into the JSON read by the web app.

For every grid cell: annual means, Theil-Sen slope per decade, Mann-Kendall test
with trend-free pre-whitening, and Benjamini-Hochberg FDR across the whole map.

Usage (from the repository root):
    python pipeline/02_trends.py              # reads pipeline/raw, writes web/data
    python pipeline/02_trends.py --res 1.0    # output grid in degrees

SI acknowledgement: written with the assistance of a large language model
(Claude, by Anthropic) and reviewed by the team.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from seesaw_stats import VARIABLES, analyse_cube, write_manifest

HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE.parent / "web" / "data"
FILL = -900.0  # POWER uses -999 for missing values


def load_raw(var):
    """Returns {(lat, lon): {"YYYYMM": value}} from regional and point files."""
    pts = {}
    for f in sorted(RAW.glob(f"{var}_regional_*.json")):
        data = json.loads(f.read_text())
        for feat in data.get("features", []):
            lon, lat = feat["geometry"]["coordinates"][:2]
            vals = feat["properties"]["parameter"].get(var)
            if vals:
                pts[(round(lat, 4), round(lon, 4))] = vals
    for f in sorted(RAW.glob("point_*.json")):
        data = json.loads(f.read_text())
        lon, lat = data["geometry"]["coordinates"][:2]
        vals = data["properties"]["parameter"].get(var)
        if vals:
            pts[(round(lat, 4), round(lon, 4))] = vals
    return pts


def annual_series(vals, years):
    """Mean of the 12 months of each year; NaN if any month is missing."""
    out = []
    for y in years:
        months = [vals.get(f"{y}{m:02d}") for m in range(1, 13)]
        if any(v is None or v < FILL for v in months):
            out.append(np.nan)
        else:
            out.append(float(np.mean(months)))
    return np.array(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vars", default="T2M,PRECTOTCORR")
    ap.add_argument("--start", type=int, default=1981)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--res", type=float, default=1.0, help="output grid size in degrees")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    years = list(range(a.start, a.end + 1))
    metas = []
    for var in a.vars.split(","):
        pts = load_raw(var)
        if not pts:
            print(f"{var}: no raw files found in {RAW}. Run 01_fetch_power.py first.")
            continue
        # Average the native points that fall into each output cell.
        bins = defaultdict(list)
        for (lat, lon), vals in pts.items():
            key = (round(round(lat / a.res) * a.res, 4), round(round(lon / a.res) * a.res, 4))
            bins[key].append(annual_series(vals, years))
        lats = sorted({k[0] for k in bins})
        lons = sorted({k[1] for k in bins})
        cube = np.full((len(lats), len(lons), len(years)), np.nan)
        for (lat, lon), series in bins.items():
            cube[lats.index(lat), lons.index(lon), :] = np.mean(series, axis=0)
        meta = analyse_cube(
            lats, lons, years, cube, var,
            source="NASA POWER monthly API (MERRA-2 derived), https://power.larc.nasa.gov/",
            synthetic=False,
            out_path=OUT / f"{VARIABLES[var]['id']}.json",
            res=a.res,
        )
        metas.append(meta)
        print(f"{var}: {meta['n_cells']} cells, significant uncorrected "
              f"{meta['n_sig_uncorrected']}, after FDR {meta['n_sig_fdr']}")
    if metas:
        write_manifest(metas, OUT / "manifest.json")
        print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
