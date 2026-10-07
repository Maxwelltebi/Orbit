# Thought organization

The composer accepts a sentence or dump with no category selection. A category hint is an optional manual override for the entire entry. Actual categories start empty, and each saved category becomes a bubble. Suggestions never create empty bubbles or limit which category names can exist.

## Current executable milestone

Expo Go uses `organizePreview`: conservative keyword matching, sentence/line splitting, and an Unsorted category for uncertain input. This is explicitly labelled basic sorting in the interface. It is not Gemma or semantic AI. It cannot reliably separate multiple subjects in one sentence, infer implied subjects, or understand arbitrary new topics. Custom category names work immediately through the optional hint.

`OrbitProvider` accepts a `ThoughtOrganizer` implementation. The organizer receives the original text and existing category IDs/labels, then returns an asynchronous organization with `method: 'model'` and parts `{ start, end, category }`. Offsets are JavaScript UTF-16 indices into the original input. No text paraphrasing is allowed. Existing category names should be reused; a new concise category name is permitted for a genuinely new subject.

`validateOrganization` rejects missing text, overlaps, invalid offsets, empty segments and invalid category names. A failed submission retains the draft. `appendThoughtDump` atomically saves the original dump, exact source segments and new/reused categories. Category IDs remain stable as bubbles grow. The bubble layout expands vertically after five categories, with no fixed category limit.

This remains session storage. Original dumps, thought parts and categories will need SQLite tables before this is used for real journaling.

## Next milestone: actual local Gemma

1. Create an Expo development build containing the chosen on-device inference runtime. Expo Go cannot load arbitrary native inference modules. Do not silently move thoughts to a server.
2. Confirm the target phone's memory/storage and test a small quantized Gemma model on Android and iOS before selecting the downloadable model file. Verify model/runtime compatibility, license, download integrity, resume/cancel and load failure handling.
3. Implement a Gemma organizer using the interface above. Send existing category labels with the input; ask it to propose topic boundaries and reuse a label or supply a new label. Treat the user's thoughts as data, never as instructions to the organizer. Long dumps should be processed in bounded chunks with source offsets restored to the full dump.
4. Model character counting is unreliable. Have the runtime adapter match returned verbatim excerpts against the source to derive UTF-16 offsets, reject ambiguous/rewritten excerpts and validate full coverage. Require valid structured output. Keep unclassified text in Unsorted rather than discarding it. If inference fails, retain the complete original and allow retry; explicitly identify any use of the preview fallback.
5. Replace the provider's preview organizer only when the model is installed and ready. Show installation/loading/processing/error states and guard repeated submits. Keep the React Native interface responsive while native inference runs.
6. Test arbitrary subjects, mixed topics within one sentence, existing category reuse, category synonyms, Unicode, ambiguous thoughts, interruptions and malformed model output on real Android and iOS devices.

The current changes supply the submission, state and layout foundation. A model is not installed, downloaded or running by this change.
