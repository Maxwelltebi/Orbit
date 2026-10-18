"""Shared definitions for the Orbit bubble-sorting dataset.

One example = a raw journal entry in, a JSON list of category bubbles out.
Every bubble text must be copied verbatim from the entry.
"""
import json
import os
import re
from pathlib import Path
from typing import Any

# Must match the instruction the app sends at inference time.
INSTRUCTION = "Sort this journal entry into category bubbles. Use only the writer's exact words. Return JSON."

CATEGORIES = {
    "Work": "job, boss, coworkers, shifts, career, job hunting",
    "School": "classes, exams, homework, grades, lecturers, school fees",
    "Money": "rent, bills, spending, saving, debt, salary, prices",
    "Family": "parents, siblings, relatives, own children, parenting, caring for family",
    "Relationships": "romantic partner, dating, crushes, breakups, marriage",
    "Friends": "friends, social life, fitting in, feeling left out by friends",
    "Health & Body": "sickness, pain, sleep, exercise, food and eating, body image, energy",
    "Feelings": "present emotions stated as feelings: sad, happy, angry, tired, numb, burned out",
    "Worries": "what-ifs, anxiety, fear about things that might happen",
    "Self-Reflection": "self-talk, self-esteem, identity, weighing decisions, values, noticing own patterns",
    "Goals & Plans": "intentions, resolutions, habits to build, things to learn, future plans",
    "Gratitude": "thankfulness, appreciation, counting blessings",
    "Hobbies & Creativity": "music, art, writing, sports for fun, games, shows, crafts",
    "Faith & Spirituality": "church, mosque, prayer, God, meditation, spiritual life",
    "Daily Life": "chores, errands, groceries, home, commute, ordinary logistics",
    "Grief & Loss": "death, mourning, missing someone who died, losing something important",
    "Other": "anything that clearly fits none of the other categories",
}

_WORD = re.compile(r"\w")


def load_env(path: Path = Path(__file__).parent / ".env") -> None:
    """Load KEY=value lines from .env into os.environ (existing variables win)."""
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
_SENTENCE_END = re.compile(r"[.!?…]\W*$")


def user_message(entry: str) -> str:
    return f"{INSTRUCTION}\n\n{entry}"


def _locate(entry: str, spans: list[str]) -> list[tuple[int, int]] | None:
    """Assign each span a non-overlapping position in the entry, earliest first.

    Returns (start, end) per span in input order, or None if no such assignment exists.
    """
    order = sorted(range(len(spans)), key=lambda i: entry.find(spans[i]))
    taken: list[tuple[int, int]] = []
    result: list[tuple[int, int] | None] = [None] * len(spans)
    for i in order:
        span, pos = spans[i], entry.find(spans[i])
        while pos != -1 and any(pos < e and pos + len(span) > s for s, e in taken):
            pos = entry.find(span, pos + 1)
        if pos == -1:
            return None
        taken.append((pos, pos + len(span)))
        result[i] = (pos, pos + len(span))
    return result  # type: ignore[return-value]


def check_example(entry: str, bubbles: object, require_full_coverage: bool = True) -> tuple[list[dict] | None, str | None]:
    """Validate one example. Returns (canonical_bubbles, None) or (None, reason).

    Canonical form: texts in entry order within each bubble, bubbles ordered by
    their first text's position, and same-category neighbours within a sentence
    merged, so the model sees one consistent target for each entry.
    """
    if not isinstance(entry, str) or not entry.strip():
        return None, "empty entry"
    if not isinstance(bubbles, list) or not bubbles:
        return None, "no bubbles"

    seen_categories: set[str] = set()
    flat: list[tuple[str, str]] = []  # (category, span)
    for bubble in bubbles:
        if not isinstance(bubble, dict) or set(bubble) != {"category", "texts"}:
            return None, f"malformed bubble: {bubble!r}"
        category, texts = bubble["category"], bubble["texts"]
        if category not in CATEGORIES:
            return None, f"unknown category: {category!r}"
        if category in seen_categories:
            return None, f"duplicate category bubble: {category}"
        seen_categories.add(category)
        if not isinstance(texts, list) or not texts:
            return None, f"empty bubble: {category}"
        for text in texts:
            if not isinstance(text, str) or not text.strip():
                return None, f"empty text in {category}"
            if text != text.strip():
                return None, f"leading/trailing whitespace: {text!r}"
            if text not in entry:
                return None, f"not an exact substring: {text!r}"
            flat.append((category, text))

    positions = _locate(entry, [span for _, span in flat])
    if positions is None:
        return None, "spans overlap or reuse the same words"

    if require_full_coverage:
        covered = [False] * len(entry)
        for start, end in positions:
            covered[start:end] = [True] * (end - start)
        gap = "".join(ch for ch, c in zip(entry, covered) if not c)
        if _WORD.search(gap):
            return None, f"words left out of every bubble: {gap.strip()!r}"

    # Merge neighbouring same-category spans inside one sentence, so a sentence is
    # never chopped into pieces that all land in the same bubble.
    pieces = sorted((start, end, category) for (category, _), (start, end) in zip(flat, positions))
    merged: list[list] = []
    for start, end, category in pieces:
        if merged and merged[-1][2] == category:
            prev_end = merged[-1][1]
            between = entry[prev_end:start]
            if not re.search(r"[\w.!?…]", between) and not _SENTENCE_END.search(entry[merged[-1][0]:prev_end]):
                merged[-1][1] = end
                continue
        merged.append([start, end, category])

    by_category: dict[str, list[str]] = {}
    for start, end, category in merged:
        by_category.setdefault(category, []).append(entry[start:end])
    canonical = [{"category": c, "texts": texts} for c, texts in by_category.items()]  # first-appearance order
    return canonical, None


