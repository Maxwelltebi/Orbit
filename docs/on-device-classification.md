# Compact on-device thought classification

The current Gemma 3 270M test uses a catalogue of 50 named topics plus Other. Its numeric IDs stay stable. Definitions and synonyms live in category-catalogue.ts; adding a catalogue entry does not create an empty dashboard bubble.

## Implemented and ready to test

1. Split sentences and long spans locally, preserving original character offsets. Bound an item to 200 characters and a batch to six items / 600 characters. These are character limits, not tokenizer measurements.
2. Use a phrase index over the complete catalogue to rank relevant candidates. Offer up to four category IDs per item, plus Other. Related topics supply alternatives. Retrieval selects candidates; Gemma still makes every final choice in this test.
3. Include only the union of those candidates in a shared prompt dictionary. Do not send the full catalogue, saved journal, or category history on every request.
4. Constrain each response property to that item's allowed numeric IDs using LiteRT's JSON Schema output. A six-item response looks like {"1":1,"2":2,"3":11,"4":1,"5":2,"6":12}. Category labels and original text are reconstructed locally.
5. Reject missing, duplicate, unknown, and disallowed IDs. Combine all batches and validate source coverage before any storage integration. Other remains visible as Other; it is never silently changed to the locally highest-ranked category.

The On-device AI test reports actual model load and generation times, memory snapshots, offered category count, and prompt/response lengths. It unloads the model afterward and does not save the sample. JSON constraints prevent invented names; they do not guarantee correct semantic choices. Candidate retrieval can miss a topic, so candidate coverage and final choices need separate evaluation.

## Separate fast-sorting comparison test

The Gemma-only baseline remains available. Test fast sorting adds an explicit lexical fast path: exactly one concrete topic match is handled locally; competing concrete topics and unknown topics defer to Gemma. A sole explicit generic topic, such as worried, can match locally unless negated. Generic modifiers do not replace a concrete subject. This is a rule, not measured model confidence, and it can still make semantic mistakes.

The model receives only unresolved item IDs. An all-local input does not evaluate native code or load weights. Mixed batches load once, classify unresolved items sequentially, validate them, and merge their real choices with prior local assignments. Local matching never silently replaces an incorrect model result. Results identify the method per thought and report overall correctness separately from model-only correctness. Total elapsed time includes preparation, loading, generation, and cleanup.

The six-item fixture has four local matches and two model items; this is not evidence that Gemma now classifies all six correctly. Native model accuracy and latency still require device testing. Pure checks live in scripts/test-hybrid-categories.cjs.

## Next integration after tablet validation

Process long dumps sequentially through one loaded foreground runtime. Reset conversation context between independent batches; never reload weights for each sentence or run concurrent inference on this 4 GB device. Preserve the draft until every batch validates, then save thoughts and category links in one SQLite transaction. Reuse the existing category row instead of creating duplicate bubbles.

Keep the runtime warm only while actively sorting in the foreground, within measured memory limits; release it on inactivity or app background after the native operation settles. The installed runtime has no cancellation API, so a timeout must keep ownership until cleanup completes.

An exact-input SQLite cache can avoid repeated inference. Key it by source digest, model revision, catalogue version, and classifier version; invalidate it when any changes. Do not treat a cached answer as proof of accuracy. Corrections and Other assignments need a review path. Model residency and caching are proposed integration steps, not enabled in the current test.

## Verification

Run node scripts/test-gemma-categories.cjs for retrieval coverage, compact output validation, duplicate IDs, bounded batching, and original-text preservation. Run node scripts/test-gemma.cjs for resource ownership, timeout, and cleanup. Run Expo lint and TypeScript checks. Real device accuracy and speed still require the tablet test; no response-time guarantee is inferred from a desktop check.

## Custom device test

Try your own thoughts accepts up to 600 characters and uses the same hybrid pipeline. Each original text span and its actual method are shown for human review, including Other. There is no automatic accuracy score for arbitrary input. Results remain tied to the submitted source even if the input is edited afterward; neither the text nor assignments are written to SQLite. The six-sentence tablet test measured 12.6 seconds total including cleanup, with 5.9 seconds loading, 6.5 seconds generating, and 4.8 seconds to the first token. One device run does not isolate the effect of the hybrid strategy from changing load times.

## Real dump follow-up

The custom tablet input returned Other for all three sentences (11.8 seconds total). Inspection found Money was not offered for pay my fees, because fee/tuition/payment terms were absent. Those terms are now indexed. An independent and/but + subject clause may split when both sides have distinct concrete topic evidence. Relational phrases such as work with school stay intact, with all original text preserved. The custom review flags multiple lexical topic matches even if Gemma returns one valid category. This is not multi-label model inference or proof of improved semantic accuracy. Vague follow-ups referring to it remain unresolved rather than being assigned an invented meaning.
