"""
SEESAW - trend statistics.

Theil-Sen slope, Mann-Kendall test with trend-free pre-whitening (Yue et al., 2002)
and Benjamini-Hochberg false discovery rate (field significance, Wilks 2016).

SI acknowledgement: this file was written with the assistance of a large language
model (Claude, by Anthropic) and reviewed by the team.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import numpy as np
from scipy import stats

ALPHA = 0.05

VARIABLES = {
    "T2M": {
        "id": "temperature",
        "label": "Air temperature at 2 m",
        "unit": "°C",
        "palette": "temp",
    },
    "PRECTOTCORR": {
        "id": "precipitation",
        "label": "Precipitation",
        "unit": "mm/day",
        "palette": "precip",
    },
}


def mann_kendall(x: np.ndarray) -> tuple[float, float]:
    """Two-sided Mann-Kendall test. Returns (z, p). Includes the tie correction."""
    x = np.asarray(x, dtype=float)
    n = x.size
    i, j = np.triu_indices(n, k=1)
    s = np.sign(x[j] - x[i]).sum()
    _, counts = np.unique(x, return_counts=True)
    ties = (counts * (counts - 1) * (2 * counts + 5)).sum()
    var_s = (n * (n - 1) * (2 * n + 5) - ties) / 18.0
    if var_s <= 0:
        return 0.0, 1.0
    if s > 0:
        z = (s - 1) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s)
    else:
        z = 0.0
    p = 2.0 * (1.0 - stats.norm.cdf(abs(z)))
    return float(z), float(p)


def lag1_autocorr(x: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    d = x - x.mean()
    denom = (d * d).sum()
    if denom == 0:
        return 0.0
    return float((d[:-1] * d[1:]).sum() / denom)


def trend_cell(years: np.ndarray, x: np.ndarray) -> dict:
    """Trend statistics for one grid cell (one annual series)."""
    t = np.asarray(years, dtype=float)
    x = np.asarray(x, dtype=float)
    n = x.size
    slope, _intercept, lo, hi = stats.theilslopes(x, t, alpha=0.95)

    # Trend-free pre-whitening: remove the trend, remove lag-1 autocorrelation
    # from the residuals if it is significant, put the trend back, then test.
    detr = x - slope * t
    r1 = lag1_autocorr(detr)
    if abs(r1) > 1.96 / math.sqrt(n):
        y = detr[1:] - r1 * detr[:-1] + slope * t[1:]
        prewhitened = True
    else:
        y = x
        prewhitened = False
    z, p = mann_kendall(y)
    return {
        "slope": float(slope) * 10.0,  # per decade
        "lo": float(lo) * 10.0,
        "hi": float(hi) * 10.0,
        "p": p,
        "z": z,
        "r1": r1,
        "prewhitened": prewhitened,
    }


def benjamini_hochberg(p: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg adjusted p-values (q-values)."""
    p = np.asarray(p, dtype=float)
    m = p.size
    order = np.argsort(p)
    ranked = p[order] * m / np.arange(1, m + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    q = np.empty(m)
    q[order] = np.clip(ranked, 0, 1)
    return q


def analyse_cube(lats, lons, years, cube, var_key, source, synthetic, out_path, res):
    """
    cube: array [n_lat, n_lon, n_years] of annual means (NaN where missing).
    Writes the JSON file read by the web app and returns its metadata.
    """
    cfg = VARIABLES[var_key]
    years = np.asarray(years)
    rows = []
    for a, lat in enumerate(lats):
        for b, lon in enumerate(lons):
            series = cube[a, b, :]
            if not np.all(np.isfinite(series)):
                continue
            st = trend_cell(years, series)
            rows.append((float(lat), float(lon), st, series))
    if not rows:
        raise SystemExit(f"No complete cells for {var_key}")

    q = benjamini_hochberg(np.array([r[2]["p"] for r in rows]))
    cells = []
    for (lat, lon, st, series), qv in zip(rows, q):
        cells.append([
            round(lat, 3), round(lon, 3),
            round(st["slope"], 5), round(st["lo"], 5), round(st["hi"], 5),
            float(f"{st['p']:.3g}"), float(f"{qv:.3g}"),
            [round(float(v), 3) for v in series],
        ])
    n_raw = int(sum(1 for r in rows if r[2]["p"] < ALPHA))
    n_fdr = int((q < ALPHA).sum())
    meta = {
        "id": cfg["id"],
        "parameter": var_key,
        "label": cfg["label"],
        "unit": cfg["unit"],
        "palette": cfg["palette"],
        "start": int(years[0]),
        "end": int(years[-1]),
        "resolution_deg": res,
        "source": source,
        "synthetic": bool(synthetic),
        "alpha": ALPHA,
        "n_cells": len(cells),
        "n_sig_uncorrected": n_raw,
        "n_sig_fdr": n_fdr,
        "method": "Theil-Sen slope; Mann-Kendall with trend-free pre-whitening; "
                  "Benjamini-Hochberg FDR across all cells",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "si_note": "Analysis code written with LLM assistance (Claude) and reviewed by the team.",
    }
    doc = {
        "meta": meta,
        "years": [int(y) for y in years],
        "columns": ["lat", "lon", "slope_per_decade", "ci_low", "ci_high", "p", "q_fdr", "annual_series"],
        "cells": cells,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
    return meta


def write_manifest(metas, path):
    items = [{"id": m["id"], "label": m["label"], "file": f"{m['id']}.json"} for m in metas]
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"variables": items}, fh, indent=2, ensure_ascii=False)
