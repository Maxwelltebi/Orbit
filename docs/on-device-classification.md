# On-device thought sorting

Orbit sorts a journal entry with a fine-tuned Gemma 3 270M running locally through LiteRT-LM. The model reads the whole entry and replies with JSON bubbles: each bubble has one of 17 categories and the writer's exact words. Nothing leaves the device.

Training data, scripts and the Colab notebook live in `lora_fine_tuning_orbit_model/`.

## How a reply becomes bubbles

1. The prompt is the training instruction plus the entry, byte for byte (`sorterPrompt` in `src/services/orbit-bubbles.ts`). Changing it lowers accuracy.
2. Decoding is greedy (temperature 0) with a 1024-token context and up to 640 output tokens. Entries are limited to 800 characters.
3. `checkBubbles` validates the reply: every text is an exact substring of the entry, no words are left out, spans do not overlap, and categories are known.
4. If a rule is broken, `repairBubbles` fixes it mechanically while keeping the model's category choices: rewritten spans snap to the closest sentence, repeated words go to the first bubble, duplicate bubbles merge, unknown categories become Other, and left-out words join the preceding bubble.

No JSON schema is passed to LiteRT. Its grammar engine rejects the `&` in category names such as Grief & Loss, and the model already writes valid JSON; validation and repair cover the rest. `scripts/test-orbit-bubbles.cjs` checks the TypeScript port against the Python implementation used in training.

## Testing a model on the tablet

The On-device AI screen lists every `orbit-sorter-*.litertlm` in the app's model folder, newest first. Pick one, write an entry and sort it. The result shows the bubbles, whether repair was needed, the raw reply, and load, generation and memory readings. Nothing is saved.

Copy a new export onto the tablet (development build, USB debugging on):

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb push "<folder>\orbit-sorter-v4.litertlm" /data/local/tmp/orbit-sorter-v4.litertlm
& $adb shell run-as com.mtebi.Orbit cp /data/local/tmp/orbit-sorter-v4.litertlm files/models/
& $adb shell rm /data/local/tmp/orbit-sorter-v4.litertlm
& $adb shell run-as com.mtebi.Orbit ls -l files/models
```

Remove an old model and its XNNPACK weight cache:

```powershell
& $adb shell run-as com.mtebi.Orbit rm files/models/orbit-sorter-v3.litertlm
& $adb shell run-as com.mtebi.Orbit sh -c "rm cache/orbit-sorter-v3.litertlm_*.xnnpack_cache"
```

## Measured on the Lenovo tablet (TB330XU)

v3, a six-sentence entry: 9.9 s total (4.0 s load, 5.7 s generation, first token at 1.8 s), 675 MiB ORBIT memory after the response. The reply was valid without repair, but the model grouped unrelated neighbouring sentences; the brain-dump training data in v4 targets that.
