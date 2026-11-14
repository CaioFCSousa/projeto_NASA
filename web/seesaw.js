/*
 * SEESAW - core logic (no DOM): significance, detrending, seesaw search, Case File text.
 * Works in the browser and in Node (for tests).
 *
 * SI acknowledgement: written with the assistance of a large language model
 * (Claude, by Anthropic) and reviewed by the team.
 */
(function (root) {
  "use strict";

  var ALPHA = 0.05;
  var MIN_DISTANCE_DEG = 5;   // a partner must be at least this far from region A
  var MIN_SEPARATION_DEG = 6; // partners listed must be this far from each other

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // Turns a raw row [lat, lon, slope, lo, hi, p, q, series] into a cell object.
  function makeCell(row, years, index) {
    var series = row[7];
    var slopeYear = row[2] / 10;
    var intercept = median(series.map(function (v, k) { return v - slopeYear * years[k]; }));
    var detr = series.map(function (v, k) { return v - (intercept + slopeYear * years[k]); });
    var mean = detr.reduce(function (s, v) { return s + v; }, 0) / detr.length;
    var sd = Math.sqrt(detr.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (detr.length - 1));
    return {
      index: index, lat: row[0], lon: row[1],
      slope: row[2], lo: row[3], hi: row[4], p: row[5], q: row[6],
      series: series, intercept: intercept, detr: detr, sd: sd,
      beta: sd > 0 ? row[2] / sd : 0 // trend per decade in units of year-to-year spread
    };
  }

  function isSignificant(cell, useFdr) {
    return (useFdr ? cell.q : cell.p) < ALPHA;
  }

  function badge(cell) {
    if (cell.q < ALPHA) return "Significant";
    if (cell.p < ALPHA) return "Suggestive";
    return "Not significant";
  }

  function correlation(a, b) {
    var n = a.length, ma = 0, mb = 0, i;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var sab = 0, saa = 0, sbb = 0;
    for (i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) * (a[i] - ma);
      sbb += (b[i] - mb) * (b[i] - mb);
    }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }

  function distance(a, b) {
    return Math.sqrt((a.lat - b.lat) * (a.lat - b.lat) + (a.lon - b.lon) * (a.lon - b.lon));
  }

  /*
   * Seesaw search. For region A, every cell B with a significant trend of the
   * opposite sign is scored by
   *     S = sqrt(|beta_A| * |beta_B|) * max(0, -r)
   * where r is the correlation of the detrended series. Opposite trends give the
   * first factor; year-to-year anti-phase (a hint of a shared driver) the second.
   */
  function findSeesaw(a, cells, useFdr, limit) {
    var signA = Math.sign(a.slope);
    if (!signA) return [];
    var cands = [];
    cells.forEach(function (b) {
      if (b.index === a.index) return;
      if (Math.sign(b.slope) !== -signA) return;
      if (!isSignificant(b, useFdr)) return;
      if (distance(a, b) < MIN_DISTANCE_DEG) return;
      var r = correlation(a.detr, b.detr);
      var score = Math.sqrt(Math.abs(a.beta * b.beta)) * Math.max(0, -r);
      if (score > 0) cands.push({ cell: b, r: r, score: score });
    });
    cands.sort(function (x, y) { return y.score - x.score; });
    var picked = [];
    for (var i = 0; i < cands.length && picked.length < (limit || 3); i++) {
      var ok = picked.every(function (p) { return distance(p.cell, cands[i].cell) >= MIN_SEPARATION_DEG; });
      if (ok) picked.push(cands[i]);
    }
    return picked;
  }

  function coupling(r) {
    if (r <= -0.5) return "strong";
    if (r <= -0.3) return "moderate";
    return "weak";
  }

  function fmtCoord(c) {
    return Math.abs(c.lat).toFixed(1) + "°" + (c.lat < 0 ? "S" : "N") + ", " +
           Math.abs(c.lon).toFixed(1) + "°" + (c.lon < 0 ? "W" : "E");
  }

  function fmtNum(v, unit) {
    var d = Math.abs(v) < 0.1 ? 3 : 2;
    return (v > 0 ? "+" : "") + v.toFixed(d) + " " + unit;
  }

  function fmtP(v) {
    return v < 0.001 ? "< 0.001" : "= " + v.toFixed(3);
  }

  function describeTrend(c, meta) {
    var verb = c.slope > 0 ? "rose" : "fell";
    var decades = (meta.end - meta.start) / 10;
    return meta.label + " at " + fmtCoord(c) + " " + verb + " by " +
      fmtNum(Math.abs(c.slope), meta.unit).replace("+", "") + " per decade (95% CI " +
      fmtNum(c.lo, "").trim() + " to " + fmtNum(c.hi, "").trim() + "), about " +
      fmtNum(c.slope * decades, meta.unit) + " over " + meta.start + "-" + meta.end + ". " +
      "Verdict: " + badge(c) + " (p " + fmtP(c.p) + ", FDR-adjusted q " + fmtP(c.q) + ").";
  }

  // Plain-language Case File. `pair` is one result of findSeesaw, or null.
  function caseFile(a, pair, meta) {
    var lines = [];
    lines.push("CASE FILE - " + meta.label + ", " + meta.start + "-" + meta.end);
    lines.push("");
    lines.push("WHAT IS CHANGING: " + meta.label + " (" + meta.unit + "), annual mean.");
    lines.push("WHERE (A): " + describeTrend(a, meta));
    if (pair) {
      var b = pair.cell;
      lines.push("WHERE (B): " + describeTrend(b, meta));
      lines.push("SAME PROCESS? Once the trends are removed, the two regions move in opposite " +
        "directions from year to year (r = " + pair.r.toFixed(2) + ", " + coupling(pair.r) +
        " coupling; seesaw score " + pair.score.toFixed(2) + "). This is statistical evidence " +
        "of a possible shared driver, not proof of cause.");
    } else {
      lines.push("SEESAW: no partner selected.");
    }
    lines.push("");
    lines.push("Method: " + meta.method + ". Data: " + meta.source + ".");
    if (meta.synthetic) lines.push("WARNING: synthetic sample data, not real observations.");
    return lines.join("\n");
  }

  var api = {
    ALPHA: ALPHA, makeCell: makeCell, isSignificant: isSignificant, badge: badge,
    correlation: correlation, findSeesaw: findSeesaw, coupling: coupling,
    fmtCoord: fmtCoord, fmtNum: fmtNum, fmtP: fmtP, describeTrend: describeTrend, caseFile: caseFile
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Seesaw = api;
})(typeof window !== "undefined" ? window : this);
