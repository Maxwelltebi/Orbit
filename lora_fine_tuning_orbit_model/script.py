"""LoRA fine-tune Gemma 3 270M to sort journal entries into Orbit bubbles.

Local smoke test (CPU, a few steps on the samples, checks the whole pipeline):
    .venv/Scripts/python script.py --smoke

Full run (Colab GPU):
    python script.py --train ../dataset/orbit_bubbles_v2.clean.train.jsonl --val ../dataset/orbit_bubbles_v2.clean.val.jsonl

Outputs in --out: adapter/ (LoRA weights), merged/ (full model for LiteRT export),
eval.json (generation metrics on the validation set).
"""
import argparse
import json
import math
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

from generate import load_env
from orbit_schema import check_example, from_chat_record, repair_bubbles, word_categories

HERE = Path(__file__).parent
IGNORE = -100


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def encode(tokenizer, record: dict, max_len: int) -> dict | None:
    """Tokenize with Gemma's chat template; loss only on the assistant reply."""
    prompt = tokenizer.apply_chat_template(record["messages"][:1], tokenize=False, add_generation_prompt=True)
    full = tokenizer.apply_chat_template(record["messages"], tokenize=False)
    if not full.startswith(prompt):
        raise ValueError("chat template prompt is not a prefix of the full conversation")
    prompt_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(full, add_special_tokens=False)["input_ids"]
    if len(full_ids) > max_len:
        return None
    return {"input_ids": full_ids, "labels": [IGNORE] * len(prompt_ids) + full_ids[len(prompt_ids):]}


class Collator:
    def __init__(self, pad_id: int):
        self.pad_id = pad_id

    def __call__(self, batch: list[dict]) -> dict:
        width = max(len(item["input_ids"]) for item in batch)
        pad = lambda seq, value: seq + [value] * (width - len(seq))
        return {
            "input_ids": torch.tensor([pad(item["input_ids"], self.pad_id) for item in batch]),
            "labels": torch.tensor([pad(item["labels"], IGNORE) for item in batch]),
            "attention_mask": torch.tensor([pad([1] * len(item["input_ids"]), 0) for item in batch]),
        }


