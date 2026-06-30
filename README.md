# BenchNavigator

A discovery interface for comparing LLM benchmarks — the prototype from
*"BenchNavigator: A Discovery Interface for Comparing LLM Benchmarks"* (Sokol et al.).

It organizes heterogeneous benchmark metadata (Hugging Face + arXiv) into one
comparable, provenance-preserving view, and now ships with an **Insights
dashboard** of meaningful visualizations plus **saved CSV tables**.

## Run it

The app loads data with `fetch`, so it must be served over HTTP (opening the
files directly via `file://` will not load data).

```bash
# 1. build the Explore dataset from the real BenchmarkCards (ALL_CARDS_TRUE/)
#    The folder can be inside this project folder; both Latin C and Cyrillic C names are supported.
#    -> benchmark_cards.jsonl  (the app prefers this)
python build_cards.py

# 2. clean + audit the raw HF dataset (used by the dashboard's audit section)
python data_quality_agent.py

# 3. build the analytics: writes tables/*.csv and stats.json
python build_stats.py

# 4. serve the folder (no-store headers, so edits show up on reload)
python serve.py            # -> http://localhost:8765
#   python serve.py 9000   # custom port
```

Then open:

- **http://localhost:8765/index.html** — Explore: searchable, filterable table, with
  expandable **documentation cards** and **side-by-side comparison**
- **http://localhost:8765/dashboard.html** — Insights: visualizations + data-quality audit

## UI matches the paper figures

- **Figure 3 (filters):** an 8-facet 2×4 grid — Domain · Primary Task · Modality · Size
  Category · Language · Data Type · Annotation Method · AI Risk Atlas Category — with
  **Show Advanced Filters** (sort, audience, search scope) and **Show Extra Columns**
  toggles, and a bottom *Showing N · N selected · Compare Selected* bar.
- **Figure 4 (table):** a dedicated **Compare** checkbox column, clean benchmark names,
  Task/Modality shown in light boxes, yellow AI-Risk tags, and ✓ Paper/GitHub/HF columns.
  Column headers sort the table (click again to reverse; ▲/▼ indicator), kept in sync
  with the Sort dropdown.
- **Figure 5 (card):** Overview · Goal · Data Source · Annotation · AI Risk Atlas
  Categories (nested bullets: category → subcategory) · Intended Audience, with icon
  link chips (Paper / GitHub / 🤗 HuggingFace / Homepage).

Size Category, Data Type, and Annotation Method facets are derived in `build_cards.py`
(`parse_size_category`, `classify_data_type`, `classify_annotation`).

## Filters (paper Figure 3) — cascading, never zero

The Explore page is driven by the real BenchmarkCards, which carry populated
**Domain / Primary Task / AI Risk Atlas / Audience / Modality** facets. Filters are
**dependent**: choosing one narrows the options offered by the others, so a combination
can never dead-end at zero results (e.g. Domain = *Healthcare* leaves only the AI-risk
categories that actually occur in healthcare benchmarks). Facets with no available
values (e.g. License, which the cards don't record) are hidden automatically. Freeform
vocab is normalized and each dropdown shows the most common ~60 values.

## Explore page (paper Figures 4–6)

The results table is the lean 9-column Figure-4 layout (Name · Domain · Primary Task ·
Modality · Languages · AI Risk Atlas · ✓ Paper/GitHub/HF) and renders **100 rows at a
time** with a *Show more* button, so 4,680 benchmarks load instantly without a wide
horizontal scroll. Full details live in the expandable card.

- **Documentation card** — click a benchmark name (or the ▸ caret) to expand a card
  (Figure 5): Overview, Goal, Data Source, Annotation, AI Risk Atlas categories,
  Intended Audience, a metadata strip, source/provenance links, and a data-quality
  block. Fields the source doesn't document are shown as *"Not documented in source"*
  rather than guessed.
- **Compare** — tick the checkbox on any rows, then **Compare Selected (N)** opens a
  comparison modal (Figure 6): attributes down the left, each benchmark as a column.
- **Export** — one-click CSV / JSON / Markdown of the current filtered set.

## Data-quality agent

`data_quality_agent.py` is an automated checker for the 4,680-card BenchmarkCards corpus
(too large to inspect by hand). It is deliberately conservative:

- **Flags, never fabricates** — missing overview, goal, source, language,
  size, risk category, audience, annotation, or provenance links — in keeping with
  the paper's "make gaps visible" stance.
- **Assigns review status** — each card is marked `approved`, `needs_review`, or
  `incomplete`, so the UI can show whether a card is ready to use or needs cleanup.

Outputs: `benchmark_cards_cleaned.jsonl`, `data_quality.json`,
`tables/data_quality_issues.csv`, `tables/data_quality_by_record.csv`, and a console
summary. The Insights dashboard renders this audit (approved %, review counts, and the
issue/score charts).

## What's here

| File | Purpose |
|------|---------|
| `index.html`, `app.js`, `ui.js`, `logic.js` | Explore page (table, filters, search, **cards**, **compare**, **export**) |
| `dashboard.html`, `dashboard.js` | Insights page (charts + data-quality audit) |
| `charts.js` | Dependency-free SVG chart library (bar / area / donut) |
| `styles.css` | Shared broadsheet theme + chart/card/modal styles (light/dark) |
| `build_cards.py` | Flattens the real BenchmarkCards (`ALL_СARDS_TRUE/`) into `benchmark_cards.jsonl` |
| `data_quality_agent.py` | Audits the BenchmarkCards; writes the cleaned JSONL + quality report |
| `build_stats.py` | Computes all distributions; writes `tables/*.csv` + `stats.json` |
| `serve.py` | Static dev server with caching disabled |
| `tables/` | One CSV per table (regenerated by the two scripts) |
| `stats.json`, `data_quality.json` | Consolidated payloads the dashboard reads |
| `benchmark_cards_cleaned.jsonl` | Audited BenchmarkCards with per-card quality flags |
| `paper_figures/` | Figures extracted from the paper (design reference) |

## The Insights dashboard

Every chart maps to a finding in the paper:

- **Cumulative growth** of benchmark/eval papers (arXiv) — paper Figure 1
- **Modality, task, language, source-link, size** distributions across 4,680 BenchmarkCards
- **Documentation completeness** — how many of 4 key fields each benchmark
  reports (the paper's core "metadata gap" finding: only ~46% report all four)
- **Review status** — approved / needs review / incomplete counts generated by the
  data-quality agent
- **Artifact availability & hosting** when optional arXiv scrape files are present
- **Practitioner survey priorities** (N=23) — Appendix C / Tables 1–4

Landscape charts are computed from `benchmark_cards.jsonl`; optional arXiv artifact
charts render when the scrape files are present. Survey charts are transcribed from
the paper's Appendix C.

## Saved tables

`build_stats.py` writes the current CSVs to `tables/`, e.g.
`benchmarks_by_modality.csv`, `documentation_completeness.csv`,
`artifact_link_availability_dataset.csv`, `survey_feature_importance.csv`, … — ready
to drop into a paper, slide, or spreadsheet. Optional arXiv growth/artifact CSVs are
only written when their source scrape files are present.

The Explore page also has **one-click export** (CSV / JSON / Markdown) of the
current filtered result set.

## Regenerating

When the card folder changes, regenerate in order:

```bash
python build_cards.py
python data_quality_agent.py
python build_stats.py
```

`build_stats.py` rewrites `tables/` and `stats.json`; the dashboard picks them up on reload.
