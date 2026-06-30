/* charts.js — tiny dependency-free SVG charts for BenchNavigator.
 *
 * No external libraries: everything is hand-rolled SVG so the dashboard works
 * fully offline and matches the app's broadsheet aesthetic. Colours come from
 * CSS variables (see styles.css) so light/dark themes are respected.
 *
 * Exposes a global `BNCharts` with: hbar, vbar, area, donut, legend.
 * Each renderer takes a container element and a data array.
 */
(function (global) {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const PALETTE = [
    "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)",
    "var(--c6)", "var(--c7)", "var(--c8)", "var(--c9)", "var(--c10)",
  ];

  function el(name, attrs, text) {
    const node = document.createElementNS(SVGNS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  let tt;
  function getTooltip() {
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'bn-tooltip';
      tt.style.position = 'absolute';
      tt.style.background = 'var(--bg-card)';
      tt.style.color = 'var(--text-main)';
      tt.style.border = '1px solid var(--border)';
      tt.style.padding = '6px 10px';
      tt.style.borderRadius = '6px';
      tt.style.pointerEvents = 'none';
      tt.style.opacity = '0';
      tt.style.transition = 'opacity 0.15s ease';
      tt.style.zIndex = '9999';
      tt.style.fontSize = '13px';
      tt.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      tt.style.whiteSpace = 'nowrap';
      document.body.appendChild(tt);
    }
    return tt;
  }

  function setupInteraction(node, html, onClick, dataValue) {
    node.addEventListener('mouseenter', (e) => {
      const tip = getTooltip();
      tip.innerHTML = html;
      tip.style.opacity = '1';
      node.style.opacity = '0.8';
    });
    node.addEventListener('mousemove', (e) => {
      const tip = getTooltip();
      tip.style.left = (e.pageX + 12) + 'px';
      tip.style.top = (e.pageY + 12) + 'px';
    });
    node.addEventListener('mouseleave', () => {
      getTooltip().style.opacity = '0';
      node.style.opacity = '1';
    });
    if (onClick) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => onClick(dataValue));
    }
  }

  function svgRoot(w, h) {
    const s = el("svg", {
      viewBox: `0 0 ${w} ${h}`,
      width: "100%",
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      class: "bn-chart",
    });
    s.style.maxHeight = h + "px";
    return s;
  }

  function fmt(n) {
    if (typeof n !== "number") return n;
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toString();
  }

  /* ----- horizontal bars: data = [[label, value, pct?], ...] ----------- */
  function hbar(container, data, opts) {
    opts = opts || {};
    clear(container);
    const rowH = opts.rowH || 26;
    const gap = 8;
    const labelW = opts.labelW || 150;
    const valueW = 58;
    const w = opts.width || 640;
    const pad = { t: 8, r: 12, b: 8, l: 12 };
    const h = pad.t + pad.b + data.length * (rowH + gap);
    const barArea = w - pad.l - labelW - valueW - pad.r;
    const max = Math.max(1, ...data.map((d) => d[1]));
    const svg = svgRoot(w, h);
    const color = opts.color || PALETTE[0];

    data.forEach((d, i) => {
      const y = pad.t + i * (rowH + gap);
      const bw = Math.max(2, (d[1] / max) * barArea);
      const x0 = pad.l + labelW;

      svg.appendChild(el("text", {
        x: pad.l, y: y + rowH / 2, "dominant-baseline": "middle",
        class: "bn-axis-label", "text-anchor": "start",
      }, d[0]));

      const rect = el("rect", {
        x: x0, y, width: bw, height: rowH, rx: 2,
        fill: opts.colorByIndex ? PALETTE[i % PALETTE.length] : color,
        class: "bn-bar",
        style: "transition: opacity 0.2s ease;"
      });
      const tipHtml = `<strong>${d[0]}</strong>: ${fmt(d[1])}` + (d[2] != null ? ` (${d[2]}%)` : "");
      setupInteraction(rect, tipHtml, opts.onClick, d[0]);
      svg.appendChild(rect);

      const label = d[2] != null ? `${fmt(d[1])}` : fmt(d[1]);
      svg.appendChild(el("text", {
        x: x0 + bw + 6, y: y + rowH / 2, "dominant-baseline": "middle",
        class: "bn-value-label", "text-anchor": "start",
      }, d[2] != null ? `${fmt(d[1])} · ${d[2]}%` : label));
    });

    container.appendChild(svg);
  }

  /* ----- vertical bars: data = [[label, value], ...] ------------------- */
  function vbar(container, data, opts) {
    opts = opts || {};
    clear(container);
    const w = opts.width || 640;
    const h = opts.height || 240;
    const pad = { t: 14, r: 12, b: 46, l: 40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const max = Math.max(1, ...data.map((d) => d[1]));
    const bw = plotW / data.length;
    const svg = svgRoot(w, h);

    // y gridlines
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const yv = (max / ticks) * t;
      const y = pad.t + plotH - (yv / max) * plotH;
      svg.appendChild(el("line", {
        x1: pad.l, y1: y, x2: pad.l + plotW, y2: y, class: "bn-grid",
      }));
      svg.appendChild(el("text", {
        x: pad.l - 6, y: y + 3, "text-anchor": "end", class: "bn-tick",
      }, fmt(Math.round(yv))));
    }

    data.forEach((d, i) => {
      const bh = Math.max(1, (d[1] / max) * plotH);
      const x = pad.l + i * bw + bw * 0.15;
      const y = pad.t + plotH - bh;
      const rect = el("rect", {
        x, y, width: bw * 0.7, height: bh, rx: 2,
        fill: opts.colorByIndex ? PALETTE[i % PALETTE.length] : (opts.color || PALETTE[1]),
        class: "bn-bar",
        style: "transition: opacity 0.2s ease;"
      });
      setupInteraction(rect, `<strong>${d[0]}</strong>: ${fmt(d[1])}`, opts.onClick, d[0]);
      svg.appendChild(rect);
      svg.appendChild(el("text", {
        x: pad.l + i * bw + bw / 2, y: h - pad.b + 16,
        "text-anchor": "middle", class: "bn-tick",
      }, d[0]));
    });

    container.appendChild(svg);
  }

  /* ----- area/line time series: series = [[xLabel, value], ...] -------- */
  function area(container, series, opts) {
    opts = opts || {};
    clear(container);
    const w = opts.width || 680;
    const h = opts.height || 260;
    const pad = { t: 16, r: 16, b: 34, l: 48 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const ys = series.map((d) => d[1]);
    const max = Math.max(1, ...ys);
    const n = series.length;
    const xOf = (i) => pad.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yOf = (v) => pad.t + plotH - (v / max) * plotH;
    const svg = svgRoot(w, h);

    // gridlines + y ticks
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const yv = (max / ticks) * t;
      const y = yOf(yv);
      svg.appendChild(el("line", { x1: pad.l, y1: y, x2: pad.l + plotW, y2: y, class: "bn-grid" }));
      svg.appendChild(el("text", { x: pad.l - 8, y: y + 3, "text-anchor": "end", class: "bn-tick" },
        fmt(Math.round(yv))));
    }

    const line = series.map((d, i) => `${xOf(i)},${yOf(d[1])}`).join(" ");
    const areaPts = `${pad.l},${yOf(0)} ${line} ${xOf(n - 1)},${yOf(0)}`;
    svg.appendChild(el("polygon", { points: areaPts, class: "bn-area", fill: opts.color || PALETTE[0] }));
    svg.appendChild(el("polyline", { points: line, class: "bn-line", stroke: opts.color || PALETTE[0] }));

    // x labels (sparse)
    const step = Math.max(1, Math.ceil(n / (opts.xTicks || 7)));
    series.forEach((d, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      svg.appendChild(el("text", {
        x: xOf(i), y: h - pad.b + 18, "text-anchor": "middle", class: "bn-tick",
      }, d[0]));
    });

    // hover dots
    series.forEach((d, i) => {
      const c = el("circle", { cx: xOf(i), cy: yOf(d[1]), r: 7, fill: "transparent", class: "bn-hot" });
      setupInteraction(c, `<strong>${d[0]}</strong>: ${fmt(d[1])}`, null, null);
      svg.appendChild(c);
    });

    container.appendChild(svg);
  }

  /* ----- donut: data = [[label, value, pct?], ...] --------------------- */
  function donut(container, data, opts) {
    opts = opts || {};
    clear(container);
    const size = opts.size || 200;
    const r = size / 2 - 6;
    const inner = r * 0.58;
    const cx = size / 2, cy = size / 2;
    const total = data.reduce((s, d) => s + d[1], 0) || 1;
    const svg = svgRoot(size, size);
    let a0 = -Math.PI / 2;

    data.forEach((d, i) => {
      const frac = d[1] / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi0 = cx + inner * Math.cos(a1), yi0 = cy + inner * Math.sin(a1);
      const xi1 = cx + inner * Math.cos(a0), yi1 = cy + inner * Math.sin(a0);
      const path = el("path", {
        d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} ` +
           `L ${xi0} ${yi0} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`,
        fill: PALETTE[i % PALETTE.length], class: "bn-slice",
        style: "transition: opacity 0.2s ease;"
      });
      const pct = d[2] != null ? d[2] : Math.round(frac * 1000) / 10;
      setupInteraction(path, `<strong>${d[0]}</strong>: ${fmt(d[1])} (${pct}%)`, opts.onClick, d[0]);
      svg.appendChild(path);
      a0 = a1;
    });

    if (opts.centerLabel) {
      svg.appendChild(el("text", { x: cx, y: cy - 4, "text-anchor": "middle", class: "bn-donut-num" }, opts.centerLabel));
      if (opts.centerSub)
        svg.appendChild(el("text", { x: cx, y: cy + 16, "text-anchor": "middle", class: "bn-donut-sub" }, opts.centerSub));
    }
    container.appendChild(svg);
  }

  /* ----- legend for donut/categorical charts --------------------------- */
  function legend(container, data) {
    clear(container);
    const total = data.reduce((s, d) => s + d[1], 0) || 1;
    data.forEach((d, i) => {
      const item = document.createElement("div");
      item.className = "bn-legend-item";
      const sw = document.createElement("span");
      sw.className = "bn-swatch";
      sw.style.background = PALETTE[i % PALETTE.length];
      const txt = document.createElement("span");
      const pct = d[2] != null ? d[2] : Math.round((d[1] / total) * 1000) / 10;
      txt.innerHTML = `${d[0]} <strong>${fmt(d[1])}</strong> <span class="bn-legend-pct">${pct}%</span>`;
      item.appendChild(sw);
      item.appendChild(txt);
      container.appendChild(item);
    });
  }

  global.BNCharts = { hbar, vbar, area, donut, legend, PALETTE };
})(window);
