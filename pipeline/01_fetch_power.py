"""
SEESAW - step 1: download monthly gridded data from the NASA POWER API.

NASA POWER (Prediction Of Worldwide Energy Resources), https://power.larc.nasa.gov/
No login is required. Meteorological parameters are derived from MERRA-2.

Usage (from the repository root):
    python pipeline/01_fetch_power.py                 # regional mode, Brazil and surroundings
    python pipeline/01_fetch_power.py --mode point    # fallback: one request per grid point

Raw responses are cached in pipeline/raw/, so the script can be re-run safely.

NOTE FOR THE TEAM: this script could not be run in the environment where it was
written (no access to the API). Check the first response against the API docs
(https://power.larc.nasa.gov/docs/services/api/) before trusting a long run.

SI acknowledgement: written with the assistance of a large language model
(Claude, by Anthropic) and reviewed by the team.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

BASE = "https://power.larc.nasa.gov/api/temporal/monthly"
RAW = Path(__file__).parent / "raw"


def get(url, params, tries=4):
    for k in range(tries):
        try:
            r = requests.get(url, params=params, timeout=180)
            if r.status_code == 200:
                return r.json()
            print(f"  HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        except requests.RequestException as exc:
            print(f"  {exc}", file=sys.stderr)
        time.sleep(5 * (k + 1))
    return None


def fetch_regional(var, a, lat0, lat1, lon0, lon1):
    """One parameter per request; the API limits the size of a region (see docs)."""
    out = RAW / f"{var}_regional_{lat0}_{lat1}_{lon0}_{lon1}.json"
    if out.exists():
        return True
    data = get(f"{BASE}/regional", {
        "parameters": var, "community": "AG", "format": "JSON",
        "latitude-min": lat0, "latitude-max": lat1,
        "longitude-min": lon0, "longitude-max": lon1,
        "start": a.start, "end": a.end,
    })
    if not data or "features" not in data:
        return False
    out.write_text(json.dumps(data))
    return True


def fetch_point(variables, a, lat, lon):
    out = RAW / f"point_{lat}_{lon}.json"
    if out.exists():
        return True
    data = get(f"{BASE}/point", {
        "parameters": ",".join(variables), "community": "AG", "format": "JSON",
        "latitude": lat, "longitude": lon, "start": a.start, "end": a.end,
    })
    if not data or "properties" not in data:
        return False
    out.write_text(json.dumps(data))
    return True


def frange(lo, hi, step):
    v = lo
    while v < hi - 1e-9:
        yield round(v, 4)
        v += step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["regional", "point"], default="regional")
    ap.add_argument("--vars", default="T2M,PRECTOTCORR")
    ap.add_argument("--lat", default="-34,6", help="south,north")
    ap.add_argument("--lon", default="-74,-34", help="west,east")
    ap.add_argument("--start", type=int, default=1981)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--tile", type=float, default=10.0, help="tile size in degrees (regional mode)")
    ap.add_argument("--step", type=float, default=1.0, help="grid step in degrees (point mode)")
    ap.add_argument("--pause", type=float, default=1.0, help="seconds between requests")
    a = ap.parse_args()

    RAW.mkdir(exist_ok=True)
    variables = a.vars.split(",")
    lat0, lat1 = map(float, a.lat.split(","))
    lon0, lon1 = map(float, a.lon.split(","))
    failed = 0

    if a.mode == "regional":
        for var in variables:
            for la in frange(lat0, lat1, a.tile):
                for lo in frange(lon0, lon1, a.tile):
                    box = (la, min(la + a.tile, lat1), lo, min(lo + a.tile, lon1))
                    print(f"{var} tile lat {box[0]}..{box[1]} lon {box[2]}..{box[3]}")
                    if not fetch_regional(var, a, *box):
                        failed += 1
                    time.sleep(a.pause)
    else:
        lats = list(frange(lat0, lat1 + a.step, a.step))
        lons = list(frange(lon0, lon1 + a.step, a.step))
        total = len(lats) * len(lons)
        n = 0
        for la in lats:
            for lo in lons:
                n += 1
                if n % 25 == 0:
                    print(f"point {n}/{total}")
                fresh = not (RAW / f"point_{la}_{lo}.json").exists()
                if not fetch_point(variables, a, la, lo):
                    failed += 1
                if fresh:
                    time.sleep(a.pause)

    print(f"Done. Failed requests: {failed}. Raw files in {RAW}")
    if failed:
        print("Re-run the same command to retry only the missing files.")


if __name__ == "__main__":
    main()
