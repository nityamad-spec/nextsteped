## Verification results — no changes needed

Tested `generate-question-metadata` end-to-end with the exact MCQ visible in the screenshot ("A data science team needs a centralized… What Google Cloud service should they use?" / Vertex AI Model Registry).

### Edge function — PASS
Live POST to `/generate-question-metadata` returned **200** in ~10s with a valid JSON payload:

```json
{
  "difficulty": "Easy",
  "bloomsLevel": 1,
  "bloomsLevelName": "Remember",
  "difficultyEstimate": 0.85,
  "bloomJustification": "The question requires recalling the definition and primary function of a specific Google Cloud service.",   // 108 chars
  "difficultyJustification": "The service's name, 'Model Registry,' directly corresponds to the functions described, making it easy to identify.",   // 118 chars
  "explanation": "Vertex AI Model Registry is a centralized repository specifically designed for managing, versioning, and deploying ML models. While models can be stored in Cloud Storage, it lacks the built-in MLOps features for tracking and deployment that the Model Registry provides."   // 274 chars
}
```

Confirmed:
- All 6 target fields present with correct types.
- Justifications ≤ 140 chars, explanation ≤ 320 chars — Option B caps hold.
- Well under the previous 120s timeout (new limit is 60s, response ~10s).
- Model kept at `google/gemini-2.5-pro` as specified.
- 429/402/504 error branches present and return structured JSON.

### Client — PASS
`src/pages/teacher/ExamMode.tsx` `handleAutoGenerateMetadata(mode)`:
- Signature accepts `"fill-empty" | "regenerate-all"`, default `"fill-empty"`.
- Pre-flight requires question + correct answer + ≥2 options for MCQ.
- `"regenerate-all"` computes `hasExisting` against `initialMetaRef` snapshot and prompts `window.confirm` before overwriting; unconditionally writes all 6 fields on confirm.
- `"fill-empty"` only writes when the current value still equals the initial snapshot (or is blank for text fields).
- Toasts differ per mode ("Regenerated N field(s)" vs "Filled N field(s)…" / "nothing to fill").
- Two buttons wired at lines 1635 and 1647 with matching mode arguments; disable/tooltip guard covers both.

### Verdict
All Option B changes (compact prompt, hard length caps, 60s timeout, 504 on timeout) and the new "Regenerate all" mode are correctly implemented in both the edge function and the UI. No fixes required.
