

## Plan: Remove asterisk from Upload Syllabus & Guidelines

### Change
**File: `src/pages/teacher/TeacherOnboarding.tsx`, line 267**

Remove `<span className="text-destructive">*</span>` from the Syllabus upload label, changing:
```
<Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Upload Syllabus & Guidelines <span className="text-destructive">*</span></Label>
```
to:
```
<Label className="flex items-center gap-2"><FileText className="h-4 w-4" /> Upload Syllabus & Guidelines</Label>
```

Additionally, while editing this file, fix the stale build errors on lines 278, 306, and 364 where `SYLLABUS_ACCEPT`, `MATERIALS_ACCEPT`, and `LESSON_PLANS_ACCEPT` are referenced — replace all three with the existing `UPLOAD_ACCEPT` constant defined at the top of the file.

