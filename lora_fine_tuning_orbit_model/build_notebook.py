"""Build orbit_colab.ipynb with the current source files embedded.

The notebook writes orbit_schema.py, script.py and export_litert.py into the Colab
runtime with %%writefile, so Drive only needs the dataset. Rebuild after editing
any of those files:

    py build_notebook.py
"""
import ast
import json
from pathlib import Path

HERE = Path(__file__).parent
EMBEDDED = ["orbit_schema.py", "script.py", "export_litert.py"]


def md(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(True)}


def code(text: str) -> dict:
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text.strip("\n").splitlines(True)}


def writefile(name: str) -> dict:
    """A %%writefile cell holding the file byte-for-byte (LF line endings)."""
    text = (HERE / name).read_text(encoding="utf-8").replace("\r\n", "\n")
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
            "source": f"%%writefile {name}\n{text}".splitlines(True)}


CELLS = [
    md("""
# Orbit: fine-tune Gemma 3 270M to sort journal entries into bubbles

This notebook is self-contained: it writes every source file it needs. Google Drive only has to hold the data:

```
MyDrive/orbit/dataset/orbit_bubbles_v3.train.jsonl
MyDrive/orbit/dataset/orbit_bubbles_v2.clean.val.jsonl
```

**Run:** Runtime → Change runtime type → **T4 GPU**, then Runtime → **Run all**.

Every output goes to `MyDrive/orbit/runs/<RUN_NAME>/` as it is produced: a checkpoint after each epoch, `eval.json`, the merged model and the `.litertlm` export. If Colab disconnects, reconnect and **Run all** again: finished steps are skipped and training resumes from the last epoch.

For a new experiment, change the settings in step 0 (at minimum `RUN_NAME`) and Run all.
"""),
    md("## 0. Settings"),
    code("""
RUN_NAME = 'orbit-lora-v3'     # new name = new run folder; same name = resume / reuse
FULL_FINETUNE = False          # True trains all 270M weights instead of a LoRA (then use LR = 5e-5)
EPOCHS = 5
RANK = 32                      # LoRA rank (ignored for full fine-tune)
LR = 2e-4
BATCH, GRAD_ACCUM = 4, 4       # 16 examples per step; fits a T4
TRAIN_FILE = 'orbit_bubbles_v3.train.jsonl'
VAL_FILE = 'orbit_bubbles_v2.clean.val.jsonl'   # keep fixed so runs are comparable
BASE_MODEL = 'unsloth/gemma-3-270m-it'          # ungated copy of google/gemma-3-270m-it
"""),
    md("## 1. Setup"),
    code("""
!nvidia-smi --query-gpu=name,memory.total --format=csv
import os, json
from google.colab import drive
drive.mount('/content/drive')
DATA = '/content/drive/MyDrive/orbit/dataset'
RUN = f'/content/drive/MyDrive/orbit/runs/{RUN_NAME}'
os.makedirs(RUN, exist_ok=True)
for name in (TRAIN_FILE, VAL_FILE):
    path = f'{DATA}/{name}'
    assert os.path.exists(path), f'Upload {name} to MyDrive/orbit/dataset/ first'
    print(f'{name}: {sum(1 for _ in open(path))} examples')
os.makedirs('/content/orbit', exist_ok=True)
%cd /content/orbit
!pip install -q -U "transformers==5.19.0" peft accelerate
"""),
    md("## 2. Source files\nGenerated from the repo by `build_notebook.py`; edit the repo files and rebuild rather than editing here."),
    *[writefile(name) for name in EMBEDDED],
    md("## 3. Train\nSkipped if this run already has a merged model. Resumes from the last checkpoint after a disconnect."),
    code("""
if os.path.exists(f'{RUN}/merged/model.safetensors') and os.path.exists(f'{RUN}/eval.json'):
    print(f'{RUN_NAME} is already trained; skipping. Use a new RUN_NAME to train again.')
else:
    mode = '--full' if FULL_FINETUNE else f'--rank {RANK}'
    !python script.py {mode} --train {DATA}/{TRAIN_FILE} --val {DATA}/{VAL_FILE} --out {RUN} --epochs {EPOCHS} --batch {BATCH} --grad-accum {GRAD_ACCUM} --lr {LR} --model {BASE_MODEL}
"""),
    md("## 4. Evaluation\n`usable_after_repair` is what the app will see; `word_category_accuracy` is how often words land in the same bubble as the reference labels."),
    code("""
def show_metrics(run_name, failures=8):
    metrics = json.load(open(f'/content/drive/MyDrive/orbit/runs/{run_name}/eval.json'))
    print(run_name, json.dumps({k: v for k, v in metrics.items() if k not in ('failures', 'predictions')}, indent=2))
    for failure in metrics['failures'][:failures]:
        print('---', failure['problem'])
        print(failure['entry'])
        print('>>', failure['reply'])
        print()

show_metrics(RUN_NAME)
"""),
    code("""
# Compare every finished run side by side
runs_dir = '/content/drive/MyDrive/orbit/runs'
keys = ['passes_rules', 'usable_after_repair', 'word_category_accuracy', 'exact_match', 'span_f1']
print(f"{'run':24}" + ''.join(f'{k[:14]:>16}' for k in keys))
for name in sorted(os.listdir(runs_dir)):
    path = f'{runs_dir}/{name}/eval.json'
    if os.path.exists(path):
        m = json.load(open(path))
        print(f'{name:24}' + ''.join(f"{m.get(k, float('nan')):>16.3f}" for k in keys))
"""),
    md("## 5. Export to `.litertlm`\nInt8 weights and a 1024-token context, matching the app's LiteRT-LM settings. Skipped if the export already exists."),
    code("""
import glob
if glob.glob(f'{RUN}/litert/**/*.litertlm', recursive=True):
    print('already exported:', glob.glob(f'{RUN}/litert/**/*.litertlm', recursive=True))
else:
    !pip install -q litert-torch
    # litert-lm-builder ships protobuf 7 generated code but does not pin protobuf, and the
    # install downgrades typing-extensions; bring both up to versions everything accepts.
    !pip install -q -U "protobuf>=7.35.1" "typing-extensions>=4.14.1"
    # litert-torch 0.9.4 needs Cache.get_max_cache_shape, which transformers removed in 5.20
    !pip install -q "transformers==5.19.0"
    !python export_litert.py --merged {RUN}/merged --out {RUN}/litert
"""),
    md("## 6. Try your own entry"),
    code("""
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from orbit_schema import user_message, repair_bubbles

tok = AutoTokenizer.from_pretrained(f'{RUN}/merged')
model = AutoModelForCausalLM.from_pretrained(f'{RUN}/merged', dtype=torch.float32).to('cuda').eval()

def sort_entry(entry):
    prompt = tok.apply_chat_template([{'role': 'user', 'content': user_message(entry)}], tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors='pt', add_special_tokens=False).to('cuda')
    out = model.generate(**ids, max_new_tokens=512, max_length=None, do_sample=False)
    reply = tok.decode(out[0, ids['input_ids'].shape[1]:], skip_special_tokens=True)
    try:
        bubbles = repair_bubbles(entry, json.loads(reply)['bubbles'])
    except (json.JSONDecodeError, KeyError, TypeError):
        bubbles = None
    print(entry)
    for bubble in bubbles or []:
        print(f"  {bubble['category']}: {bubble['texts']}")
    if bubbles is None:
        print('  (unusable reply)', reply)
    print()

sort_entry("long day at work and my back hurts. gotta call grandma tmrw its her birthday")
sort_entry("grateful for sunny days")
"""),
]


def main() -> None:
    for cell in CELLS:
        if cell["cell_type"] == "code":
            lines = "".join(cell["source"]).splitlines()
            if lines[0].startswith("%%writefile"):
                lines = lines[1:]
            # IPython lines (!cmd, %magic) are not Python; replace them with `pass` to keep indentation valid
            src = "\n".join(l[: len(l) - len(l.lstrip())] + "pass" if l.lstrip().startswith(("!", "%")) else l for l in lines)
            ast.parse(src)
    notebook = {
        "cells": CELLS,
        "metadata": {"accelerator": "GPU", "colab": {"provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"}},
        "nbformat": 4,
        "nbformat_minor": 0,
    }
    out = HERE / "orbit_colab.ipynb"
    out.write_text(json.dumps(notebook, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out.name}: {len(CELLS)} cells, embedded {', '.join(EMBEDDED)}")


if __name__ == "__main__":
    main()
