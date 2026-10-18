"""Generate the Python-vs-TypeScript parity fixture for the app's bubble repair.

Takes real validation entries, breaks their bubbles the ways the model broke them
(dropped, repeated, whitespace, typo, unknown category, ...), and records what
orbit_schema.repair_bubbles returns. scripts/test-orbit-bubbles.cjs checks that
src/services/orbit-bubbles.ts gives identical results.

    py make_parity_fixture.py            # writes ../scripts/fixtures/orbit-bubbles-parity.json
"""
import copy
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from orbit_schema import from_chat_record, repair_bubbles, check_example
rng = random.Random(7)
rows = [from_chat_record(json.loads(l)) for l in open(Path(__file__).parent / "dataset" / "orbit_bubbles_v2.clean.val.jsonl", encoding="utf-8")]
cases = []
def add(entry, bubbles, kind):
    valid, _ = check_example(entry, bubbles)
    cases.append({"kind": kind, "entry": entry, "bubbles": bubbles, "valid": valid is not None, "repaired": repair_bubbles(entry, bubbles)})
for entry, gold in rows[:80]:
    add(entry, gold, "gold")
    flat = [(b["category"], t) for b in gold for t in b["texts"]]
    if len(flat) > 1:  # drop a span
        b = copy.deepcopy(gold); i = rng.randrange(len(b)); b[i]["texts"].pop(rng.randrange(len(b[i]["texts"])))
        add(entry, [x for x in b if x["texts"]], "dropped")
        b = copy.deepcopy(gold); b[-1]["texts"].append(flat[0][1]); add(entry, b, "repeated")
        b = copy.deepcopy(gold); b.append({"category": b[0]["category"], "texts": [b[0]["texts"].pop()]}) if len(b[0]["texts"]) > 1 else None
        add(entry, [x for x in b if x["texts"]], "duplicate-category")
    b = copy.deepcopy(gold); b[0]["texts"][0] = " " + b[0]["texts"][0]; add(entry, b, "whitespace")
    b = copy.deepcopy(gold); t = b[0]["texts"][0]
    if len(t) > 12:
        k = rng.randrange(3, len(t) - 3); b[0]["texts"][0] = t[:k] + t[k + 1:]; add(entry, b, "typo")
    b = copy.deepcopy(gold); b[0]["category"] = "Self-Suffered"; add(entry, b, "unknown-category")
    b = copy.deepcopy(gold); b[0] = {"category": b[0]["category"], "text": b[0]["texts"][0]}; add(entry, b, "text-key")
add("grateful for sunny days.", [{"category": "Writing", "writer": "The Writer"}], "unplaceable")
add("cant sleep again", [{"category": "Sleep", "text": "cant sleep again"}], "string-text")
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "scripts" / "fixtures" / "orbit-bubbles-parity.json"
json.dump(cases, out.open("w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(cases), "cases;", sum(c["repaired"] is None for c in cases), "unrepairable")
