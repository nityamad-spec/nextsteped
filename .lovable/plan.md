

## Plan: Preserve Newlines in Question Text

### Problem
The `Textarea` input correctly accepts newlines, but they are lost when displayed because the question text is rendered inside `<p>` tags which collapse whitespace. This affects both the teacher's question card list and the student's assessment view.

### Fix
Add `whitespace-pre-wrap` to every element that renders question text, so `\n` characters display as line breaks.

### Changes

**1. `src/pages/teacher/Assessments.tsx`** (line 296)
- Change `<p className="text-sm font-medium">{q.question}</p>` to include `whitespace-pre-wrap`

**2. `src/components/AssessmentView.tsx`** (line 187)
- Add `whitespace-pre-wrap` to the question text display in the results review section
- Check the main question rendering area and apply the same fix there

### Files Modified
- `src/pages/teacher/Assessments.tsx`
- `src/components/AssessmentView.tsx`

