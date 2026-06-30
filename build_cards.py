#!/usr/bin/env python3
"""
build_cards.py — turn the real BenchmarkCards into the Explore dataset.

Reads the JSON cards in ALL_СARDS_TRUE/ (one per arXiv id) and flattens each into
a single record with REAL, filterable facets — domains, tasks, audience, AI-risk
categories — plus the full documentation (goal, data source, annotation, methods,
metrics, limitations) used by the card and comparison views.

Output: benchmark_cards.jsonl  (the Explore page prefers this file)

Why this exists: the scraped HF metadata has empty domain/risk/audience fields, so
combining filters always collapsed to zero. These cards have those fields populated,
which is what makes the faceted filters actually work.

Run:  python build_cards.py
Stdlib only.
"""

import json
import os
import re
import glob

ROOT = os.path.dirname(os.path.abspath(__file__))
# Resolve both common layouts:
#   project/ALL_CARDS_TRUE
#   project/ALL_\u0421ARDS_TRUE   (the C is Cyrillic)
# Older copies also put the folder beside the project directory, so keep that too.
CARD_DIR_NAMES = ("ALL_CARDS_TRUE", "ALL_\u0421ARDS_TRUE")
SEARCH_ROOTS = (ROOT, os.path.dirname(ROOT))
CARD_DIRS = [
    os.path.join(search_root, dirname)
    for search_root in SEARCH_ROOTS
    for dirname in CARD_DIR_NAMES
]
OUT = os.path.join(ROOT, "benchmark_cards.jsonl")


def find_card_dir():
    for d in CARD_DIRS:
        if os.path.isdir(d):
            return d
    # last resort: any matching folder in either supported root
    for search_root in SEARCH_ROOTS:
        for d in glob.glob(os.path.join(search_root, "ALL_*ARDS*")):
            if os.path.isdir(d):
                return d
    return None


def norm(s):
    """Collapse whitespace and trim — fixes leading-space / double-space noise."""
    if not isinstance(s, str):
        return ""
    return re.sub(r"\s+", " ", s).strip()


def norm_list(lst, titlecase=False):
    """Normalize + de-duplicate (case-insensitively) a list of facet values."""
    out = []
    seen = set()
    for x in (lst or []):
        v = norm(x)
        if v.lower() in {"n/a", "na", "none", "unknown", "not specified", "not documented"}:
            continue
        if titlecase and v:
            v = v.title()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out


def clean_name(s):
    return re.sub(r"^[\s\-–—:•·]+", "", norm(s)).strip()


def parse_size_category(text):
    """Best-effort size bucket from the freeform size string (takes the largest
    number found, since that's usually the dataset size)."""
    if not text:
        return ""
    t = text.lower().replace(",", "")
    best = 0.0
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(k|thousand|m|million|b|billion)?", t):
        num = float(m.group(1))
        mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6,
                "b": 1e9, "billion": 1e9}.get(m.group(2), 1)
        best = max(best, num * mult)
    if best <= 0:
        return ""
    if best < 1_000:      return "<1K"
    if best < 10_000:     return "1K–10K"
    if best < 100_000:    return "10K–100K"
    if best < 1_000_000:  return "100K–1M"
    return ">1M"


def classify_annotation(text):
    """Coarse annotation-method category from the annotation description."""
    if not text:
        return ""
    t = text.lower()
    if t.strip() in ("n/a", "na", "none"):
        return ""
    if any(k in t for k in ("crowdsourc", "mechanical turk", "mturk", "crowdworker", "amazon mechanical")):
        return "Crowdsourced"
    if any(k in t for k in ("expert", "physician", "clinician", "professional", "linguist", "specialist")):
        return "Expert annotation"
    if any(k in t for k in ("automatic", "synthetic", "programmatically", "distant supervision", "heuristic", "rule-based")):
        return "Automatic"
    if any(k in t for k in ("human", "manual", "hand-", "hand ", "annotator")):
        return "Human annotation"
    return "Other"


def classify_data_type(data_type_raw, tasks, modality):
    """Coarse data-type category (distinct from modality), for the Data Type facet."""
    blob = (data_type_raw + " " + " ".join(tasks)).lower()
    if "multiple" in blob and "choice" in blob:           return "Multiple choice"
    if any(k in blob for k in ("question", "q&a", "answering")): return "Question answering"
    if any(k in blob for k in ("classif", "sentiment", "detection", "label")): return "Classification"
    if any(k in blob for k in ("generat", "summar", "translation", "dialogue", "caption")): return "Generation"
    if any(k in blob for k in ("retriev", "search", "ranking")): return "Retrieval"
    if any(k in blob for k in ("regress", "scoring", "similarity")): return "Scoring / regression"
    if any(k in blob for k in ("span", "extract")):       return "Span extraction"
    return {"image": "Image", "tabular": "Tabular", "audio": "Audio",
            "video": "Video", "code": "Code"}.get(modality, "Text")


