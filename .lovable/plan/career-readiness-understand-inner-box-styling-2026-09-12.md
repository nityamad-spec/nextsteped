# Career Readiness "Understand" — inner box styling

## Goal
Make the four inner boxes under "What they're really testing" less stark by removing their white fill and keeping only a colored border.

## Changes
1. Update `src/components/student/employment/UnderstandBriefing.tsx`.
   - For the four question cards (Coding, LLM and ML depth, Applied / RAG design, Behavioral):
     - Remove `bg-white`.
     - Keep a rounded border using the same light purple as the outer card border (`#E8E3F7`).
     - Padding, text, and layout remain unchanged.
   - Leave the skill tags below "Most-tested for freshers" unchanged.

## Verification
- Run TypeScript check.
- Confirm in authenticated browser preview that the inner boxes are transparent with only a light purple border and the rest of the page is unchanged.
