#!/usr/bin/env python3
"""
data_quality_agent.py — automated data-quality checker/fixer for BenchNavigator.

The canonical BenchmarkCards corpus is too large to inspect by hand, so this
agent sweeps every card, runs a battery of checks, and reports what it found. It
is deliberately conservative and aligned with the paper:

  * FLAG — never fabricate — missing or untrustworthy values (unknown language,
    missing purpose, missing source links, missing risk categories). The paper's
    stance is to make gaps visible, not to infer them.

Outputs:
  benchmark_cards_cleaned.jsonl    cards (+ _quality block per record)
  tables/data_quality_issues.csv   one row per issue type (count, %, severity, action)
  tables/data_quality_by_record.csv per-card flags + quality score
  data_quality.json                summary payload for the dashboard
  (console)                        human-readable summary

Run:  python data_quality_agent.py
Stdlib only.
"""

import csv
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "benchmark_cards.jsonl")
OUT_JSONL = os.path.join(ROOT, "benchmark_cards_cleaned.jsonl")
TABLES = os.path.join(ROOT, "tables")

# Issue catalogue: id -> (severity, action, human description)
ISSUES = {
    "missing_overview":   ("warn", "flagged", "Overview is missing or too short"),
    "missing_goal":       ("warn", "flagged", "Purpose / goal is not documented"),
    "missing_data_source":("warn", "flagged", "Data source is not documented"),
    "missing_annotation": ("info", "flagged", "Annotation method is not documented"),
    "missing_language":   ("info", "flagged", "Language is not documented"),
    "missing_size":       ("info", "flagged", "Dataset size is not documented"),
    "missing_risk":       ("info", "flagged", "AI Risk Atlas category is not documented"),
    "missing_audience":   ("info", "flagged", "Intended audience is not documented"),
    "no_source_links":    ("warn", "flagged", "No outbound source/provenance links"),
}

PENALTIES = {
    "missing_overview": 20,
    "missing_goal": 16,
    "missing_data_source": 16,
    "no_source_links": 20,
    "missing_annotation": 8,
    "missing_language": 6,
    "missing_size": 8,
    "missing_risk": 6,
    "missing_audience": 6,
}


# --------------------------------------------------------------------------- #
# helpers / fixers
# --------------------------------------------------------------------------- #
def read_jsonl(path):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def documented(value):
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip().lower() not in ("", "n/a", "na", "none", "unknown", "not specified", "not documented")
    if isinstance(value, (list, tuple, set, dict)):
        if isinstance(value, dict):
            return len(value) > 0
        return any(documented(v) for v in value)
    return True


# --------------------------------------------------------------------------- #
# per-card check
# --------------------------------------------------------------------------- #
def process(rec):
    flags = []

    # --- flags (no fabrication) ---
    if len((rec.get("overview") or "").strip()) < 30:
        flags.append("missing_overview")
    if not documented(rec.get("goal")):
        flags.append("missing_goal")
    if not documented(rec.get("data_source")):
        flags.append("missing_data_source")
    if not documented(rec.get("annotation")):
        flags.append("missing_annotation")
    if not documented(rec.get("languages")):
        flags.append("missing_language")
    if not documented(rec.get("size_category") or rec.get("size_text")):
        flags.append("missing_size")
    if not documented(rec.get("risk_categories")) and not documented(rec.get("atlas_risks")):
        flags.append("missing_risk")
    if not documented(rec.get("audience")):
        flags.append("missing_audience")
    if not any(documented(rec.get(k)) for k in ("paper", "github", "huggingface", "homepage")):
        flags.append("no_source_links")

    # --- approval score: explicit penalties for missing user-facing evidence ---
    score = 100
    for fl in flags:
        score -= PENALTIES.get(fl, 0)
    score = max(0, min(100, score))

    valid = [f for f in flags if f in ISSUES]
    open_flags = [f for f in valid if ISSUES[f][1] == "flagged"]   # still a concern
    if not open_flags and score >= 90:
        review_status = "approved"
    elif score >= 70:
        review_status = "needs_review"
    else:
        review_status = "incomplete"

    out = dict(rec)
    out["_quality"] = {
        "flags": open_flags,
        "score": score,
        "review_status": review_status,
    }
    return out, flags, open_flags, score, review_status


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"source not found: {SRC}")
    os.makedirs(TABLES, exist_ok=True)

    issue_counts = Counter()
    fix_counts = Counter()
    score_hist = Counter()           # bucketed 0-100 in tens
    review_counts = Counter()
    per_record = []
    total = 0

    with open(OUT_JSONL, "w", encoding="utf-8") as out:
        for rec in read_jsonl(SRC):
            total += 1
            cleaned, flags, open_flags, score, review_status = process(rec)
            out.write(json.dumps(cleaned, ensure_ascii=False) + "\n")

            for fl in flags:
                issue_counts[fl] += 1
                if ISSUES.get(fl, ("", "flagged"))[1] == "fixed":
                    fix_counts[fl] += 1
            score_hist[min(100, (score // 10) * 10)] += 1
            review_counts[review_status] += 1
            per_record.append([
                cleaned.get("arxiv_id", ""),
                cleaned.get("name", ""),
                cleaned.get("primary_task", ""),
                score,
                review_status,
                ";".join(open_flags),
            ])

    # ----- tables -----
    issue_rows = []
    for iid, (sev, action, desc) in ISSUES.items():
        c = issue_counts.get(iid, 0)
        issue_rows.append([iid, c, round(100.0 * c / total, 1), sev, action, desc])
    issue_rows.sort(key=lambda r: -r[1])
    with open(os.path.join(TABLES, "data_quality_issues.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["issue", "count", "pct", "severity", "action", "description"])
        w.writerows(issue_rows)

    with open(os.path.join(TABLES, "data_quality_by_record.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["arxiv_id", "name", "primary_task", "quality_score", "review_status", "flags"])
        w.writerows(per_record)

    clean_records = review_counts.get("approved", 0)
    summary = {
        "total": total,
        "records_fixed": 0,
        "records_with_flags": sum(1 for r in per_record if r[5]),
        "clean_records": clean_records,
        "review_status": {
            "approved": review_counts.get("approved", 0),
            "needs_review": review_counts.get("needs_review", 0),
            "incomplete": review_counts.get("incomplete", 0),
        },
        "issues": [
            {"issue": r[0], "count": r[1], "pct": r[2], "severity": r[3], "action": r[4], "description": r[5]}
            for r in issue_rows
        ],
        "score_histogram": [[str(k), score_hist.get(k, 0)] for k in range(0, 101, 10)],
        "mean_score": round(sum(r[3] for r in per_record) / total, 1) if total else 0,
    }
    with open(os.path.join(ROOT, "data_quality.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=1)

    # ----- console -----
    print("BenchNavigator :: data-quality agent")
    print(f"  scanned         : {total:,} cards")
    print(f"  mean quality    : {summary['mean_score']}/100")
    print(f"  approved        : {clean_records:,} ({round(100*clean_records/total,1)}%)")
    print(f"  needs review    : {review_counts.get('needs_review', 0):,}")
    print(f"  incomplete      : {review_counts.get('incomplete', 0):,}")
    print("  issues:")
    for r in issue_rows:
        tag = "FIX " if r[4] == "fixed" else "flag"
        print(f"    [{tag}] {r[0]:<20} {r[1]:>6,} ({r[2]:>4}%)  {r[5]}")
    print(f"\n  wrote {os.path.basename(OUT_JSONL)}, data_quality.json,")
    print("        tables/data_quality_issues.csv, tables/data_quality_by_record.csv")


if __name__ == "__main__":
    main()