_SENTENCE = re.compile(r".+?(?:[.!?…]+(?=\s|$)|$)", re.S)


def _sentences(entry: str) -> list[tuple[int, int]]:
    """(start, end) of each sentence, whitespace trimmed."""
    spans = []
    for match in _SENTENCE.finditer(entry):
        start, end = match.span()
        while start < end and entry[start].isspace():
            start += 1
        while end > start and entry[end - 1].isspace():
            end -= 1
        if _WORD.search(entry[start:end]):
            spans.append((start, end))
    return spans


def repair_bubbles(entry: str, bubbles: object) -> list[dict] | None:
    """Turn a near-miss model reply into bubbles that pass check_example.

    The model's choices are kept wherever they are usable; the fixes are mechanical:
    - a span with stray whitespace or a small rewrite snaps to the closest sentence,
    - a span that repeats words already claimed loses the repeated part (first wins),
    - duplicate category bubbles merge, unknown categories become Other,
    - words left out join the bubble of the text right before them (or after, at the start).
    Returns None only when nothing in the reply can be placed in the entry.
    """
    from difflib import SequenceMatcher

    if not isinstance(bubbles, list):
        return None
    canonical, _ = check_example(entry, bubbles)
    if canonical is not None:  # already valid: leave the model's answer alone
        return canonical
    sentences = _sentences(entry)
    labels: list[str | None] = [None] * len(entry)
    for bubble in bubbles:
        if not isinstance(bubble, dict):
            continue
        category = bubble.get("category")
        category = category if category in CATEGORIES else "Other"
        texts = bubble.get("texts", bubble.get("text", []))
        for text in [texts] if isinstance(texts, str) else texts if isinstance(texts, list) else []:
            text = text.strip() if isinstance(text, str) else ""
            if not _WORD.search(text):
                continue
            start = entry.find(text)
            # prefer an occurrence whose words are not claimed yet
            while start != -1 and labels[start] is not None and entry.find(text, start + 1) != -1:
                start = entry.find(text, start + 1)
            if start != -1:
                end = start + len(text)
            else:
                scored = [(SequenceMatcher(None, text.lower(), entry[s:e].lower()).ratio(), s, e) for s, e in sentences]
                ratio, start, end = max(scored, default=(0.0, -1, -1))
                if ratio < 0.75:
                    continue
            for i in range(start, end):
                if labels[i] is None:
                    labels[i] = category

    if not any(labels):
        return None
    # fill gaps from the left neighbour, then a leading gap from the right
    last = None
    for i, label in enumerate(labels):
        last = labels[i] = label or last
    first = next(label for label in labels if label)
    labels = [label or first for label in labels]

    # cut into runs of one category, then at sentence ends, trimming whitespace
    pieces: list[tuple[str, str]] = []
    run_start = 0
    for i in range(1, len(entry) + 1):
        if i == len(entry) or labels[i] != labels[run_start]:
            run = entry[run_start:i]
            offset = run_start
            for match in _SENTENCE.finditer(run):
                text = match.group().strip()
                if _WORD.search(text):
                    pieces.append((labels[offset + match.start()], text))  # type: ignore[arg-type]
            run_start = i
    grouped: dict[str, list[str]] = {}
    for category, text in pieces:
        grouped.setdefault(category, []).append(text)
    canonical, _ = check_example(entry, [{"category": c, "texts": t} for c, t in grouped.items()])
    return canonical


def word_categories(entry: str, canonical: list[dict]) -> list[str | None]:
    """Category of each word in the entry, for valid (canonical) bubbles."""
    flat = [(b["category"], t) for b in canonical for t in b["texts"]]
    positions = _locate(entry, [t for _, t in flat]) or []
    labels: list[str | None] = [None] * len(entry)
    for (category, _), (start, end) in zip(flat, positions):
        labels[start:end] = [category] * (end - start)
    return [labels[m.start()] for m in re.finditer(r"\w+", entry)]


def to_chat_record(entry: str, bubbles: list[dict]) -> dict:
    return {"messages": [
        {"role": "user", "content": user_message(entry)},
        {"role": "assistant", "content": json.dumps({"bubbles": bubbles}, ensure_ascii=False)},
    ]}


def from_chat_record(record: dict) -> tuple[str, Any]:
    """Inverse of to_chat_record. Raises on malformed records. Bubbles are unvalidated."""
    user, assistant = record["messages"][0]["content"], record["messages"][1]["content"]
    prefix = f"{INSTRUCTION}\n\n"
    if not user.startswith(prefix):
        raise ValueError("user message does not start with the instruction")
    return user[len(prefix):], json.loads(assistant)["bubbles"]
