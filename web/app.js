/*
 * SEESAW - user interface: map, selection, chart and Case File.
 *
 * SI acknowledgement: written with the assistance of a large language model
 * (Claude, by Anthropic) and reviewed by the team.
 */
(function () {
  "use strict";
  var S = window.Seesaw;

  // Diverging scales for a dark map: values near zero fade into the background,
  // strong trends are bright. Both pairs stay distinguishable with colour-blindness.
  var PALETTES = {
    temp:   { neg: [86, 168, 232], mid: [58, 48, 40], pos: [240, 96, 72] },
    precip: { neg: [226, 140, 62], mid: [58, 48, 40], pos: [62, 190, 200] }
  };
  var CREAM = "#ecdcc0", ORANGE = "#e08a3c", MUTED = "#a8967a", GRID = "rgba(236,220,192,.08)";

  var state = { data: null, cells: [], shapes: [], a: null, pairs: [], pair: null, scaleMax: 1, useFdr: true, hover: null };
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var map = L.map("map", { preferCanvas: true, zoomSnap: 0.5, minZoom: 3, maxZoom: 8 }).setView([-14, -54], 4);
  // Base map: OpenStreetMap tiles, darkened with a CSS filter (no API key needed).
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    className: "osm-dark", attribution: "&copy; OpenStreetMap contributors · borders: Natural Earth"
  }).addTo(map);
  // Country borders are bundled with the site and drawn above the data,
  // so the map stays readable even if the tile server is unreachable.
  map.createPane("borders");
  map.getPane("borders").style.zIndex = 450;
  map.getPane("borders").style.pointerEvents = "none";
  fetch("assets/borders.json").then(function (r) { return r.json(); }).then(function (geo) {
    L.geoJSON(geo, { pane: "borders", renderer: L.svg({ pane: "borders" }), interactive: false,
      style: { color: "#ecdcc0", weight: 1.1, opacity: 0.75, fill: false } }).addTo(map);
  }).catch(function () {});

  var grid = L.layerGroup().addTo(map);
  var marks = L.layerGroup().addTo(map);
  var svgRenderer = L.svg();
  var chart = null;

  Chart.defaults.color = MUTED;
  Chart.defaults.borderColor = GRID;
  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  function mix(c1, c2, t) {
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(c1[k] + (c2[k] - c1[k]) * t); }).join(",") + ")";
  }
  function palette() { return PALETTES[state.data.meta.palette] || PALETTES.temp; }
  function colour(slope) {
    var pal = palette();
    var t = Math.max(-1, Math.min(1, slope / state.scaleMax));
    var e = Math.pow(Math.abs(t), 0.7); // lift mid-range values so they stay visible
    return t >= 0 ? mix(pal.mid, pal.pos, e) : mix(pal.mid, pal.neg, e);
  }

  function badgeHtml(cell) {
    var b = S.badge(cell);
    var cls = b === "Significant" ? "sig" : b === "Suggestive" ? "sug" : "not";
    return '<span class="badge ' + cls + '">' + b + "</span>";
  }

  // Diamonds: significant cells are full size, the others are small. Size, not
  // transparency, carries significance, and the gaps let the base map show through.
  function diamond(c, k) {
    var h = (state.data.meta.resolution_deg / 2) * k;
    return [[c.lat + h, c.lon], [c.lat, c.lon + h], [c.lat - h, c.lon], [c.lat, c.lon - h]];
  }
  function sizeFor(c) { return S.isSignificant(c, state.useFdr) ? 0.96 : 0.38; }
  function styleFor(c) {
    var sig = S.isSignificant(c, state.useFdr);
    return { stroke: false, fillColor: colour(c.slope), fillOpacity: sig ? 0.95 : 0.55 };
  }

  function drawGrid() {
    grid.clearLayers();
    state.shapes = [];
    state.cells.forEach(function (c) {
      var p = L.polygon(diamond(c, sizeFor(c)), styleFor(c));
      p.on("click", function () { selectA(c, true); });
      p.on("mouseover", function () { p.setStyle({ stroke: true, color: CREAM, weight: 1.5 }); p.bringToFront(); });
      p.on("mouseout", function () { p.setStyle({ stroke: false }); });
      p.bindTooltip(function () {
        return "<strong>" + S.fmtCoord(c) + "</strong><br>" + S.fmtNum(c.slope, state.data.meta.unit) + " per decade<br>" + S.badge(c);
      }, { sticky: true, direction: "top", offset: [0, -6] });
      p.addTo(grid);
      state.shapes.push(p);
    });
  }

  function restyle() {
    state.shapes.forEach(function (p, i) {
      var c = state.cells[i];
      p.setLatLngs(diamond(c, sizeFor(c)));
      p.setStyle(styleFor(c));
    });
  }

  function drawLegend() {
    var m = state.data.meta, pal = palette();
    $("legend-title").textContent = "Trend, " + m.unit + " per decade (" + m.start + "-" + m.end + ")";
    $("legend-bar").style.background = "linear-gradient(90deg, rgb(" + pal.neg + "), rgb(" + pal.mid + "), rgb(" + pal.pos + "))";
    $("legend-min").textContent = "-" + state.scaleMax.toFixed(2);
    $("legend-max").textContent = "+" + state.scaleMax.toFixed(2);
  }

  function countTo(el, target) {
    var from = parseInt(el.textContent, 10);
    if (reduceMotion || isNaN(from)) { el.textContent = target; return; }
    var t0 = null, dur = 600;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function drawSummary() {
    var m = state.data.meta;
    var gone = m.n_sig_uncorrected - m.n_sig_fdr;
    countTo($("n-shown"), state.useFdr ? m.n_sig_fdr : m.n_sig_uncorrected);
    countTo($("n-total"), m.n_cells);
    countTo($("n-gone"), state.useFdr ? gone : 0);
    $("n-shown-label").textContent = state.useFdr ? "significant after FDR" : "flagged, uncorrected";
    $("meter-fdr").style.width = (100 * m.n_sig_fdr / m.n_cells) + "%";
    $("meter-raw").style.width = (state.useFdr ? 0 : 100 * m.n_sig_uncorrected / m.n_cells) + "%";
    $("field-summary").textContent = state.useFdr
      ? "Testing each cell alone flags " + m.n_sig_uncorrected + " trends. The false discovery rate correction keeps " + m.n_sig_fdr + " and removes " + gone + " as likely chance. Switch it off to see them."
      : "Without correction, about 5% of cells with no real trend still pass the test by chance. " + gone + " of these " + m.n_sig_uncorrected + " do not survive the correction.";
  }

  function pin(cell, letter) {
    return L.marker([cell.lat, cell.lon], {
      interactive: false,
      icon: L.divIcon({ className: "", html: '<div class="pin ' + letter.toLowerCase() + '">' + letter + "</div>", iconSize: [28, 28], iconAnchor: [14, 14] })
    });
  }

  function drawMarks() {
    marks.clearLayers();
    if (!state.a) return;
    if (state.pair) {
      L.polyline([[state.a.lat, state.a.lon], [state.pair.cell.lat, state.pair.cell.lon]],
        { color: CREAM, weight: 2.5, interactive: false, renderer: svgRenderer, className: "seesaw-line" }).addTo(marks);
      pin(state.pair.cell, "B").addTo(marks);
    }
    pin(state.a, "A").addTo(marks);
  }

  function mean(arr) { return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length; }
  function anomalies(cell) { var m = mean(cell.series); return cell.series.map(function (v) { return v - m; }); }
  function trendLine(cell) {
    var m = mean(cell.series);
    return state.data.years.map(function (y) { return cell.intercept + (cell.slope / 10) * y - m; });
  }

  function drawChart() {
    var sets = [];
    function add(cell, name, col) {
      sets.push({ label: name + " (" + S.fmtCoord(cell) + ")", data: anomalies(cell), borderColor: col, backgroundColor: col, borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 4, tension: 0.15 });
      sets.push({ label: name + " trend", data: trendLine(cell), borderColor: col, borderWidth: 1.6, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0 });
    }
    if (state.a) add(state.a, "A", CREAM);
    if (state.pair) add(state.pair.cell, "B", ORANGE);
    if (chart) chart.destroy();
    chart = new Chart($("chart"), {
      type: "line",
      data: { labels: state.data.years, datasets: sets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: reduceMotion ? false : { duration: 650, easing: "easeOutCubic" },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 12, boxHeight: 12, filter: function (i) { return i.text.indexOf("trend") < 0; } } },
          tooltip: {
            backgroundColor: "#1e150b", borderColor: "#4a3a28", borderWidth: 1, titleColor: CREAM, bodyColor: CREAM,
            filter: function (i) { return i.dataset.label.indexOf("trend") < 0; },
            callbacks: { label: function (i) { return i.dataset.label.split(" ")[0] + ": " + S.fmtNum(i.parsed.y, state.data.meta.unit); } }
          }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { title: { display: true, text: "Anomaly, " + state.data.meta.unit } }
        }
      }
    });
  }

  function drawSeesaw() {
    var card = $("seesaw-card");
    if (!state.a || !state.pair) { card.hidden = true; $("beam").style.transform = "rotate(0deg)"; return; }
    var unit = state.data.meta.unit, b = state.pair.cell;
    card.hidden = false;
    $("sv-a").textContent = S.fmtNum(state.a.slope, unit) + "/dec";
    $("sv-b").textContent = S.fmtNum(b.slope, unit) + "/dec";
    $("sv-r").textContent = "r = " + state.pair.r.toFixed(2) + " · " + S.coupling(state.pair.r);
    // The falling side goes down. Tilt grows with the strength of the two trends.
    var strength = Math.min(1, Math.sqrt(Math.abs(state.a.beta * b.beta)) / 0.8);
    var angle = (state.a.slope < 0 ? -1 : 1) * (5 + 9 * strength);
    $("beam").style.transform = "rotate(0deg)";
    requestAnimationFrame(function () { requestAnimationFrame(function () { $("beam").style.transform = "rotate(" + angle + "deg)"; }); });
  }

  function typeText(el, text) {
    if (el._timer) clearInterval(el._timer);
    if (reduceMotion) { el.textContent = text; return; }
    var i = 0, step = Math.max(4, Math.ceil(text.length / 60));
    el.textContent = "";
    el._timer = setInterval(function () {
      i += step;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(el._timer);
    }, 16);
  }

  function drawCase() {
    if (!state.a) { $("casefile").textContent = "No case open yet."; $("copy").disabled = true; return; }
    typeText($("casefile"), S.caseFile(state.a, state.pair, state.data.meta));
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
        '<span class="score">score ' + p.score.toFixed(2) + "</span>";
      b.onclick = function () { state.pair = p; refreshSelection(); drawPartners(); frame(); };
      box.appendChild(b);
    });
  }

  function refreshSelection() { drawMarks(); drawChart(); drawSeesaw(); drawCase(); }

  function frame() {
    if (!state.a || !state.pair) return;
    var bounds = L.latLngBounds([[state.a.lat, state.a.lon], [state.pair.cell.lat, state.pair.cell.lon]]).pad(0.5);
    if (reduceMotion) map.fitBounds(bounds, { maxZoom: 5 }); else map.flyToBounds(bounds, { maxZoom: 5, duration: 0.9 });
  }

  function selectA(cell, fromMap) {
    state.a = cell; state.pairs = []; state.pair = null;
    var m = state.data.meta;
    $("hint").classList.add("gone");
    $("a-info").className = "";
    $("a-info").innerHTML = "<strong>" + S.fmtCoord(cell) + "</strong>" + badgeHtml(cell) + "<br>" +
      S.fmtNum(cell.slope, m.unit) + " per decade (95% CI " + S.fmtNum(cell.lo, "").trim() + " to " + S.fmtNum(cell.hi, "").trim() + ")<br>" +
      '<span class="muted small">p ' + S.fmtP(cell.p) + " · FDR-adjusted q " + S.fmtP(cell.q) + "</span>";
    $("find").disabled = false;
    drawPartners();
    refreshSelection();
    if (!fromMap) map.panTo([cell.lat, cell.lon]);
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
      frame();
    }
    refreshSelection();
  }

  // Picks, among the 40 strongest significant cells, the one with the best seesaw.
  function surprise() {
    var top = state.cells.filter(function (c) { return S.isSignificant(c, state.useFdr); })
      .sort(function (x, y) { return Math.abs(y.beta) - Math.abs(x.beta); }).slice(0, 40);
    var best = null, bestScore = 0;
    top.forEach(function (c) {
      var r = S.findSeesaw(c, state.cells, state.useFdr, 1)[0];
      if (r && r.score > bestScore) { bestScore = r.score; best = c; }
    });
    if (!best) {
      $("a-info").className = "muted";
      $("a-info").textContent = "No seesaw found for this variable with the current setting. Try the other variable or switch the FDR correction off.";
      return;
    }
    selectA(best, false);
    findSeesaw();
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
      $("a-info").textContent = "Click any diamond on the map, or let SEESAW pick the strongest case.";
      $("find").disabled = true;
      $("hint").classList.remove("gone");
      drawGrid(); drawLegend(); drawSummary(); drawPartners(); refreshSelection();
    });
  }

  $("fdr").addEventListener("change", function (e) {
    state.useFdr = e.target.checked;
    restyle(); drawSummary();
    if (state.pairs.length || state.pair) { state.pairs = []; state.pair = null; drawPartners(); refreshSelection(); }
  });
  $("find").addEventListener("click", findSeesaw);
  $("surprise").addEventListener("click", surprise);
  $("copy").addEventListener("click", function () {
    navigator.clipboard.writeText(S.caseFile(state.a, state.pair, state.data.meta)).then(function () {
      $("copy").textContent = "Copied";
      setTimeout(function () { $("copy").textContent = "Copy text"; }, 1500);
    });
  });

  fetch("data/manifest.json").then(function (r) { return r.json(); }).then(function (man) {
    var seg = $("variable");
    man.variables.forEach(function (v, i) {
      var b = document.createElement("button");
      b.textContent = v.label; b.setAttribute("role", "tab");
      if (i === 0) b.className = "on";
      b.onclick = function () {
        Array.prototype.forEach.call(seg.children, function (x) { x.className = ""; });
        b.className = "on";
        loadVariable(v.file);
      };
      seg.appendChild(b);
    });
    return loadVariable(man.variables[0].file);
  }).catch(function (err) {
    $("field-summary").textContent = "Could not load data/manifest.json. Run the pipeline first. (" + err + ")";
  });

  window.__seesaw = { state: state, selectA: selectA, findSeesaw: findSeesaw, surprise: surprise };
})();