def infer_modality(domains, data_type, tasks):
    blob = " ".join(list(domains or []) + [data_type or ""] + list(tasks or [])).lower()
    if any(k in blob for k in ("computer vision", "image", "visual question", "vqa", "ocr", "scene")):
        return "image"
    if any(k in blob for k in ("speech", "audio", "asr ", "acoustic", "voice")):
        return "audio"
    if "video" in blob:
        return "video"
    if any(k in blob for k in ("tabular", "table ", "spreadsheet")):
        return "tabular"
    if any(k in blob for k in ("code", "software engineering", "program")):
        return "code"
    return "text"


def classify_links(resources):
    out = {"paper": "", "github": "", "huggingface": "", "homepage": ""}
    for u in (resources or []):
        if not isinstance(u, str):
            continue
        lu = u.lower()
        if ("arxiv.org" in lu or "aclanthology" in lu or "doi.org" in lu) and not out["paper"]:
            out["paper"] = u
        elif "github.com" in lu and not out["github"]:
            out["github"] = u
        elif "huggingface.co" in lu and not out["huggingface"]:
            out["huggingface"] = u
        elif not out["homepage"]:
            out["homepage"] = u
    return out


def first_or(lst, default=""):
    return lst[0] if lst else default


def adapt(card, arxiv_id):
    bd = card.get("benchmark_details", {}) or {}
    pu = card.get("purpose_and_intended_users", {}) or {}
    da = card.get("data", {}) or {}
    me = card.get("methodology", {}) or {}
    tr = card.get("targeted_risks", {}) or {}

    if bd.get("is_benchmark") is False:
        return None
    name = clean_name(bd.get("name") or bd.get("abbreviation") or "")
    if not name:
        return None

    domains = norm_list(bd.get("domains"))
    tasks = norm_list(pu.get("tasks"))
    audience = norm_list(pu.get("audience"))
    languages = norm_list(bd.get("languages"))
    risk_categories = norm_list(tr.get("risk_categories"), titlecase=True)
    atlas = (tr.get("atlas_risks") or {}).get("risks") or []
    atlas_risks = [
        {"category": norm(a.get("category")).title(), "subcategory": norm_list(a.get("subcategory"))}
        for a in atlas if isinstance(a, dict) and a.get("category")
    ]
    if not risk_categories and atlas_risks:
        risk_categories = norm_list([r["category"] for r in atlas_risks], titlecase=True)

    data_type = bd.get("data_type") or ""
    links = classify_links(bd.get("resources"))
    if not links["paper"] and arxiv_id:
        links["paper"] = f"https://arxiv.org/abs/{arxiv_id}"

    return {
        "arxiv_id": arxiv_id,
        "name": name,
        "abbreviation": bd.get("abbreviation") or "",
        "overview": bd.get("overview") or "",
        "data_type_raw": data_type,
        "primary_task": first_or(tasks) or first_or(domains) or "N/A",
        "domains": domains,
        "tasks": tasks,
        "languages": languages,
        "primary_language": first_or(languages, "N/A"),
        "audience": audience,
        "risk_categories": risk_categories,
        "atlas_risks": atlas_risks,
        "goal": pu.get("goal") or "",
        "limitations": pu.get("limitations") or "",
        "data_source": da.get("source") or "",
        "size_text": da.get("size") or "",
        "size_category": parse_size_category(da.get("size") or ""),
        "format": da.get("format") or "",
        "annotation": da.get("annotation") or "",
        "annotation_method": classify_annotation(da.get("annotation") or ""),
        "data_type_category": classify_data_type(data_type, tasks, infer_modality(domains, data_type, tasks)),
        "methods": norm_list(me.get("methods")),
        "metrics": norm_list(me.get("metrics")),
        "similar_benchmarks": norm_list(bd.get("similar_benchmarks")),
        "modality": infer_modality(domains, data_type, tasks),
        "resources": [r for r in (bd.get("resources") or []) if isinstance(r, str)],
        "paper": links["paper"],
        "github": links["github"],
        "huggingface": links["huggingface"],
        "homepage": links["homepage"],
    }


def main():
    card_dir = find_card_dir()
    if not card_dir:
        raise SystemExit("could not find ALL_CARDS_TRUE inside or next to the project")
    files = sorted(glob.glob(os.path.join(card_dir, "*.json")))
    display_dir = os.path.basename(card_dir).encode("ascii", "backslashreplace").decode("ascii")
    print(f"reading {len(files):,} cards from {display_dir}/")

    written = skipped = 0
    with open(OUT, "w", encoding="utf-8") as out:
        for f in files:
            arxiv_id = os.path.splitext(os.path.basename(f))[0]
            try:
                card = json.load(open(f, encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                skipped += 1
                continue
            rec = adapt(card, arxiv_id)
            if rec is None:
                skipped += 1
                continue
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1

    print(f"wrote {written:,} benchmarks to {os.path.basename(OUT)}  (skipped {skipped:,})")


if __name__ == "__main__":
    main()
