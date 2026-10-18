"""Build brain-dump examples: several unrelated one-topic thoughts in one entry.

Real Orbit entries are often a list of short, unrelated thoughts ("I miss my sister.
My exams are next week. I want to learn to paint."). The DeepSeek data is mostly
flowing narrative, so the model learned to lump neighbouring sentences together.
Here we join already-labelled single-topic entries from different categories, so the
labels stay exact and no API calls are needed.

    py build_brain_dumps.py
writes
    dataset/orbit_brain_dumps.train.jsonl   (from training entries only)
    dataset/orbit_brain_dumps.val.jsonl     (from validation entries only)
    dataset/orbit_bubbles_v4_continue.train.jsonl  (brain dumps + replayed v3 examples)
"""
import argparse
import json
import random
from pathlib import Path

from orbit_schema import check_example, from_chat_record, to_chat_record

HERE = Path(__file__).parent
DATA = HERE / "dataset"
PIECES = {2: 0.25, 3: 0.35, 4: 0.25, 5: 0.15}  # thoughts per entry
JOINERS = {" ": 0.65, "\n": 0.25, "  ": 0.10}   # how phones separate them


def singles(path: Path, max_words: int) -> list[tuple[str, list[dict]]]:
    """Single-category entries short enough to be one thought in a list."""
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        entry, bubbles = from_chat_record(json.loads(line))
        if len(bubbles) == 1 and len(entry.split()) <= max_words and "\n" not in entry:
            rows.append((entry.strip(), bubbles))
    return rows


def compose(pool: list[tuple[str, list[dict]]], count: int, rng: random.Random) -> list[dict]:
    by_category: dict[str, list[tuple[str, list[dict]]]] = {}
    for entry, bubbles in pool:
        by_category.setdefault(bubbles[0]["category"], []).append((entry, bubbles))
    categories = sorted(by_category)
    records, seen = [], set()
    while len(records) < count:
        k = rng.choices(list(PIECES), weights=list(PIECES.values()))[0]
        chosen = rng.sample(categories, k)  # distinct categories, so every thought is its own bubble
        parts = [rng.choice(by_category[c]) for c in chosen]
        joiner = rng.choices(list(JOINERS), weights=list(JOINERS.values()))[0]
        entry = joiner.join(text for text, _ in parts)
        if entry in seen:
            continue
        bubbles = [b for _, part in parts for b in part]
        canonical, reason = check_example(entry, bubbles)
        if canonical is None:  # e.g. a short piece also occurs inside a longer one
            continue
        seen.add(entry)
        records.append(to_chat_record(entry, canonical))
    return records


def write(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    print(f"wrote {len(records):5d} -> {path.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-count", type=int, default=1500)
    parser.add_argument("--val-count", type=int, default=100)
    parser.add_argument("--replay", type=int, default=1500, help="v3 training examples mixed in so the model does not forget")
    parser.add_argument("--max-words", type=int, default=25)
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()
    rng = random.Random(args.seed)

    v3_train = DATA / "orbit_bubbles_v3.train.jsonl"
    train_pool = singles(v3_train, args.max_words)
    val_pool = singles(DATA / "orbit_bubbles_v2.clean.val.jsonl", args.max_words)
    print(f"single-topic pieces: {len(train_pool)} train, {len(val_pool)} val")

    train_dumps = compose(train_pool, args.train_count, rng)
    val_dumps = compose(val_pool, args.val_count, rng)
    replay = rng.sample(v3_train.read_text(encoding="utf-8").splitlines(), args.replay)
    mixed = train_dumps + [json.loads(line) for line in replay]
    rng.shuffle(mixed)

    write(DATA / "orbit_brain_dumps.train.jsonl", train_dumps)
    write(DATA / "orbit_brain_dumps.val.jsonl", val_dumps)
    write(DATA / "orbit_bubbles_v4_continue.train.jsonl", mixed)


if __name__ == "__main__":
    main()
