"""
Builds arxiv_disk_digest.json for the Research tab of the website.

Finds astro-ph papers on arXiv where Sidhant Kumar Suar is first author, ranks
them by similarity to the topics in interests.txt, and writes the top few to
the JSON file the site reads.

Runs automatically every week via .github/workflows/update-publications.yml.
You can still run it by hand from the repo root:
    python scripts/update_publications.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import arxiv
import numpy as np
from sentence_transformers import SentenceTransformer

# ---------------------------
# CONFIG
# ---------------------------

MAX_RESULTS = 300
TOP_N = 5
QUERY = '(cat:astro-ph.*) AND au:"Sidhant Kumar Suar"'
MY_FIRST = "Sidhant"
MY_LAST = "Suar"

# Paths are relative to this file, so the script works from any directory
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
INTEREST_FILE = SCRIPT_DIR / "interests.txt"
OUTPUT_FILE = REPO_ROOT / "arxiv_disk_digest.json"

# ---------------------------
# LOAD INTEREST PROFILE
# ---------------------------

interest_text = INTEREST_FILE.read_text(encoding="utf-8").strip()

# ---------------------------
# LOAD EMBEDDING MODEL
# ---------------------------

model = SentenceTransformer("all-MiniLM-L6-v2")
interest_embedding = model.encode(interest_text, normalize_embeddings=True)

# ---------------------------
# QUERY ARXIV
# ---------------------------

# arxiv>=2.0 uses a Client; Search.results() is deprecated.
# Retries and a polite delay help when the arXiv API is having a slow day.
client = arxiv.Client(page_size=100, delay_seconds=3, num_retries=5)
search = arxiv.Search(
    query=QUERY,
    max_results=MAX_RESULTS,
    sort_by=arxiv.SortCriterion.SubmittedDate,
)

papers = []
for result in client.results(search):
    # Skip if first author isn't you
    first_author = result.authors[0].name.lower()
    if MY_FIRST.lower() not in first_author or MY_LAST.lower() not in first_author:
        continue

    abstract = result.summary.replace("\n", " ")
    paper_embedding = model.encode(abstract, normalize_embeddings=True)

    # Both embeddings are normalized, so cosine similarity is just the dot product
    similarity = float(np.dot(interest_embedding, paper_embedding))

    papers.append({
        "title": result.title,
        "authors": ", ".join(a.name for a in result.authors),
        "abstract": abstract,
        "url": result.entry_id,
        "published": result.published.date().isoformat(),
        "score": round(similarity, 4),
    })

# Safety net: if arXiv returned nothing (outage, rate limit, changed query),
# keep the existing list on the site instead of replacing it with an empty one.
# Exiting with an error also makes the GitHub run fail, which emails you.
if not papers:
    print("No first-author papers found; leaving the existing JSON untouched.")
    sys.exit(1)

# ---------------------------
# RANK & SAVE
# ---------------------------

papers.sort(key=lambda x: x["score"], reverse=True)
output = {
    "generated": datetime.now(timezone.utc).isoformat(),
    "papers": papers[:TOP_N],
}

OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Saved top {min(TOP_N, len(papers))} of {len(papers)} papers to {OUTPUT_FILE.name}")
