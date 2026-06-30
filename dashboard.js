// dashboard.js — loads stats.json and renders the Insights dashboard.
// Charts come from charts.js (global BNCharts); theme reuses ui.js helpers.
import { initTheme, toggleTheme } from "./ui.js";

const $ = (id) => document.getElementById(id);

function statCard(num, label, sub) {
  return `<div class="stat-card">
    <div class="num">${num}</div>
    <div class="lbl">${label}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;
}

function pct(n, total) {
  return total ? Math.round((1000 * n) / total) / 10 : 0;
}

function noData(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="chart-empty">${message}</div>`;
}

function render(stats) {
  const C = window.BNCharts;
  const b = stats.benchmarks;
  const g = stats.growth;
  const a = stats.artifacts;
  const s = stats.survey;

  // ---- summary + stat cards ----
  const withPaper = (b.availability.find((r) => r[0] === "has_paper") || [, 0])[1];
  const sourceLinked = (b.oss.find((r) => r[0] === "Source link available") || [, 0])[1];
  const sourceName = b.source || "benchmark_cards.jsonl";
  const keyFields = b.key_fields || ["overview", "languages", "size", "modality"];
  const summaryParts = [
    `${b.total.toLocaleString()} BenchmarkCards`,
    `${b.distinct_tasks.toLocaleString()} tasks`,
    `${b.distinct_languages.toLocaleString()} documented languages`,
  ];
  if (b.distinct_licenses > 0) summaryParts.push(`${b.distinct_licenses.toLocaleString()} licenses`);
  $("datasetSummary").textContent =
    `${summaryParts.join(" · ")} · source: ${sourceName}`;
  $("landscapeTitle").textContent = `BenchmarkCard landscape (${b.total.toLocaleString()} cards)`;
  $("dqTitle").textContent = `Data-quality audit (${b.total.toLocaleString()} cards)`;
  $("completenessSub").textContent = `How many of 4 key fields (${keyFields.join(", ")}) each BenchmarkCard reports.`;

  const allFour = (b.completeness.find((r) => r[0] === "4") || [, 0])[1];
  $("statCards").innerHTML = [
    statCard(b.total.toLocaleString(), "BenchmarkCards", `loaded from ${sourceName}`),
    statCard(b.distinct_tasks.toLocaleString(), "Tasks", "multi-label card taxonomy"),
    statCard(b.distinct_languages.toLocaleString(), "Languages", "documented language fields"),
    statCard(pct(allFour, b.total) + "%", "Fully documented", "all 4 key fields present"),
    statCard(pct(sourceLinked, b.total) + "%", "Source-linked", "paper, GitHub, HF, or homepage"),
    statCard(pct(withPaper, b.total) + "%", "Linked to a paper", "provenance preserved"),
    statCard(a.total ? a.total.toLocaleString() : "N/A", "Artifact scrape", a.total ? "papers analysed" : "not loaded"),
  ].join("");

  // ---- ecosystem ----
  const growthSeries = g.series.map((r) => [r[0], r[2]]); // month, cumulative
  if (growthSeries.length) {
    C.area($("chart-growth"), growthSeries, { width: 880, height: 280, xTicks: 8 });
  } else {
    noData($("chart-growth"), "No arXiv growth file found. Add arxiv_data/arxiv_benchmarks.jsonl and rerun build_stats.py.");
    $("growthFoot").textContent = "The Explore and summary counts still come from benchmark_cards.jsonl.";
  }

  // cross-filtering helper
  const jumpTo = (facet, val) => {
    window.location.href = `index.html?${facet}=${encodeURIComponent(val)}`;
  };

  C.donut($("chart-modality"), b.modality, { size: 200, centerLabel: b.total.toLocaleString(), centerSub: "datasets", onClick: (v) => jumpTo("modality", v) });
  C.legend($("legend-modality"), b.modality);

  C.hbar($("chart-tasks"), b.tasks.slice(0, 12).map((r) => [r[0], r[1], r[2]]), { labelW: 180, color: "var(--c2)", onClick: (v) => jumpTo("task", v) });
  C.hbar($("chart-language"), b.language.slice(0, 12).map((r) => [r[0], r[1], r[2]]), { labelW: 90, color: "var(--c1)", onClick: (v) => jumpTo("language", v) });
  C.hbar($("chart-link-types"),
    b.availability.map((r) => [r[0].replace(/^has_/, '').replace('huggingface', 'HF'), r[1], r[2]]),
    { labelW: 110, color: "var(--c4)" });
  C.vbar($("chart-size"), b.size.map((r) => [r[0].replace(/n/g, "n"), r[1]]), { width: 660, height: 250, color: "var(--c6)", onClick: (v) => jumpTo("size", v) });

  C.donut($("chart-oss"), b.oss, { size: 180, centerLabel: pct(sourceLinked, b.total) + "%", centerSub: "linked" });
  C.legend($("legend-oss"), b.oss);

  // ---- the gap ----
  const complLabels = { "0": "0 of 4", "1": "1 of 4", "2": "2 of 4", "3": "3 of 4", "4": "All 4 fields" };
  C.hbar($("chart-completeness"),
    b.completeness.map((r) => [complLabels[r[0]] || r[0], r[1], pct(r[1], b.total)]),
    { labelW: 110, colorByIndex: true });
  $("completenessFoot").textContent =
    `${pct(allFour, b.total)}% of cards report all four key fields; missing fields stay visible instead of being inferred.`;
  C.hbar($("chart-missing"), b.missing_fields.map((r) => [r[0], r[1], r[2]]), { labelW: 150, color: "var(--c3)" });

  if (a.total && a.status.length) {
    $("artifactAvailabilitySub").textContent = `Of ${a.total.toLocaleString()} benchmark papers in the artifact-link scrape: is code/data linked?`;
    $("artifactAvailabilityFoot").textContent = "Availability is not binary: some papers only promise a future release.";
    C.donut($("chart-availability"), a.status, { size: 200, centerLabel: a.total.toLocaleString(), centerSub: "papers" });
    C.legend($("legend-availability"), a.status);
  } else {
    noData($("chart-availability"), "No artifact-link scrape found. Add arxiv_data_2025/benchmark_own_links.jsonl and rerun build_stats.py.");
    $("legend-availability").innerHTML = "";
    $("artifactAvailabilityFoot").textContent = "";
  }
  if (a.total && a.hosts.length) {
    C.hbar($("chart-hosting"), a.hosts.map((r) => [r[0], r[1], r[2]]), { labelW: 150, color: "var(--c1)" });
    $("artifactHostingFoot").textContent = "Papers may appear under several hosting platforms.";
  } else {
    noData($("chart-hosting"), "No hosting-platform data found.");
    $("artifactHostingFoot").textContent = "";
  }

  // ---- data quality (optional; from data_quality.json) ----
  const dq = window.__BN_DQ__;
  if (dq) {
    if (dq.total !== b.total) {
      noData($("chart-dq-issues"), `Data-quality file covers ${dq.total.toLocaleString()} cards, but the app is using ${b.total.toLocaleString()} BenchmarkCards. Rerun data_quality_agent.py.`);
      noData($("chart-dq-scores"), "Data-quality audit needs regeneration.");
      $("dqCards").innerHTML = [
        statCard("Mismatch", "Audit data", "rerun data_quality_agent.py"),
      ].join("");
    } else {
      const review = dq.review_status || {};
      const approved = review.approved || dq.clean_records || 0;
      const needsReview = review.needs_review || 0;
      const incomplete = review.incomplete || 0;
      $("dqCards").innerHTML = [
        statCard(pct(approved, dq.total) + "%", "Approved", "no open documentation flags"),
        statCard(needsReview.toLocaleString(), "Needs review", "usable but has gaps"),
        statCard(incomplete.toLocaleString(), "Incomplete", "missing core evidence"),
        statCard(dq.mean_score + "/100", "Mean approval score", "penalty-weighted"),
        statCard(dq.records_with_flags.toLocaleString(), "Cards flagged", "≥1 documentation gap"),
      ].join("");

      const issueRows = dq.issues
        .filter((i) => i.count > 0)
        .map((i) => [i.description, i.count, i.pct]);
      C.hbar($("chart-dq-issues"), issueRows, { labelW: 240, color: "var(--c3)" });

      C.vbar($("chart-dq-scores"), dq.score_histogram.map((r) => [r[0], r[1]]),
        { width: 640, height: 240, color: "var(--c1)" });
      $("dq-foot").textContent =
        `${pct(approved, dq.total)}% of cards are approved for use; ` +
        `${needsReview.toLocaleString()} need review and ${incomplete.toLocaleString()} are incomplete.`;
    }
  } else {
    $("dqCards").innerHTML = [statCard("N/A", "Audit data", "run data_quality_agent.py")].join("");
    noData($("chart-dq-issues"), "No data_quality.json file found.");
    noData($("chart-dq-scores"), "Run data_quality_agent.py, then rebuild stats.");
  }

  // ---- survey ----
  C.hbar($("chart-scientific"), s.scientific.map((r) => [r[0], r[1], r[2]]), { labelW: 170, color: "var(--c4)" });
  C.hbar($("chart-coverage"), s.coverage.map((r) => [r[0], r[1], r[2]]), { labelW: 170, color: "var(--c2)" });
  C.hbar($("chart-sources"), s.sources.map((r) => [r[0], r[1], r[2]]), { labelW: 200, color: "var(--c1)" });
  // mean-rating charts: show the value (1-5) as the bar
  C.hbar($("chart-features"), s.features.map((r) => [r[0], r[1]]), { labelW: 230, color: "var(--c6)" });
  C.hbar($("chart-constraints"), s.constraints.map((r) => [r[0], r[1]]), { labelW: 200, color: "var(--c5)" });
  C.hbar($("chart-trust"), s.trust.map((r) => [r[0], r[1]]), { labelW: 220, color: "var(--c9)" });
}

async function main() {
  initTheme();
  $("themeToggle")?.addEventListener("click", () => {
    toggleTheme();
    // re-render so SVG text/grid pick up the new theme colors cleanly
    if (window.__BN_STATS__) render(window.__BN_STATS__);
  });

  $("downloadStats")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(window.__BN_STATS__ || {}, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "stats.json"; a.click();
    URL.revokeObjectURL(url);
  });

  // optional data-quality payload (don't fail the dashboard if it's absent)
  try {
    const dqRes = await fetch("data_quality.json", { cache: "no-cache" });
    if (dqRes.ok) window.__BN_DQ__ = await dqRes.json();
  } catch (e) { /* agent not run yet — section just stays empty */ }

  try {
    const res = await fetch("stats.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const stats = await res.json();
    window.__BN_STATS__ = stats;
    render(stats);
  } catch (err) {
    console.error("Failed to load stats.json", err);
    $("loadError").hidden = false;
    $("datasetSummary").textContent = "stats.json not found — run build_stats.py";
  }
}

main();
