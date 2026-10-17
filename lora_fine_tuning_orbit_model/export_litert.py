"""Convert the merged fine-tuned model to a .litertlm file for react-native-litert-lm.

Run in Colab (Linux) after script.py:
    pip install litert-torch
    python export_litert.py --merged runs/orbit-lora/merged --out runs/orbit-lora/litert

Settings mirror the app's LLMConfig in src/services/gemma-test.ts (CPU, 1024-token context)
and the q8 build it ships today.
"""
import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--merged", type=Path, default=Path("runs/orbit-lora/merged"))
    parser.add_argument("--out", type=Path, default=Path("runs/orbit-lora/litert"))
    parser.add_argument("--cache-length", type=int, default=1024, help="must cover the app's maxContextTokens")
    parser.add_argument("--prefill-lengths", default="256,512", help="entry prompts are well under 512 tokens")
    parser.add_argument("--quantization", default="dynamic_wi8_afp32", help="int8 weights, like the app's q8 model")
    args = parser.parse_args()

    command = [
        sys.executable, "-m", "litert_torch.generative.export_hf",
        f"--model={args.merged}",
        f"--output_dir={args.out}",
        f"--cache_length={args.cache_length}",
        f"--prefill_lengths=[{args.prefill_lengths}]",
        f"--quantization_recipe={args.quantization}",
        "--bundle_litert_lm=True",
    ]
    print(" ".join(command))
    subprocess.run(command, check=True)
    for path in sorted(args.out.rglob("*.litertlm")):
        print(f"{path}  {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
