/*
 * SEESAW - user interface: map, selection, chart and Case File.
 *
 * SI acknowledgement: written with the assistance of a large language model
 * (Claude, by Anthropic) and reviewed by the team.
 */
(function () {
  "use strict";
  var S = window.Seesaw;

  var PALETTES = {
    temp:   { neg: [33, 102, 172],  mid: [247, 247, 247], pos: [178, 24, 43] },
    precip: { neg: [140, 81, 10],   mid: [245, 245, 245], pos: [1, 102, 94] }
  };

  var state = { data: null, cells: [], rects: [], a: null, pairs: [], pair: null, scaleMax: 1, useFdr: true };
  var $ = function (id) { return document.getElementById(id); };

  var map = L.map("map", { preferCanvas: true, zoomSnap: 0.5 }).setView([-14, -54], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 8, attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  var grid = L.layerGroup().addTo(map);
  var marks = L.layerGroup().addTo(map);
  var chart = null;

  function mix(c1, c2, t) {
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(c1[k] + (c2[k] - c1[k]) * t); }).join(",") + ")";
  }

  function colour(slope) {
    var pal = PALETTES[state.data.meta.palette] || PALETTES.temp;
    var t = Math.max(-1, Math.min(1, slope / state.scaleMax));
    return t >= 0 ? mix(pal.mid, pal.pos, t) : mix(pal.mid, pal.neg, -t);
  }

  function badgeHtml(cell) {
    var b = S.badge(cell);
    var cls = b === "Significant" ? "sig" : b === "Suggestive" ? "sug" : "not";
    return '<span class="badge ' + cls + '">' + b + "</span>";
  }

  function styleFor(cell) {
    var sig = S.isSignificant(cell, state.useFdr);
    return { stroke: false, fillColor: colour(cell.slope), fillOpacity: sig ? 0.85 : 0.15 };
  }

  function drawGrid() {
    grid.clearLayers();
    state.rects = [];
    var h = state.data.meta.resolution_deg / 2;
    state.cells.forEach(function (c) {
      var r = L.rectangle([[c.lat - h, c.lon - h], [c.lat + h, c.lon + h]], styleFor(c));
      r.on("click", function () { selectA(c); });
      r.bindTooltip(function () {
        return S.fmtCoord(c) + "<br>" + S.fmtNum(c.slope, state.data.meta.unit) + " per decade<br>" + S.badge(c);
      }, { sticky: true });
      r.addTo(grid);
      state.rects.push(r);
    });
  }

  function restyle() {
    state.rects.forEach(function (r, i) { r.setStyle(styleFor(state.cells[i])); });
  }

  function drawLegend() {
    var m = state.data.meta, pal = PALETTES[m.palette] || PALETTES.temp;
    $("legend-title").textContent = "Trend, " + m.unit + " per decade (" + m.start + "-" + m.end + ")";
    $("legend-bar").style.background = "linear-gradient(90deg, rgb(" + pal.neg + "), rgb(" + pal.mid + "), rgb(" + pal.pos + "))";
    $("legend-min").textContent = "-" + state.scaleMax.toFixed(2);
    $("legend-max").textContent = "+" + state.scaleMax.toFixed(2);
  }

  function drawSummary() {
    var m = state.data.meta;
    var gone = m.n_sig_uncorrected - m.n_sig_fdr;
    var shown = state.useFdr ? m.n_sig_fdr : m.n_sig_uncorrected;
    $("field-summary").innerHTML =
      "<strong>" + shown + "</strong> of " + m.n_cells + " cells show a significant trend " +
      (state.useFdr ? "after the FDR correction" : "without correction") + ". " +
      "Testing each cell alone flags " + m.n_sig_uncorrected + "; the correction removes <strong>" + gone +
      "</strong> of them as likely false alarms. Switch the correction off to see them.";
  }

  function pin(cell, letter) {
    return L.marker([cell.lat, cell.lon], {
      interactive: false,
      icon: L.divIcon({ className: "", html: '<div class="pin ' + letter.toLowerCase() + '">' + letter + "</div>", iconSize: [26, 26], iconAnchor: [13, 13] })
    });
  }

  function drawMarks() {
    marks.clearLayers();
    if (!state.a) return;
    if (state.pair) {
      L.polyline([[state.a.lat, state.a.lon], [state.pair.cell.lat, state.pair.cell.lon]],
        { color: "#111827", weight: 2, dashArray: "6 6", interactive: false }).addTo(marks);
      pin(state.pair.cell, "B").addTo(marks);
    }
    pin(state.a, "A").addTo(marks);
  }

  function trendLine(cell) {
    var years = state.data.years, mean = cell.series.reduce(function (s, v) { return s + v; }, 0) / cell.series.length;
    return years.map(function (y) { return cell.intercept + (cell.slope / 10) * y - mean; });
  }

  function anomalies(cell) {
    var mean = cell.series.reduce(function (s, v) { return s + v; }, 0) / cell.series.length;
    return cell.series.map(function (v) { return v - mean; });
  }

  function drawChart() {
    var sets = [];
    function add(cell, name, col) {
      sets.push({ label: name + " (" + S.fmtCoord(cell) + ")", data: anomalies(cell), borderColor: col, backgroundColor: col, borderWidth: 1.6, pointRadius: 0, tension: 0 });
      sets.push({ label: name + " trend", data: trendLine(cell), borderColor: col, borderWidth: 1.6, borderDash: [6, 4], pointRadius: 0 });
    }
    if (state.a) add(state.a, "A", "#111827");
    if (state.pair) add(state.pair.cell, "B", "#c2410c");
    if (chart) chart.destroy();
    chart = new Chart($("chart"), {
      type: "line",
      data: { labels: state.data.years, datasets: sets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { boxWidth: 14, filter: function (i) { return i.text.indexOf("trend") < 0; } } } },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { title: { display: true, text: "Anomaly, " + state.data.meta.unit } }
        }
      }
    });
  }

  function drawCase() {
    if (!state.a) { $("casefile").textContent = "No case open yet."; $("copy").disabled = true; return; }
    $("casefile").textContent = S.caseFile(state.a, state.pair, state.data.meta);
    $("copy").disabled = false;
  }

  function drawPartners(message) {
    var box = $("partners");
    box.innerHTML = "";
    if (message) { box.innerHTML = '<p class="muted small">' + message + "</p>"; return; }
    state.pairs.forEach(function (p, i) {
      var b = document.createElement("button");
      b.className = "partner" + (state.pair === p ? " active" : "");
      b.innerHTML = "<span>B" + (i + 1) + " · " + S.fmtCoord(p.cell) + "<br><small>" +
        S.fmtNum(p.cell.slope, state.data.meta.unit) + " per decade · r = " + p.r.toFixed(2) + " (" + S.coupling(p.r) + ")</small></span>" +
        "<span>score " + p.score.toFixed(2) + "</span>";
      b.onclick = function () { state.pair = p; refreshSelection(); drawPartners(); };
      box.appendChild(b);
    });
  }

  function refreshSelection() { drawMarks(); drawChart(); drawCase(); }

  function selectA(cell) {
    state.a = cell; state.pairs = []; state.pair = null;
    var m = state.data.meta;
    $("a-info").className = "";
    $("a-info").innerHTML = "<strong>" + S.fmtCoord(cell) + "</strong> " + badgeHtml(cell) + "<br>" +
      S.fmtNum(cell.slope, m.unit) + " per decade (95% CI " + S.fmtNum(cell.lo, "").trim() + " to " + S.fmtNum(cell.hi, "").trim() + ")<br>" +
      '<span class="muted small">p ' + S.fmtP(cell.p) + " · FDR-adjusted q " + S.fmtP(cell.q) + "</span>";
    $("find").disabled = false;
    drawPartners();
    refreshSelection();
  }

  function findSeesaw() {
    if (!state.a) return;
    state.pairs = S.findSeesaw(state.a, state.cells, state.useFdr, 3);
    state.pair = state.pairs[0] || null;
    if (!state.pairs.length) {
      drawPartners("No region with a significant opposite trend moves in anti-phase with A. " +
        (state.useFdr ? "Try switching the FDR correction off (results will be only suggestive), or pick another cell." : "Pick another cell."));
    } else {
      drawPartners();
      map.fitBounds(L.latLngBounds([[state.a.lat, state.a.lon], [state.pair.cell.lat, state.pair.cell.lon]]).pad(0.6), { maxZoom: 5 });
    }
    refreshSelection();
  }

  function loadVariable(file) {
    return fetch("data/" + file).then(function (r) { return r.json(); }).then(function (data) {
      state.data = data;
      state.cells = data.cells.map(function (row, i) { return S.makeCell(row, data.years, i); });
      var abs = state.cells.map(function (c) { return Math.abs(c.slope); }).sort(function (x, y) { return x - y; });
      state.scaleMax = abs[Math.floor(abs.length * 0.98)] || 1;
      state.a = null; state.pairs = []; state.pair = null;
      $("sample-banner").hidden = !data.meta.synthetic;
      $("credits").textContent = "Data: " + data.meta.source + " Processed " + data.meta.generated + ".";
      $("a-info").className = "muted";
      $("a-info").textContent = "Click any cell on the map to open its case.";
      $("find").disabled = true;
      drawGrid(); drawLegend(); drawSummary(); drawPartners(); refreshSelection();
    });
  }

  $("fdr").addEventListener("change", function (e) {
    state.useFdr = e.target.checked;
    restyle(); drawSummary();
    if (state.pairs.length || state.pair) { state.pairs = []; state.pair = null; drawPartners(); refreshSelection(); }
  });
  $("find").addEventListener("click", findSeesaw);
  $("copy").addEventListener("click", function () {
    navigator.clipboard.writeText($("casefile").textContent).then(function () {
      $("copy").textContent = "Copied";
      setTimeout(function () { $("copy").textContent = "Copy text"; }, 1500);
    });
  });
  $("variable").addEventListener("change", function (e) { loadVariable(e.target.value); });

  fetch("data/manifest.json").then(function (r) { return r.json(); }).then(function (man) {
    man.variables.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.file; o.textContent = v.label;
      $("variable").appendChild(o);
    });
    return loadVariable(man.variables[0].file);
  }).catch(function (err) {
    $("field-summary").textContent = "Could not load data/manifest.json. Run the pipeline first. (" + err + ")";
  });

  window.__seesaw = { state: state, selectA: selectA, findSeesaw: findSeesaw };
})();
