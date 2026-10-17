"""Generate synthetic Orbit journal entries with DeepSeek.

Every example passes orbit_schema.check_example before it is written, so the
output file only ever contains valid records. Re-running resumes toward --target.

    py generate.py --dry-run            # print one request, no API call
    py generate.py --target 20          # small paid test
    py generate.py --target 2000
"""
import argparse
import json
import os
import random
import re
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from orbit_schema import CATEGORIES, check_example, from_chat_record, to_chat_record

HERE = Path(__file__).parent


class FatalAPIError(Exception):
    """Auth, balance, or request errors that retrying will not fix."""
API_URL = "https://api.deepseek.com/chat/completions"

LENGTHS = [  # (label, instruction, weight, max topics)
    ("tiny", "2 to 5 words, no more", 0.20, 1),
    ("short", "one short line, under 20 words", 0.25, 2),
    ("medium", "2 to 4 sentences", 0.35, 3),
    ("long", "5 to 7 sentences", 0.20, 4),
]
TOPIC_WEIGHTS = {1: 0.35, 2: 0.35, 3: 0.20, 4: 0.10}
# --multi-topic: more of the long, mixed entries the model gets wrong
MULTI_LENGTH_WEIGHTS = {"tiny": 0.05, "short": 0.15, "medium": 0.45, "long": 0.35}
MULTI_TOPIC_WEIGHTS = {1: 0.15, 2: 0.35, 3: 0.30, 4: 0.20}
STYLES = [
    "all lowercase with little or no punctuation",
    "one long run-on sentence joined with and / so / but",
    "a few typos and dropped apostrophes (im, dont, cant, thats)",
    "texting shorthand (tmrw, idk, bc, rn, ngl, smh)",
    "fragments instead of full sentences",
    "jumps topic mid-sentence without a full stop",
    "trails off with ... or repeats a word for emphasis",
    "one or two words in CAPS for emphasis",
    "includes one emoji",
    "no full stop at the very end",
]
PERSONAS = [
    "university student in Accra", "nurse on night shifts", "new mum with a baby", "retired teacher",
    "high school senior", "international student far from home", "small shop owner", "software developer",
    "uber driver", "pastor's kid", "single dad of two", "junior accountant", "aspiring musician",
    "football-obsessed teenager", "graduate looking for a job", "newlywed", "someone caring for a sick parent",
    "warehouse worker", "medical student", "freelance designer", "teacher in a rural school", "hairdresser",
    "soldier back home on leave", "chef at a busy restaurant", "person recovering from a breakup",
    "grandmother who just got a smartphone", "remote worker who lives alone", "secondary school teacher",
    "someone who just moved to a new city", "nursing mother back at work", "market trader", "PhD student",
]


def load_env() -> None:
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def few_shot() -> str:
    lines = []
    for line in (HERE / "orbit_samples.jsonl").read_text(encoding="utf-8").splitlines():
        entry, bubbles = from_chat_record(json.loads(line))
        lines.append(json.dumps({"entry": entry, "bubbles": bubbles}, ensure_ascii=False))
    return "\n".join(lines)


