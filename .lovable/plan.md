

## Plan: Add Missing DB Fields to Diagnostic Questions UI

### Problem
The `diagnostic_questions` table has several columns not captured by the current edit form:
- **item_id** — hierarchical question ID (e.g. `PWIM/Python_Environment/Q001`)
- **difficulty_estimate** — numeric 0.0–1.0 (UI only has Easy/Medium/Hard label, no numeric mapping)
- **bloom_level** — integer 1–6 (Bloom's taxonomy)
- **bloom_justification** — text explaining the Bloom level choice
- **difficulty_justification** — text explaining the difficulty rating
- **is_distractor** — boolean flag

### Changes

**File: `src/pages/teacher/DiagnosticQuestionsSetup.tsx`**

1. **Extend `DiagnosticQuestion` interface** with the missing fields:
   - `itemId: string` (auto-generated default from topic + index, editable)
   - `difficultyEstimate: number` (0.0–1.0)
   - `bloomLevel: number` (1–6)
   - `bloomJustification: string`
   - `difficultyJustification: string`
   - `isDistractor: boolean`

2. **Add UI widgets in the edit form** (inside the existing edit mode section):
   - **Item ID**: `<Input>` field with auto-generated placeholder
   - **Difficulty Estimate**: `<Slider>` (0–1 range, step 0.05) displayed alongside the existing Easy/Medium/Hard dropdown; auto-sync the dropdown to preset ranges (Easy: 0–0.33, Medium: 0.34–0.66, Hard: 0.67–1.0)
   - **Bloom Level**: `<Select>` with options 1–6 labeled with Bloom names (1: Remember, 2: Understand, 3: Apply, 4: Analyze, 5: Evaluate, 6: Create)
   - **Bloom Justification**: `<Textarea>` below Bloom level select
   - **Difficulty Justification**: `<Textarea>` below difficulty estimate slider
   - **Is Distractor**: `<Checkbox>` with label "Mark as distractor question"

3. **Update view mode** to display the new metadata fields (Bloom level badge, difficulty estimate value, distractor flag, justifications in collapsible sections)

4. **Update `emptyQuestion` factory** to include sensible defaults for new fields

5. **Update `generatedQuestions` seed data** with sample values for the new fields

### Layout
The edit form will organize fields into a collapsible "Advanced Metadata" section below the existing fields to keep the form clean for quick edits while making all DB fields accessible.

### Files Modified
1. `src/pages/teacher/DiagnosticQuestionsSetup.tsx` — add missing field widgets, update types, update view/edit modes

