# Quick Paste for Add Question (Exam Mode)

Add a helper input at the top of the Add/Edit Question dialog on `/teacher/setup/exam-mode` where a professor can paste a full MCQ block. The parser fills the existing Question field and the four Option fields (and, when marked, the correct answer). No schema, RLS, or edge function changes.

## Scope
- File: `src/pages/teacher/ExamMode.tsx` (dialog around line 1544).
- Frontend only. Uses existing state: `setFormQuestion`, `setFormOptions`, `setFormCorrectIndex`, `setFormType`.

## UI
Inside the dialog, above the "Question Text" field, add a collapsible section:

- Label: "Paste question (optional)"
- A `Textarea` (rows=6) with placeholder showing the accepted format.
- Two buttons: "Fill fields" and "Clear".
- Small helper text listing supported formats.

After a successful parse: clear the paste box, focus the Question Text field, toast "Parsed question and 4 options", and if 4 options were found force `formType` to `MCQ`.
On failure: inline error under the textarea explaining what could not be parsed; do not overwrite existing form fields.

## Supported paste formats
Parser is lenient and handles the common shapes professors copy from docs:

1. Question on first non-empty line(s) until the first option line.
2. Options on subsequent lines, each starting with one of:
   - `A)` `A.` `A:` `A -` `(A)` — same for B/C/D (case-insensitive)
   - or `1.` `1)` `2.` … for numbered options
3. Correct answer detected from any of:
   - A trailing marker on an option line: `*`, `[correct]`, `(correct)`, `✓`
   - A separate line like `Answer: B`, `Correct: 3`, `Ans - C`
4. Blank lines and stray whitespace ignored. Requires exactly 4 options for MCQ auto-fill; if 2 options resolve to True/False, offer to switch type to True/False instead.

Correct-index resolution order: explicit `Answer:` line > inline marker > default 0. If no correct answer is indicated, still fill options and leave `formCorrectIndex` at 0 with a toast "Set the correct option".

## Behavior rules
- Never wipe fields the user already typed unless the parse succeeds; on success, overwrite Question + all 4 Options + correct index.
- Only runs when the user clicks "Fill fields" — no auto-run on every keystroke, to avoid surprising overwrites.
- Works only for MCQ / True-False shapes. For Short Answer, hide the paste section (or show it disabled with a note) once `formType` is Short Answer.
- Paste block itself is not persisted; it is local dialog state cleared on close.

## Technical notes
- Add local state: `const [pasteText, setPasteText] = useState("")` and `const [pasteError, setPasteError] = useState<string | null>(null)`, reset in `openAddDialog` / `openEditDialog` and on dialog close.
- Implement `parseQuestionBlock(raw: string): { question: string; options: string[]; correctIndex: number | null; detectedType: "MCQ" | "TF" } | { error: string }` as a pure helper co-located in the file (or `src/lib/parseQuestionPaste.ts` if we want a unit test — recommended, small).
- Regex sketch:
  - Option line: `/^\s*(?:\(?([A-Da-d1-4])\)?[\.\):\-])\s*(.+?)\s*(\*|\[correct\]|\(correct\)|✓)?\s*$/`
  - Answer line: `/^\s*(?:answer|ans|correct)\s*[:\-]\s*([A-Da-d1-4])\s*$/i`
- Trim and collapse internal whitespace on the question; preserve option text as typed.

## Risks
- Ambiguous paste (e.g. options split across multiple lines) — mitigated by requiring the leading letter/number token and surfacing a clear inline error instead of silently mis-parsing.
- Overwriting in-progress edits in Edit mode — mitigated by requiring an explicit button click and by the paste box starting empty each time the dialog opens.
- Non-MCQ modes — hide the paste helper when `formType === "Short Answer"`.

## Out of scope
- No changes to `assessment_questions` schema, RLS, or the save path.
- No bulk import of multiple questions in one paste (single question only).
- No AI-based parsing; deterministic regex only.