def system_prompt() -> str:
    categories = "\n".join(f"- {name}: {desc}" for name, desc in CATEGORIES.items())
    return f"""You write realistic, messy phone journal entries and label them for a dataset.

Each example is a raw journal entry plus "bubbles": the entry's own text split into categories.

Categories (use these exact names, nothing else):
{categories}

Labeling rules - every rule is checked by code and failing examples are thrown away:
1. Bubble texts are copied character-for-character from the entry: same case, typos, punctuation, spacing. Never summarize, fix, or rewrite.
2. Each text is one contiguous piece of the entry: a whole sentence or a clause. Split a sentence at a comma or conjunction when its parts belong to different categories.
3. Every word of the entry ends up in exactly one bubble text. No overlaps, nothing left out.
4. Each text goes to one category. A category can hold several texts. One bubble per category.
5. Only include categories that actually appear. A one-topic entry gets one bubble.
6. Pick the single best category for each piece by what it is about. Use "Other" only when nothing fits.
7. Keep a clause whole: a reason or result ("bc ...", "so ...", "which ...") stays with the clause it belongs to. Do not split a sentence into pieces that all go to the same category.

How to choose between close categories:
- The topic wins over the emotion: "nervous about my exam" is School, "rent stresses me out" is Money.
- Worries is for what-ifs and fears about something that might happen; Feelings is for a mood with no clearer topic.
- Self-Reflection is the writer thinking about themselves; Feelings is just naming the emotion.
- The writer's own job is Work, even at a school (a teacher marking papers is Work). School is for the writer's own studies.
- Sports, teams, and games played for fun are Hobbies & Creativity; an injury from them is Health & Body.
- Missing someone who died is Grief & Loss, even when it mentions their belongings.

Writing rules:
- Entries sound like a real person typing quickly on a phone, first person, specific and concrete (names, places, days, amounts).
- Length and style are strict requirements, not suggestions. A tiny entry really is 2 to 5 words. A messy style really is messy: if it says lowercase, write no capitals; if it says typos or shorthand, use several; if it says run-on, use no full stops. Do not tidy the writing.
- The topics are a guide; labels must match what you actually wrote.
- Vary openings, vocabulary, and names. No two entries should feel alike. Avoid starting with "Today".

Good examples (one per line):
{few_shot()}

Return json only, shaped exactly like:
{{"examples": [{{"entry": "...", "bubbles": [{{"category": "...", "texts": ["..."]}}]}}]}}"""


class State:
    def __init__(self, out: Path, rejects: Path, target: int):
        self.out, self.rejects, self.target = out, rejects, target
        self.lock = threading.Lock()
        self.seen: set[str] = set()
        self.category_counts: Counter[str] = Counter()
        self.kept = self.rejected = self.prompt_tokens = self.completion_tokens = 0
        self.fatal: str | None = None
        if out.exists():
            for line in out.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    entry, bubbles = from_chat_record(json.loads(line))
                    self._record(entry, bubbles)

    def _record(self, entry: str, bubbles: list[dict]) -> None:
        self.seen.add(normalize(entry))
        self.category_counts.update(b["category"] for b in bubbles)
        self.kept += 1

    def done(self) -> bool:
        return self.kept >= self.target or self.fatal is not None

    def add(self, raw: dict) -> None:
        entry, bubbles = raw.get("entry"), raw.get("bubbles")
        canonical, reason = check_example(entry, bubbles) if isinstance(entry, str) else (None, "missing entry")
        with self.lock:
            if canonical is not None and normalize(entry) in self.seen:
                canonical, reason = None, "duplicate entry"
            if canonical is None or self.done():
                if canonical is None:
                    self.rejected += 1
                    with self.rejects.open("a", encoding="utf-8") as f:
                        f.write(json.dumps({"reason": reason, "example": raw}, ensure_ascii=False) + "\n")
                return
            self._record(entry, canonical)
            with self.out.open("a", encoding="utf-8") as f:
                f.write(json.dumps(to_chat_record(entry, canonical), ensure_ascii=False) + "\n")

    def pick_categories(self, rng: random.Random, k: int) -> list[str]:
        """Favour categories that are under-represented so far."""
        with self.lock:
            pool = {c: (0.3 if c == "Other" else 1.0) / (1 + self.category_counts[c]) for c in CATEGORIES}
        chosen = []
        for _ in range(k):
            names = list(pool)
            choice = rng.choices(names, weights=[pool[n] for n in names])[0]
            chosen.append(choice)
            del pool[choice]
        return chosen


def normalize(entry: str) -> str:
    return re.sub(r"\W+", " ", entry.lower()).strip()


