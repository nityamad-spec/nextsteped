## Plan: Combine Exam Prep Banners on `/student/chat`

### Goal

Merge the two separate banners currently shown in `ExamPrepPanel` (availability note + professor-recommended settings) into a single unified banner with the wording you specified.

### Current State

`src/components/ExamPrepPanel.tsx` renders two stacked info boxes at the top:

1. Availability note: e.g. "2 practice exams remaining — each exam can only be attempted once (next up: Exam 1 of 2)."
2. Recommendation note: "Professor recommended settings — these simulate the real exam. You can customize them for your practice."

### Proposed Change

1. **Remove** the separate availability banner and the separate recommendation banner.
2. **Add** a single combined banner at the top of `ExamPrepPanel` using an `Info` icon and muted styling.
3. **Copy** to be:
  - Primary line: **"Professor Recommended Settings: These simulate the exam."**
  - Secondary line: dynamic count, e.g. **"There are 2 practice exams you can take."**
4. **Preserve the existing count logic** but simplify the phrasing:
  - `examCount === 0`: "There are no practice exams available to take right now."
  - `examCount === 1`: "There is 1 practice exam you can take."
  - `examCount > 1`: "There are {examCount} practice exams you can take."

### Open Question

 "There are N practice exams you can take" wording for all cases. 

### Files to Change

- `src/components/ExamPrepPanel.tsx` only.

### Verification

- Run TypeScript typecheck.
- Visually confirm on `/student/chat?mode=exam` that only one banner appears and the count text is correct.

### Risks

- Very low. This is a presentational change; no logic, state, or API contracts change.