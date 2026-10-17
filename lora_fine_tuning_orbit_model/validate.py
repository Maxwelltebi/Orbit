"""Validate an Orbit bubble dataset (chat-format JSONL) and optionally split it.

    py validate.py orbit_samples.jsonl
    py validate.py ../dataset/orbit_bubbles_v2.jsonl --out ../dataset/orbit_bubbles_v2.clean.jsonl --split 0.1
"""
import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

from orbit_schema import CATEGORIES, check_example, from_chat_record, to_chat_record


def normalize(entry: str) -> str:
    return re.sub(r"\W+", " ", entry.lower()).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--out", type=Path, help="write only valid, de-duplicated, canonicalized records here")
    parser.add_argument("--split", type=float, default=0.0, help="fraction held out for validation (needs --out)")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--allow-gaps", action="store_true", help="allow words that are in no bubble")
    parser.add_argument("--show", type=int, default=10, help="how many rejections to print")
    args = parser.parse_args()

    kept: list[dict] = []
    reasons: Counter[str] = Counter()
    shown, seen = 0, set()
    lines = args.path.read_text(encoding="utf-8").splitlines()
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            entry, bubbles = from_chat_record(json.loads(line))
            canonical, reason = check_example(entry, bubbles, require_full_coverage=not args.allow_gaps)
        except (ValueError, KeyError, IndexError, TypeError) as error:
            canonical, reason = None, f"unparseable record: {error}"
        if canonical is not None and normalize(entry) in seen:
            canonical, reason = None, "duplicate entry"
        if canonical is None:
            reasons[reason.split(":")[0]] += 1
            if shown < args.show:
                print(f"line {number}: {reason}")
                shown += 1
            continue
        seen.add(normalize(entry))
        kept.append(to_chat_record(entry, canonical))

    total = sum(1 for line in lines if line.strip())
    print(f"\n{len(kept)}/{total} valid")
    for reason, count in reasons.most_common():
        print(f"  rejected {count:5d}  {reason}")

    if kept:
        categories: Counter[str] = Counter()
        bubble_counts: Counter[int] = Counter()
        lengths: Counter[str] = Counter()
        for record in kept:
            entry, bubbles = from_chat_record(record)
            categories.update(b["category"] for b in bubbles)
            bubble_counts[len(bubbles)] += 1
            words = len(entry.split())
            lengths["1-5 words" if words <= 5 else "6-20" if words <= 20 else "21-50" if words <= 50 else "51+"] += 1
        print("\ncategory usage:")
        for category in CATEGORIES:
            print(f"  {categories[category]:5d}  {category}")
        print("bubbles per entry:", dict(sorted(bubble_counts.items())))
        print("entry length:", dict(lengths))

    if args.out:
        random.Random(args.seed).shuffle(kept)
        held = int(len(kept) * args.split)
        splits = {args.out: kept[held:]}
        if held:
            splits = {args.out.with_suffix(".train.jsonl"): kept[held:], args.out.with_suffix(".val.jsonl"): kept[:held]}
        for path, records in splits.items():
            path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
            print(f"wrote {len(records)} -> {path}")


if __name__ == "__main__":
    main()