def batch_request(state: State, rng: random.Random, size: int, multi_topic: bool = False) -> str:
    length_weights = [MULTI_LENGTH_WEIGHTS[l[0]] if multi_topic else l[2] for l in LENGTHS]
    topic_weights = MULTI_TOPIC_WEIGHTS if multi_topic else TOPIC_WEIGHTS
    specs = []
    for i in range(size):
        label, length, _, max_topics = rng.choices(LENGTHS, weights=length_weights)[0]
        topics = min(max_topics, rng.choices(list(topic_weights), weights=list(topic_weights.values()))[0])
        style = "clean, normal punctuation" if rng.random() < 0.25 else "; ".join(rng.sample(STYLES, rng.choice([1, 2])))
        specs.append(f"{i + 1}. writer: {rng.choice(PERSONAS)} | length: {length} | style: {style} | topics: {', '.join(state.pick_categories(rng, topics))}")
    return f"Write {size} examples, one per spec, in this order:\n" + "\n".join(specs)


def call_deepseek(api_key: str, args: argparse.Namespace, system: str, user: str) -> tuple[str, dict]:
    payload = {
        "model": args.model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "max_tokens": 16000,
    }
    if args.thinking:  # better labels, slower; temperature is ignored in thinking mode
        payload |= {"thinking": {"type": "enabled"}, "reasoning_effort": "low"}
    else:
        payload |= {"thinking": {"type": "disabled"}, "temperature": args.temperature}
    body = json.dumps(payload).encode()
    request = urllib.request.Request(API_URL, data=body, headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data = json.loads(response.read())
            content = data["choices"][0]["message"]["content"] or ""
            if content.strip():
                return content, data.get("usage", {})
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 402, 403):
                raise FatalAPIError(f"DeepSeek error {error.code}: {error.read().decode(errors='replace')}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
            pass
        time.sleep(2 ** attempt + random.random())
    raise RuntimeError("DeepSeek request failed after 5 attempts")


def worker(state: State, args: argparse.Namespace, api_key: str, system: str, seed: int) -> None:
    rng = random.Random(seed)
    while not state.done():
        try:
            content, usage = call_deepseek(api_key, args, system, batch_request(state, rng, args.batch, args.multi_topic))
            examples = json.loads(content).get("examples", [])
        except FatalAPIError as error:
            state.fatal = str(error)
            return
        except (RuntimeError, json.JSONDecodeError, AttributeError) as error:
            print(f"batch failed: {error}")
            continue
        with state.lock:
            state.prompt_tokens += usage.get("prompt_tokens", 0)
            state.completion_tokens += usage.get("completion_tokens", 0)
        for raw in examples if isinstance(examples, list) else []:
            if isinstance(raw, dict):
                state.add(raw)
        print(f"kept {state.kept}/{state.target}  rejected {state.rejected}  "
              f"tokens in/out {state.prompt_tokens}/{state.completion_tokens}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=2000)
    parser.add_argument("--out", type=Path, default=HERE.parent / "dataset" / "orbit_bubbles_v2.jsonl")
    parser.add_argument("--batch", type=int, default=10, help="examples per request")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--model", default="deepseek-flash")
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--thinking", action="store_true", help="let DeepSeek reason before labeling")
    parser.add_argument("--multi-topic", action="store_true", help="favour longer entries with 2-4 topics")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    state = State(args.out, args.out.with_suffix(".rejects.jsonl"), args.target)
    system = system_prompt()
    if args.dry_run:
        print(system, "\n\n--- user ---\n", batch_request(state, random.Random(args.seed), args.batch, args.multi_topic))
        return

    load_env()
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise SystemExit("Set DEEPSEEK_API_KEY in lora_fine_tuning_orbit_model/.env")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    print(f"resuming with {state.kept} existing examples" if state.kept else "starting fresh")

    seed = args.seed * 1000 + state.kept  # new specs on every resume
    # No more workers than batches still needed, so little is generated past the target.
    workers = max(1, min(args.workers, -(-(args.target - state.kept) // args.batch)))
    with ThreadPoolExecutor(workers) as pool:
        futures = [pool.submit(worker, state, args, api_key, system, seed + i) for i in range(workers)]
        for future in futures:
            future.result()  # surface unexpected worker crashes
    if state.fatal:
        raise SystemExit(state.fatal)
    print(f"\ndone: {state.kept} examples in {args.out}, {state.rejected} rejected (see {state.rejects.name})")


if __name__ == "__main__":
    main()
