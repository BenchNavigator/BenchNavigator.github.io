# BenchNavigator

A discovery interface for comparing LLM benchmarks — the prototype from
*"BenchNavigator: A Discovery Interface for Comparing LLM Benchmarks"* (Sokol et al.).

It organizes heterogeneous benchmark metadata (Hugging Face + arXiv) into one
comparable, provenance-preserving view, and now ships with an **Insights
dashboard** of meaningful visualizations plus **saved CSV tables**.

## Live site

The app is hosted on GitHub Pages — no install required:

- **https://benchnavigator.github.io/** — Explore: searchable, filterable table, with
  expandable **documentation cards** and **side-by-side comparison**
- **https://benchnavigator.github.io/dashboard.html** — Insights: visualizations +
  data-quality audit

## Run it locally

The app loads data with `fetch`, so it must be served over HTTP (opening the files
directly via `file://` will not load data). Any static server works:

```bash
python3 -m http.server 8765    # then open http://localhost:8765/index.html
```

The committed `*.jsonl`, `stats.json`, `data_quality.json`, and `tables/` are all the
app needs at runtime. The data-build scripts (`build_cards.py`, `data_quality_agent.py`,
`build_stats.py`) and their large source corpus are kept **outside this repository** to
keep the hosted platform lean; they are only needed to regenerate the data, not to run
the site.

## Security & privacy

- **No secrets, no API keys.** This is a fully static site. There are no credentials,
  tokens, or API keys anywhere in the repository, and the app makes no authenticated
  calls. The repo was scanned for common key patterns (OpenAI, Hugging Face, AWS,
  Google, GitHub tokens) — none present.
- **No backend.** Everything runs client-side in the browser. The page fetches its own
  static data files (`*.jsonl`, `stats.json`, `data_quality.json`, `tables/`), the Font
  Awesome stylesheet from a public CDN, and Google Analytics.
- **Analytics.** The site uses **Google Analytics 4 (GA4)** to count visits, configured
  in anonymized mode (`anonymize_ip`, Google Signals and ad-personalization disabled).
  GA4 sets cookies and sends visit data to Google. Visitors who enable Do-Not-Track or a
  content blocker are simply not counted. To disable analytics, remove the two GA
  `<script>` tags from `index.html` / `dashboard.html` and delete `analytics.js`.
- **Public data only.** All published metadata derives from public sources
  (Hugging Face + arXiv). Do not commit private datasets, credentials, or `.env` files —
  the `.gitignore` already excludes source corpora, build artifacts, and editor/tooling
  files.
- **Reporting issues.** If you spot a security or data concern, open an issue on the repo.

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
  Intended Audience, and source/provenance links. Fields the source doesn't document
  are shown as *"Not documented in source"* rather than guessed.
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
| `tables/` | One CSV per table (precomputed analytics the dashboard reads) |
| `stats.json`, `data_quality.json` | Consolidated payloads the dashboard reads |
| `benchmark_cards.jsonl` | BenchmarkCards the Explore page loads |
| `benchmark_cards_cleaned.jsonl` | Audited BenchmarkCards with per-card quality flags |

> The data-build scripts (`build_cards.py`, `data_quality_agent.py`, `build_stats.py`)
> and the raw source corpus are kept outside this repository — see **Regenerating**.

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
