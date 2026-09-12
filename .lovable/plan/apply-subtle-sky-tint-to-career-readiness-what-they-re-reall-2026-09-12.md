# Apply "Subtle Sky Tint" to Career Readiness "What they're really testing" Section

## Selected direction
Subtle Sky Tint (v1): a soft sky-50/50 background with a sky-100 border on the outer card, white inner question cards with sky-100/50 borders, and sky-tinted skill tags.

## Changes
In `src/components/student/employment/UnderstandBriefing.tsx`, update the second `<Card>` titled "What they're really testing":

1. Outer card styling
   - Add `border-sky-100 bg-sky-50/50` to the `<Card>`.

2. Header row
   - Add a `BookOpen` Lucide icon inside a `rounded-lg bg-sky-500/10 text-sky-600` container to the left of the title.
   - Keep the title text `text-sm font-semibold` and the subtitle `text-muted-foreground`.

3. Inner question cards
   - Wrap each question item in a white card with `rounded-xl border border-sky-100/50 bg-white p-5`.
   - Keep the existing title and guidance text unchanged.

4. Skill tags row
   - Change the tag styling from `bg-primary/10 text-primary` to `rounded-full border border-sky-100 bg-white text-xs font-medium text-sky-700`.
   - Keep the "Most-tested for freshers:" label unchanged.

## Scope
Only the "What they're really testing" card is affected. The "The rounds you'll face" timeline above it and the "Company-specific notes" card below it remain unchanged.

## Verification
1. Run TypeScript check.
2. Open `/student/career-readiness` in the authenticated preview.
3. Screenshot the "What they're really testing" section and confirm the sky-tinted outer card, white inner cards, and updated skill tags render as selected.
