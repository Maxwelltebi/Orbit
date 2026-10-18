# Orbit sorter: LoRA fine-tuning of Gemma 3 270M

**Status: parked (2026-10-17).** Kept for reference. The pipeline works end to end, from synthetic data through training and export to running on the tablet, but category accuracy on long, many-topic entries was not good enough. See [Why we stopped](#why-we-stopped) and [Ideas for next time](#ideas-for-next-time).

## Contents

- [Goal](#goal)
- [Data](#data)
- [Training](#training)
- [Results](#results)
- [Export and on-device runs](#export-and-on-device-runs)
- [Problems hit and how they were fixed](#problems-hit-and-how-they-were-fixed)
- [Why we stopped](#why-we-stopped)
- [Ideas for next time](#ideas-for-next-time)
- [How to reproduce](#how-to-reproduce)
- [Files](#files)

## Goal

Turn a raw phone journal entry into category "bubbles" on the device, with no network. One training example is a pair:

- **Input:** the instruction `Sort this journal entry into category bubbles. Use only the writer's exact words. Return JSON.`, a blank line, then the entry.
- **Output:** `{"bubbles": [{"category": "...", "texts": ["...", "..."]}]}`

The rules every example must follow, enforced by code (`orbit_schema.check_example`):

1. **Exact words only.** Every text is an exact substring of the entry, with the same case, typos and punctuation, and no leading or trailing whitespace.
2. **Nothing left out.** Every word of the entry is in some bubble. Punctuation between spans may be skipped.
3. **No overlap.** Spans don't overlap, and each span belongs to one category. A category can hold several spans, and there is one bubble per category.
4. **Only categories that appear.** A one-line entry gets one bubble.

The canonical form keeps texts in entry order and orders bubbles by first appearance. Neighbouring same-category spans inside one sentence are merged, so every entry has one consistent target.

### The 17 categories

These merge the original sample set with the app's former 51-label catalogue.

| Category | Covers |
|---|---|
| Work | job, boss, coworkers, shifts, career, job hunting |
| School | classes, exams, homework, grades, lecturers, school fees |
| Money | rent, bills, spending, saving, debt, salary, prices |
| Family | parents, siblings, relatives, own children, parenting, caring for family |
| Relationships | romantic partner, dating, crushes, breakups, marriage |
| Friends | friends, social life, fitting in, feeling left out by friends |
| Health & Body | sickness, pain, sleep, exercise, food and eating, body image, energy |
| Feelings | present emotions stated as feelings |
| Worries | what-ifs, anxiety, fear about things that might happen |
| Self-Reflection | self-talk, self-esteem, identity, weighing decisions, values |
| Goals & Plans | intentions, resolutions, habits, things to learn, future plans |
| Gratitude | thankfulness, appreciation |
| Hobbies & Creativity | music, art, writing, sports for fun, games, shows |
| Faith & Spirituality | church, mosque, prayer, God, meditation |
| Daily Life | chores, errands, groceries, home, commute |
| Grief & Loss | death, mourning, missing someone who died |
| Other | anything that clearly fits nothing else |

## Data

All data is synthetic, generated with DeepSeek (`generate.py`) and filtered by the rules above. Every file in `dataset/` passes `validate.py`.

### How it was generated

- **API:** `deepseek-flash` (DeepSeek V4.1 Flash) in JSON mode through the OpenAI-format API, run locally with the key in `.env` as `DEEPSEEK_API_KEY`.
- **Prompt:** each request asks for 10 examples. Every example gets its own spec: a writer persona (32 options), a length, a messiness style (10 options, such as lowercase, run-ons, typos, shorthand or emoji), and 1–4 target topics.
  - **Category balance:** topics are weighted toward categories that are under-represented so far.
  - **Examples:** the 9 hand-written samples (`orbit_samples.jsonl`) are included as examples.
  - **Labeling rules:** the system prompt lists the rules plus guidance for close categories: topic over emotion, a teacher marking papers is Work, sports are Hobbies, and so on.
- **Filtering:** each returned example is validated, canonicalized and deduplicated. Rejects go to `*.rejects.jsonl` with the reason.

### Plain mode versus thinking mode

Measured on 30 examples each:
- **Plain mode** (`--temperature 1.0`) followed the style specs well. However, labels were sloppier: whole sentences went to the wrong category, and reason clauses were split off ("praying abt it bc").
- **Thinking mode** (`--thinking`, low effort) gave clearly better labels and 0 rejects. It wrote tidier, longer entries until the length and style rules in the prompt were made strict.
- **Thinking mode was used for everything after the comparison.**

### Datasets

| File | Examples | What it is |
|---|---|---|
| `orbit_thoughts_dataset_v1.jsonl` | 280 | Older, different format (one rewritten "thought" per input). Not used for training. |
| `try_thinking.jsonl` | 30 | Thinking-mode pilot, also the first 30 of v2 |
| `orbit_bubbles_v2.jsonl` | 3,471 | Every generated example: 2,000 with the default mix, plus 1,471 with `--multi-topic` (longer entries, 2–4 topics). That second run stopped when the DeepSeek balance ran out. |
| `orbit_bubbles_v2.rejects.jsonl` | 28 | Generation rejects with reasons (mostly duplicates) |
| `orbit_bubbles_v2.clean.train.jsonl` | 1,800 | v2 run training split (90% of the first 2,000) |
| `orbit_bubbles_v2.clean.val.jsonl` | 200 | **Fixed validation set** used for every run |
| `orbit_bubbles_v3.train.jsonl` | 3,271 | All of v2 minus the 200 validation entries |
| `orbit_brain_dumps.train.jsonl` | 1,500 | 2–5 unrelated single-topic training entries joined into one (see below) |
| `orbit_brain_dumps.val.jsonl` | 100 | Same, built only from validation entries |
| `orbit_bubbles_v4_continue.train.jsonl` | 3,000 | 1,500 brain dumps + 1,500 replayed v3 examples |

**v3 training set:** each category has 377–415 bubbles (Other 219). By length, 13% of entries are 1–5 words, 22% are 6–20, 38% are 21–50 and 27% are over 50. 35% of entries have one category.

**Brain dumps** (`build_brain_dumps.py`, no API cost): the DeepSeek entries are mostly flowing narrative, where neighbouring sentences share a topic. So the model learned to lump neighbours together, and it failed on lists of unrelated thoughts like "I miss my sister. My exams are next week. I want to learn to paint."
- **How they're built:** single-category entries of 25 words or fewer are joined in groups of 2–5 from different categories, separated by a space, two spaces or a line break. The labels stay exact.
- **Limitation:** only 707 training pieces existed, so each one appears in about 7 brain dumps.

### Cost

About $4 of DeepSeek credit in total, which was the whole balance:
- **Pilots:** about $0.05.
- **2,000 thinking examples:** 1.29M output and 463K input tokens. That's about $0.85 at the off-peak rate.
- **1,471 multi-topic examples:** long entries with reasoning cost far more per example, and this run used up the rest of the balance.

## Training

`script.py` uses Hugging Face Transformers and PEFT, with a plain `Trainer` (no TRL).

- **Base model:** `unsloth/gemma-3-270m-it`, an ungated copy of `google/gemma-3-270m-it`, so no token is needed.
- **Prompt format:** Gemma's chat template. The loss counts only the assistant reply; prompt tokens are masked.
- **LoRA:** applied to all linear layers, `alpha = 2 × rank`, dropout 0.05.
- **Batch:** micro-batch 4 × gradient accumulation 4, for 16 examples per step. Gemma's 262K-token vocabulary makes the logits huge, so larger micro-batches run out of memory. At 4 × 255 tokens the logits alone are about 1 GB in fp32.
- **Schedule:** cosine, about 5% warmup, evaluation and checkpoints every epoch, and the best epoch by validation loss is kept.
- **Precision:** bf16 on a Colab T4 (PyTorch reports bf16 as supported), fp32 on CPU.
- **Outputs, written straight to Google Drive:** `adapter/` (LoRA only), `merged/` (LoRA folded into the base weights), and `eval.json` (metrics, failures, all predictions). Training resumes from the last checkpoint after a Colab disconnect.
- **Options:** `--init-adapter` continues an existing LoRA, `--full` trains all weights instead of a LoRA, and `--extra-val` scores a second validation set.

`orbit_colab.ipynb` is self-contained: it writes `orbit_schema.py`, `script.py` and `export_litert.py` with `%%writefile`, so Drive only needs the data. Rebuild it with `py build_notebook.py` after editing those files.

### Runs

| Run | Start from | Train data | Rank | Epochs | LR | T4 time |
|---|---|---|---|---|---|---|
| CPU smoke tests | base / smoke adapter | 32-example slices | 8 | 10 steps | 2e-4 | 4–9 min on CPU |
| v2 (run 1) | base | v2 clean train, 1,800 | 16 | 3 | 2e-4 | ~13 min |
| v3 (`orbit-lora-v3`) | base | v3 train, 3,271 | 32 | 5 | 2e-4 | ~40 min |
| v4 (`orbit-lora-v4-continue`) | v3 adapter | v4 continue mix, 3,000 | 32 | 2 | 1e-4 | ~13 min |

Validation loss in run 1 was 0.094, 0.076 and 0.070 over the 3 epochs, still falling, with no overfitting. Token loss looks tiny because most tokens are copied text; the hard decisions (category names and where to split) are only a few tokens.

## Results

### What the metrics mean

- **`valid_json`:** the reply parses as JSON.
- **`passes_rules`:** the raw reply follows every rule.
- **`usable_after_repair`:** valid after `repair_bubbles`, which is what the app shows.
- **`word_category_accuracy`:** the share of words placed in the same category as the reference labels. This is the fairest measure of category choice.
- **`exact_match`:** the whole set of bubbles matches the reference exactly.
- **`span_f1`:** matches both span boundaries and category. Harsh, because a different but reasonable split counts as wrong.

### Normal validation set (200 entries)

| Run | valid_json | passes_rules | usable_after_repair | word_category_accuracy | exact_match | span_f1 |
|---|---|---|---|---|---|---|
| v2 (run 1) | 100% | 84.5% | (not measured) | (not measured) | 35.0% | 0.48 |
| v3 | 99.5% | 91.5% | 99.5% | **67.0%** | 44.5% | **0.58** |
| v4 | 100% | 87.5% | **100%** | 65.1% | 45.0% | 0.54 |

### Brain-dump validation set (100 entries)

| Run | passes_rules | word_category_accuracy | exact_match | span_f1 |
|---|---|---|---|---|
| v3 | 66% | 52.5% | 8% | 0.37 |
| v4 | **87%** | **78.3%** | **33%** | **0.68** |

Continuing from v3 on brain dumps mixed with replayed v3 data gained 26 points on brain dumps and lost about 2 points on normal entries.

### Typical failures

Repair fixes all of these mechanically:
- the same sentence placed in two bubbles
- the same category appearing twice
- a sentence dropped
- a one-letter slip ("hadt", "pray" for "praying", "sang" for "sing")
- invented categories, mostly before training converged ("Self-Suffered", "Work/Life")

## Export and on-device runs

`export_litert.py` calls `litert_torch.generative.export_hf` from `litert-torch` 0.9.4 on `merged/`, with these settings:
- int8 weights (`dynamic_wi8_afp32`)
- a 1024-token context, with prefill lengths 256 and 512
- the Gemma template bundled from the tokenizer

Result: a `.litertlm` of 291,388,912 bytes, built in about 4.5 minutes on Colab.

**Model files:**
- **This computer:** `D:\Stone\SWE\Machine_Learning_Models\orbit-sorter-v3.litertlm` and `orbit-sorter-v4.litertlm`.
- **Google Drive:** `MyDrive/orbit/runs/<run>/litert/`.
- **The tablet** (Lenovo TB330XU, Orbit development build): both models are in `files/models/`. The raw Gemma model was removed.

**App side:** the On-device AI screen (`src/app/ai.tsx`) lists every `orbit-sorter-*.litertlm` on the device. It sends the exact training prompt with greedy decoding and up to 640 output tokens, then validates and repairs with `src/services/orbit-bubbles.ts`, a TypeScript port of `orbit_schema.py` checked by `scripts/test-orbit-bubbles.cjs` against `make_parity_fixture.py`. The details are in `docs/on-device-classification.md`.

`orbit-bubbles.ts` also has `sorterWindows`, `sortInWindows` and `readSorterWindows`, for sorting long entries about 3 sentences at a time. They are tested, but **not wired into the app**.

### On the tablet

| Test | Model | Result |
|---|---|---|
| Six unrelated sentences (sister, assignment, exams, paint, sleep, parents) | v3 | **9.9 s total** (4.0 s load, 5.7 s generation, first token 1.8 s), 675 MiB, valid without repair. Only 3 of 6 categories right: it grouped neighbouring sentences. The unquantized model in Colab made the same mistakes, so int8 wasn't the cause. |
| Ten varied test entries (lists, run-ons, short, flowing, tricky categories) | v4 | Performed well on all of them, per the user's testing |
| Long messy end-of-day entry (11 sentences, about 9 topics) | v4 | **Everything in one Work bubble** |
| Same entry | v3 | 4 bubbles, but only after repair. The raw reply dropped three sentences and invented text ("wednesday woke up…", a fake final sentence), and repair then put the gaps into Work. |

LiteRT structured output (a JSON schema restricting `category` to the 17 names) **crashes** inside LiteRT's grammar engine on the `&` in "Grief & Loss" ("ParserTooComplex"). It would also force compact JSON that differs from the training format, so the app uses free output plus repair.

## Problems hit and how they were fixed

| Problem | Fix |
|---|---|
| CPU smoke test segfaulted in the backward pass (out of RAM; the 262K-vocab logits are huge) | Micro-batch 4 × accumulation 4 (smoke test: 1 × 4) |
| Colab disconnected and the trained model was lost (outputs were on the Colab disk) | Write all outputs straight to Drive, auto-resume from checkpoints, skip finished steps |
| DeepSeek dropped a connection and the retry loop didn't catch it (`RemoteDisconnected`) | Catch `OSError` and `HTTPException`, then resume generation (it resumes from the output file) |
| DeepSeek `402 Insufficient Balance` | Generation stops cleanly on fatal errors. Stopped at 3,471 examples. |
| Export failed: protobuf runtime 6.33 older than the 7.35 generated code in `litert_lm_builder` | `pip install -U "protobuf>=7.35.1" "typing-extensions>=4.14.1"` after installing litert-torch |
| Export failed: `'LiteRTLMCache' object has no attribute 'get_max_cache_shape'` (removed in transformers 5.20) | Pin `transformers==5.19.0` |
| `!python` failures didn't stop Colab's Run all, which led to misleading errors later | Train and export cells raise if `_exit_code != 0` |
| Edited `%%writefile` cells weren't rerun, so Colab ran an old `script.py` | Check with `!grep` after editing; rebuild the notebook from source |
| Python `difflib` "autojunk" changed similarity on strings over 200 characters, so repair differed from the TypeScript port | `SequenceMatcher(..., autojunk=False)` |

## Why we stopped

The generative approach asks one 270M model to do two jobs at once: **copy the entry back word for word** (most of the output tokens) and **choose a category** for each piece (a few tokens).

- **Copying is the weak spot.** It's where the invented words and dropped sentences come from, and it's why long entries are slow.
- **Many topics overwhelm the model.** Entries with 5 or more categories are about 1% of the training data, so on long many-topic entries the model collapses to one or two bubbles.
- **More of the same has diminishing returns.** More data, epochs and continued training each helped one area and cost another. Credit and Colab time ran out before a clear win.

## Ideas for next time

1. **Split with code, classify with a small model** (recommended to try first):
   - **Splitting:** rules split the entry into sentences and clauses, so exact words are guaranteed by construction.
   - **Classifying:** a small classifier labels each piece, either a sentence-embedding model with a linear classifier on top or a small fine-tuned encoder of about 20–100M parameters. Neighbouring same-category pieces merge. The previous sentence can be given as context.
   - **Data:** the roughly 11,000 labelled spans in `orbit_bubbles_v2.jsonl` (11,247) are ready-made training data.
   - **Cost:** it trains on CPU in minutes and runs in milliseconds per sentence. It does need an ONNX or TFLite runtime in the app.
   - **Test first offline:** score it with the same `word_category_accuracy` on the fixed 200 + 100 validation sets against v3 (67% / 52.5%) and v4 (65.1% / 78.3%).
2. **Chunked sorting with v4:** sort about 3 sentences at a time. This is already written in `orbit-bubbles.ts` but not wired in.
3. **A bigger on-device generative model** (Gemma 3 1B, Qwen 0.6–1.7B): better categories, but about 3–4× slower and more RAM on a 4 GB tablet, and the copying problem remains.
4. **Fewer, clearer categories:** Feelings, Worries and Self-Reflection overlap, and even the reference labels are inconsistent between them.
5. **A v5 with longer brain dumps** (5–10 thoughts) if the generative approach is revived.

## How to reproduce

```powershell
cd lora_fine_tuning_orbit_model
py -m venv .venv
.venv\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r requirements.txt

py generate.py --dry-run                         # inspect the DeepSeek prompt
py generate.py --target 2000 --thinking          # needs DEEPSEEK_API_KEY in .env
py validate.py dataset/orbit_bubbles_v2.jsonl --out dataset/orbit_bubbles_v2.clean.jsonl --split 0.1
py validate.py dataset/orbit_bubbles_v2.jsonl --out dataset/orbit_bubbles_v3.train.jsonl --exclude dataset/orbit_bubbles_v2.clean.val.jsonl
py build_brain_dumps.py                          # brain dumps + v4 continue mix
.venv\Scripts\python script.py --smoke --model unsloth/gemma-3-270m-it   # CPU pipeline check
py build_notebook.py                             # then train and export in Colab
py make_parity_fixture.py                        # after changing orbit_schema.py repair logic
```

Colab: upload the data files to `MyDrive/orbit/dataset/`, open `orbit_colab.ipynb` on a T4, set step 0 (run name, start-from adapter, files) and choose Run all.

Copying a model to the tablet: see `docs/on-device-classification.md`.

## Files

| File | Purpose |
|---|---|
| `orbit_schema.py` | Instruction, categories, rules check, canonical form, `repair_bubbles`, `word_categories`, `.env` loader |
| `generate.py` | DeepSeek data generator (resumable; `--thinking`, `--multi-topic`, `--dry-run`) |
| `validate.py` | Re-check, deduplicate, report stats, split, `--exclude` a fixed validation set |
| `build_brain_dumps.py` | Brain-dump examples and the v4 continue mix |
| `script.py` | Training, evaluation, merge (LoRA, `--init-adapter`, `--full`, `--extra-val`, `--smoke`) |
| `export_litert.py` | Merged model to `.litertlm` |
| `build_notebook.py` / `orbit_colab.ipynb` | Self-contained Colab pipeline |
| `make_parity_fixture.py` | Fixture for the app's TypeScript repair port |
| `orbit_samples.jsonl` | The 9 hand-written seed examples |
| `requirements.txt` | Local CPU packages (install torch from the CPU index first) |
| `dataset/` | All data (see [Datasets](#datasets)) |
| `runs/` (gitignored) | Local smoke-test outputs |
| `.env` (gitignored) | `DEEPSEEK_API_KEY` |