@torch.no_grad()
def evaluate(model, tokenizer, records: list[dict], batch_size: int, max_new_tokens: int) -> dict:
    """Greedy-generate on held-out entries and score them the way the app will see them."""
    model.eval()
    tokenizer.padding_side = "left"
    totals = {"n": 0, "valid_json": 0, "passes_rules": 0, "repaired": 0, "exact_match": 0,
              "tp": 0, "pred": 0, "gold": 0, "words": 0, "words_right": 0}
    samples, predictions = [], []
    for start in range(0, len(records), batch_size):
        chunk = records[start:start + batch_size]
        prompts = [tokenizer.apply_chat_template(r["messages"][:1], tokenize=False, add_generation_prompt=True) for r in chunk]
        inputs = tokenizer(prompts, return_tensors="pt", padding=True, add_special_tokens=False).to(model.device)
        output = model.generate(**inputs, max_new_tokens=max_new_tokens, max_length=None, do_sample=False)
        replies = tokenizer.batch_decode(output[:, inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        for record, reply in zip(chunk, replies):
            entry, gold = from_chat_record(record)
            gold_pairs = {(b["category"], t) for b in gold for t in b["texts"]}
            gold_words = word_categories(entry, gold)
            totals["n"] += 1
            totals["gold"] += len(gold_pairs)
            totals["words"] += len(gold_words)
            predictions.append({"entry": entry, "gold": gold, "reply": reply})
            try:
                predicted = json.loads(reply)["bubbles"]
                totals["valid_json"] += 1
            except (json.JSONDecodeError, KeyError, TypeError):
                samples.append({"entry": entry, "reply": reply, "problem": "invalid json"})
                continue
            canonical, reason = check_example(entry, predicted)
            if canonical is None:
                samples.append({"entry": entry, "reply": reply, "problem": reason})
                canonical = repair_bubbles(entry, predicted)  # what the app would show after repair
                if canonical is None:
                    continue
            else:
                totals["passes_rules"] += 1
            totals["repaired"] += 1
            predictions[-1]["final"] = canonical
            totals["words_right"] += sum(p == g for p, g in zip(word_categories(entry, canonical), gold_words))
            pred_pairs = {(b["category"], t) for b in canonical for t in b["texts"]}
            totals["pred"] += len(pred_pairs)
            totals["tp"] += len(pred_pairs & gold_pairs)
            totals["exact_match"] += canonical == gold
    tokenizer.padding_side = "right"
    n = max(totals["n"], 1)
    precision = totals["tp"] / max(totals["pred"], 1)
    recall = totals["tp"] / max(totals["gold"], 1)
    return {
        "examples": totals["n"],
        "valid_json": totals["valid_json"] / n,
        "passes_rules": totals["passes_rules"] / n,  # raw reply: exact substrings, full coverage, known categories
        "usable_after_repair": totals["repaired"] / n,
        # the rest score the final bubbles (raw reply if valid, else repaired)
        "word_category_accuracy": totals["words_right"] / max(totals["words"], 1),
        "exact_match": totals["exact_match"] / n,
        "span_precision": precision,
        "span_recall": recall,
        "span_f1": 2 * precision * recall / max(precision + recall, 1e-9),
        "failures": samples[:20],
        "predictions": predictions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="google/gemma-3-270m-it")
    parser.add_argument("--train", type=Path, default=HERE.parent / "dataset" / "orbit_bubbles_v2.clean.train.jsonl")
    parser.add_argument("--val", type=Path, default=HERE.parent / "dataset" / "orbit_bubbles_v2.clean.val.jsonl")
    parser.add_argument("--out", type=Path, default=HERE / "runs" / "orbit-lora")
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--lr", type=float, default=2e-4)
    # Gemma's 262k vocab makes logits huge (batch x tokens x 262144 floats), so keep
    # micro-batches small and reach an effective batch of 16 through accumulation.
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--max-len", type=int, default=1024, help="app runs with a 1024-token context")
    parser.add_argument("--eval-n", type=int, default=200, help="validation entries to generate on after training")
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--limit", type=int, default=0, help="use only the first N train examples (val gets N/4)")
    parser.add_argument("--smoke", action="store_true", help="short CPU run on a slice of the data to check the pipeline")
    args = parser.parse_args()

    if args.smoke:
        if not args.train.exists() or not args.val.exists():
            print(f"{args.train.name} not found, smoke-testing on orbit_samples.jsonl")
            args.train = args.val = HERE / "orbit_samples.jsonl"
        args.out = HERE / "runs" / "smoke"
        args.limit = args.limit or 32
        args.batch, args.grad_accum, args.max_steps, args.eval_n, args.rank = 1, 4, 10, 4, 8

    load_env()  # HF_TOKEN for the gated Gemma weights
    cuda = torch.cuda.is_available()
    # T4 has no bf16 and Gemma 3 overflows in fp16, so fall back to fp32 there.
    bf16 = cuda and torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if bf16 else torch.float32
    print(f"device: {'cuda ' + torch.cuda.get_device_name() if cuda else 'cpu'}, dtype: {dtype}")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=dtype, attn_implementation="eager")
    if cuda:
        model.to("cuda")

    records = {"train": read_jsonl(args.train), "val": read_jsonl(args.val)}
    if args.limit:
        records = {"train": records["train"][:args.limit], "val": records["val"][:max(2, args.limit // 4)]}
    datasets = {}
    for name in ("train", "val"):
        encoded = [encode(tokenizer, record, args.max_len) for record in records[name]]
        datasets[name] = [item for item in encoded if item is not None]
        lengths = sorted(len(item["input_ids"]) for item in datasets[name])
        print(f"{name}: {len(datasets[name])} examples ({len(encoded) - len(datasets[name])} over {args.max_len} tokens dropped), "
              f"tokens median {lengths[len(lengths) // 2]} max {lengths[-1]}")

    model = get_peft_model(model, LoraConfig(
        r=args.rank, lora_alpha=args.rank * 2, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM",
    ))
    model.print_trainable_parameters()

    steps_per_epoch = math.ceil(len(datasets["train"]) / (args.batch * args.grad_accum))
    total_steps = args.max_steps if args.max_steps > 0 else math.ceil(steps_per_epoch * args.epochs)
    training_args = TrainingArguments(
        output_dir=str(args.out / "checkpoints"),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=max(1, total_steps // 20),
        weight_decay=0.0,
        logging_steps=max(1, min(10, total_steps // 10)),
        eval_strategy="steps" if args.smoke else "epoch",
        eval_steps=total_steps if args.smoke else None,
        save_strategy="no" if args.smoke else "epoch",
        save_total_limit=1,
        load_best_model_at_end=not args.smoke,
        metric_for_best_model="eval_loss",
        bf16=bf16,
        report_to="none",
        remove_unused_columns=False,
        dataloader_pin_memory=cuda,
    )
    trainer = Trainer(
        model=model, args=training_args, data_collator=Collator(tokenizer.pad_token_id),
        train_dataset=datasets["train"], eval_dataset=datasets["val"],
    )
    trainer.train()

    model.save_pretrained(args.out / "adapter")
    metrics = evaluate(model, tokenizer, records["val"][:args.eval_n], batch_size=args.batch, max_new_tokens=args.max_len // 2)
    (args.out / "eval.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("failures", "predictions")}, indent=2))

    merged = model.merge_and_unload()
    merged.save_pretrained(args.out / "merged")
    tokenizer.save_pretrained(args.out / "merged")
    print(f"saved adapter, merged model, and eval.json to {args.out}")


if __name__ == "__main__":
    main()
