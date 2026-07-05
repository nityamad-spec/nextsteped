## Plan: Count Proficient + Expert concepts in admin student profile

### Current behavior
In the admin student profile dialog (`src/components/admin/StudentProfileDialog.tsx`), the “Proficient concepts” headline counts only rows from `student_concept_mastery` where `mastery_level === "proficient"`. This means students with "expert" level concepts see a lower number than expected.

### Change
Update the count in `StudentProfileDialog.tsx` so it counts both `mastery_level === "proficient"` and `mastery_level === "expert"`. The rest of the logic (deduplication by concept_id, display label, etc.) stays the same.

### Files changed
- `src/components/admin/StudentProfileDialog.tsx` (lines 188–195)

### Verification
- Open a student profile in `/admin/students`.
- Confirm the “Proficient concepts” number matches the sum of concepts listed as “Strong” (Proficient + Expert) in the expanded course details.