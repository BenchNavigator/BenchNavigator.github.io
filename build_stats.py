#!/usr/bin/env python3
"""
build_stats.py — BenchNavigator analytics builder.

Reads the raw benchmark metadata that powers BenchNavigator and produces:
  1. tables/*.csv  — one CSV per table (the "saved tables", paper-aligned)
  2. stats.json    — a single consolidated payload the dashboard loads

Every figure here maps to a finding in the paper
("BenchNavigator: A Discovery Interface for Comparing LLM Benchmarks").

Run from the project root:
    python build_stats.py
No third-party dependencies required (stdlib only).
"""

import csv
import json
import os
import re
from collections import Counter, OrderedDict

ROOT = os.path.dirname(os.path.abspath(__file__))
TABLES_DIR = os.path.join(ROOT, "tables")

CARDS_CLEANED = os.path.join(ROOT, "benchmark_cards_cleaned.jsonl")
CARDS = os.path.join(ROOT, "benchmark_cards.jsonl")
ARXIV_BENCH = os.path.join(ROOT, "arxiv_data", "arxiv_benchmarks.jsonl")
SCRAPE_META = os.path.join(ROOT, "arxiv_data", "scrape_metadata.json")
LINKS_2025 = os.path.join(ROOT, "arxiv_data_2025", "benchmark_own_links.jsonl")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def read_jsonl(path):
    """Yield parsed objects from a JSONL file, skipping blank/bad lines."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def write_csv(name, header, rows):
    """Write a list of rows to tables/<name>.csv and return the path."""
    os.makedirs(TABLES_DIR, exist_ok=True)
    path = os.path.join(TABLES_DIR, name)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return path


def remove_csv(name):
    """Remove a generated CSV when its optional source data is unavailable."""
    path = os.path.join(TABLES_DIR, name)
    if os.path.exists(path):
        os.remove(path)


def counter_rows(counter, total):
    """[(label, count, pct), ...] sorted by count desc."""
    return [
        [label, count, round(100.0 * count / total, 1) if total else 0.0]
        for label, count in counter.most_common()
    ]


def documented(value):
    """Whether a card field is meaningfully populated."""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip().lower() not in ("", "n/a", "na", "none", "unknown", "not specified", "not documented")
    if isinstance(value, (list, tuple, set, dict)):
        if isinstance(value, dict):
            return len(value) > 0
        return any(documented(v) for v in value)
    return True


def first_documented(*values, default="Not documented"):
    for value in values:
        if isinstance(value, list):
            for item in value:
                if documented(item):
                    return item
        elif documented(value):
            return value
    return default


# --------------------------------------------------------------------------- #
# 1. main BenchmarkCards dataset (4,680 records in the current corpus)
# --------------------------------------------------------------------------- #
def analyze_benchmarks():
    if os.path.exists(CARDS_CLEANED):
        source = "benchmark_cards_cleaned.jsonl"
        records = list(read_jsonl(CARDS_CLEANED))
        if not records and os.path.exists(CARDS):
            source = "benchmark_cards.jsonl"
            records = list(read_jsonl(CARDS))
    elif os.path.exists(CARDS):
        source = "benchmark_cards.jsonl"
        records = list(read_jsonl(CARDS))
    else:
        raise SystemExit("source not found: run build_cards.py to create benchmark_cards.jsonl")
    total = len(records)
    if total == 0:
        raise SystemExit(f"source is empty: {source}")

    modality = Counter()
    language = Counter()
    license_ = Counter()
    size = Counter()
    tasks = Counter()
    missing = Counter()
    oss = Counter()
    instr = Counter()
    libraries = Counter()
    avail = {"has_paper": 0, "has_github": 0, "has_huggingface": 0, "has_homepage": 0}

    # canonical order for size buckets (small -> large)
    size_order = [
        "<1K", "1K–10K", "10K–100K", "100K–1M", ">1M",
        "<1MB", "n<1K", "1K<n<10K", "10K<n<100K", "100K<n<1M",
        "1M<n<10M", "10M<n<100M", "100M<n<1B", "1B<n<10B",
        "10B<n<100B", "100B<n<1T", "n>1T", "Not documented", "unknown",
    ]

    for r in records:
        modality[first_documented(r.get("modality"), default="Not documented")] += 1
        language[first_documented(r.get("primary_language"), r.get("languages"), default="Not documented")] += 1
        license_[first_documented(r.get("license"), default="Not documented")] += 1
        size[first_documented(r.get("size_category"), default="Not documented")] += 1
        task_values = r.get("tasks") or ([r.get("primary_task")] if documented(r.get("primary_task")) else [])
        missing_fields = []
        for field, value in [
            ("overview", r.get("overview")),
            ("languages", r.get("languages")),
            ("size", r.get("size_category") or r.get("size_text")),
            ("modality", r.get("modality")),
        ]:
            if not documented(value):
                missing_fields.append(field)
        oss["Source link available" if any(documented(r.get(k)) for k in ("paper", "github", "huggingface", "homepage")) else "No source link"] += 1
        instr["AI-risk annotated" if documented(r.get("risk_categories")) or documented(r.get("atlas_risks")) else "No AI-risk category"] += 1
        for method in (r.get("methods") or []):
            libraries[method] += 1
        for key, field in [
            ("has_paper", "paper"),
            ("has_github", "github"),
            ("has_huggingface", "huggingface"),
            ("has_homepage", "homepage"),
        ]:
            if documented(r.get(field)):
                avail[key] += 1
        for t in task_values:
            tasks[t] += 1
        for m in missing_fields:
            missing[m] += 1

    # documentation completeness: 4 key fields used by the UI cards.
    key_fields = ["overview", "languages", "size", "modality"]
    completeness_hist = Counter()  # how many of the 4 key fields present
    for r in records:
        miss = set()
        if not documented(r.get("overview")):
            miss.add("overview")
        if not documented(r.get("languages")):
            miss.add("languages")
        if not documented(r.get("size_category") or r.get("size_text")):
            miss.add("size")
        if not documented(r.get("modality")):
            miss.add("modality")
        present = sum(1 for f in key_fields if f not in miss)
        completeness_hist[present] += 1

    non_empty_languages = {k for k in language if k not in ("Not documented", "unknown", "N/A")}
    non_empty_licenses = {k for k in license_ if k not in ("Not documented", "unknown", "N/A")}

    # ----- save CSV tables -----
    write_csv("benchmarks_by_modality.csv", ["modality", "count", "pct"],
              counter_rows(modality, total))
    write_csv("benchmarks_by_language.csv", ["language", "count", "pct"],
              counter_rows(language, total))
    if non_empty_licenses:
        write_csv("benchmarks_by_license.csv", ["license", "count", "pct"],
                  counter_rows(license_, total))
    else:
        remove_csv("benchmarks_by_license.csv")
    # size in canonical order
    size_rows = [[b, size.get(b, 0), round(100.0 * size.get(b, 0) / total, 1)]
                 for b in size_order if size.get(b, 0)]
    write_csv("benchmarks_by_size.csv", ["size_bucket", "count", "pct"], size_rows)
    write_csv("benchmarks_by_task.csv", ["task", "count", "pct"],
              counter_rows(tasks, total))
    write_csv("documentation_missing_fields.csv", ["missing_field", "count", "pct"],
              counter_rows(missing, total))
    write_csv("documentation_completeness.csv",
              ["key_fields_present_out_of_4", "benchmark_count", "pct"],
              [[k, completeness_hist.get(k, 0),
                round(100.0 * completeness_hist.get(k, 0) / total, 1)]
               for k in range(0, 5)])
    write_csv("benchmarks_oss_friendly.csv", ["category", "count", "pct"],
              counter_rows(oss, total))
    availability_rows = [[k, v, round(100.0 * v / total, 1)] for k, v in avail.items()]
    write_csv("artifact_link_availability_dataset.csv", ["signal", "count", "pct"], availability_rows)

    return {
        "source": source,
        "key_fields": key_fields,
        "total": total,
        "modality": counter_rows(modality, total),
        "language": counter_rows(language, total)[:15],
        "license": counter_rows(license_, total)[:15],
        "size": size_rows,
        "tasks": counter_rows(tasks, total)[:20],
        "missing_fields": counter_rows(missing, total),
        "completeness": [[str(k), completeness_hist.get(k, 0)] for k in range(0, 5)],
        "oss": counter_rows(oss, total),
        "instruction_tuning": counter_rows(instr, total),
        "libraries": counter_rows(libraries, total)[:12],
        "availability": availability_rows,
        "distinct_languages": len(non_empty_languages),
        "distinct_licenses": len(non_empty_licenses),
        "distinct_tasks": len(tasks),
    }


# --------------------------------------------------------------------------- #
# 2. growth over time (paper Figure 1, arXiv slice)
# --------------------------------------------------------------------------- #
def analyze_growth():
    months = Counter()
    for r in read_jsonl(ARXIV_BENCH):
        p = (r.get("published") or "")[:7]  # YYYY-MM
        if re.match(r"^\d{4}-\d{2}$", p):
            months[p] += 1

    series = []
    if months:
        keys = sorted(months)
        # clip absurd tails; keep from 2019 onward
        keys = [k for k in keys if k >= "2019-01"]
        cum = 0
        for k in keys:
            cum += months[k]
            series.append([k, months[k], cum])
        write_csv("growth_over_time.csv",
                  ["month", "new_benchmarks", "cumulative"], series)
    else:
        remove_csv("growth_over_time.csv")

    return {"series": series, "total": series[-1][2] if series else 0}


# --------------------------------------------------------------------------- #
# 3. artifact availability + hosting (paper Tables 5 & 6)
# --------------------------------------------------------------------------- #
def analyze_artifacts():
    status = Counter()
    hosts = Counter()
    host_fields = OrderedDict([
        ("github", "GitHub"),
        ("huggingface", "Hugging Face"),
        ("project_site", "Project site (.io)"),
        ("kaggle", "Kaggle"),
        ("anonymous_repo", "Anonymous (4open)"),
        ("zenodo", "Zenodo"),
        ("google_drive", "Google Drive"),
        ("gitlab", "GitLab"),
    ])
    total = 0
    for r in read_jsonl(LINKS_2025):
        total += 1
        s = r.get("status", "unknown")
        status[s] += 1
        for key in host_fields:
            if r.get(key):
                hosts[key] += 1

    status_label = {"available": "Link(s) found (available)",
                    "promised": "Promised, not yet released",
                    "none": "No links at all"}
    status_rows = [[status_label.get(k, k), v, round(100.0 * v / total, 1)]
                   for k, v in status.most_common()]
    host_rows = [[host_fields[k], hosts.get(k, 0),
                  round(100.0 * hosts.get(k, 0) / total, 1)]
                 for k in host_fields if hosts.get(k, 0)]

    if total:
        write_csv("artifact_availability_status.csv",
                  ["status", "count", "pct"], status_rows)
        write_csv("artifact_hosting_platforms.csv",
                  ["platform", "papers", "pct"], host_rows)
    else:
        remove_csv("artifact_availability_status.csv")
        remove_csv("artifact_hosting_platforms.csv")

    return {"total": total, "status": status_rows, "hosts": host_rows}


# --------------------------------------------------------------------------- #
# 4. survey results transcribed from the paper (Appendix C, Tables 1-4)
# --------------------------------------------------------------------------- #
def survey_tables():
    N = 23

    scientific = [["Construct validity", 17], ["Reliability", 16],
                  ["Annotation quality", 13], ["Data contamination checks", 10],
                  ["Difficulty calibration", 8], ["Statistical rigor", 7]]
    coverage = [["Domain relevance", 20], ["Human evaluation data", 17],
                ["Language coverage", 11], ["Robustness testing", 8],
                ["Safety evaluation", 6]]
    practical = [["Ease of setup", 14], ["Ready-to-use implementations", 13],
                 ["Reproducibility features", 13], ["Performance estimates", 9],
                 ["Container/API support", 6]]
    external = [["Academic citations", 17], ["Community adoption", 16],
                ["Standardized metrics", 13], ["Documentation quality", 13],
                ["Active maintenance", 12], ["Third-party validation", 5]]
    sources = [["Academic papers (arXiv, conferences)", 21], ["Hugging Face", 18],
               ["GitHub repositories", 16], ["Recommendations from colleagues", 10],
               ["Social media / forums", 5], ["Community leaderboards", 3],
               ["Vendor documentation", 1]]
    constraints = [["Benchmark validation & quality", 4.2], ["Technical compatibility", 3.9],
                   ["Ease of integration", 3.8], ["Time-to-run", 3.6],
                   ["Monetary / compute budget", 3.5], ["Data privacy & compliance", 3.4],
                   ["Licensing & terms of use", 3.2], ["Organizational policies", 3.0]]
    trust = [["Human eval w/ inter-annotator agreement", 3.8],
             ["Head-to-head human (Arena-style)", 3.5],
             ["Adversarial / stress testing", 3.3],
             ["Automated metrics (BLEU, ROUGE)", 3.1],
             ["LLM-as-judge evaluation", 2.9]]
    features = [["Evidence score (docs, seeds, human eval)", 4.1],
                ["Explainers: why a benchmark was recommended", 3.9],
                ["One-click export (JSON/Markdown)", 3.8],
                ["Domain-specific tailoring", 3.8],
                ["Contamination risk & provenance indicators", 3.7],
                ["Maintenance score (updates, activity)", 3.6],
                ["Ranked recommendations", 3.4],
                ["Compute cost / time estimator", 3.3],
                ["Visualizations of results", 3.2],
                ["Support for custom metrics", 3.1]]

    def pct_rows(rows):
        return [[lbl, cnt, round(100.0 * cnt / N, 1)] for lbl, cnt in rows]

    write_csv("survey_scientific_quality_factors.csv",
              ["factor", "respondents", "pct"], pct_rows(scientific))
    write_csv("survey_coverage_factors.csv",
              ["factor", "respondents", "pct"], pct_rows(coverage))
    write_csv("survey_practical_factors.csv",
              ["factor", "respondents", "pct"], pct_rows(practical))
    write_csv("survey_external_signals.csv",
              ["signal", "respondents", "pct"], pct_rows(external))
    write_csv("survey_information_sources.csv",
              ["source", "respondents", "pct"], pct_rows(sources))
    write_csv("survey_constraint_importance.csv",
              ["constraint", "mean_rating_1to5"], constraints)
    write_csv("survey_trust_in_methods.csv",
              ["evaluation_method", "mean_trust_1to5"], trust)
    write_csv("survey_feature_importance.csv",
              ["feature", "mean_importance_1to5"], features)

    return {
        "n": N,
        "scientific": pct_rows(scientific),
        "coverage": pct_rows(coverage),
        "practical": pct_rows(practical),
        "external": pct_rows(external),
        "sources": pct_rows(sources),
        "constraints": constraints,
        "trust": trust,
        "features": features,
    }


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    print("BenchNavigator :: building analytics ...")
    os.makedirs(TABLES_DIR, exist_ok=True)

    benchmarks = analyze_benchmarks()
    print(f"  benchmarks analysed : {benchmarks['total']:,}")
    growth = analyze_growth()
    print(f"  growth months       : {len(growth['series'])} "
          f"(cumulative {growth['total']:,})")
    artifacts = analyze_artifacts()
    print(f"  artifact papers     : {artifacts['total']:,}")
    survey = survey_tables()
    print(f"  survey respondents  : {survey['n']}")

    stats = {
        "generated_from": f"{benchmarks['source']} + optional arxiv_data + survey",
        "benchmarks": benchmarks,
        "growth": growth,
        "artifacts": artifacts,
        "survey": survey,
    }
    with open(os.path.join(ROOT, "stats.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, ensure_ascii=False, indent=1)

    csvs = sorted(f for f in os.listdir(TABLES_DIR) if f.endswith(".csv"))
    print(f"\nWrote stats.json and {len(csvs)} CSV tables to tables/:")
    for f in csvs:
        print(f"  - tables/{f}")


if __name__ == "__main__":
    main()
