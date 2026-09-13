# Unlock Practice with guidance and match Understand CTA styling

## What we're changing

In Career Readiness → Prepare (the STAR story builder), make the bottom "Go to Practice" button always enabled and style that section like the Understand step's "Go to Prepare" call-to-action card. Add a clear message telling students to complete at least 6 STAR stories before practicing, with a final goal of 10–12 stories.

## Why

Right now Practice is fully locked until 5 student-created stories are saved. The user wants it visually accessible but with guidance, and wants the bottom card to mirror the Understand step's CTA formatting.

## Plan

1. Update `src/components/student/employment/StarStoryBuilder.tsx`
   - Change the bottom Practice card to match the Understand CTA card style:
     - `Card className="border-primary/30 bg-primary/5"`
     - Left side: heading text in `text-primary` font-semibold, subtext in muted.
     - Right side: primary `Button` with an arrow icon.
   - Button text: "Go to Practice".
   - Remove the `disabled={!practiceUnlocked}` gating on the button.
   - Update the helper copy:
     - Heading: "Ready to practice?"
     - Subtext: "Complete at least 6 STAR stories before heading to Practice. Final goal: 10–12 stories."
   - Keep the existing progress bar and `studentStoryCount` display above unchanged.

2. Keep the stepper's Practice item visually locked until the existing threshold (5 stories) is met, since the user only asked to unlock the bottom button, not the stepper.

3. Run TypeScript check and authenticated desktop screenshot of the Prepare bottom card to confirm it matches the Understand CTA.

## Files touched
- `src/components/student/employment/StarStoryBuilder.tsx`

## Out of scope
- No database changes.
- No changes to the stepper lock logic or the 5-story threshold for the Practice step itself.
- No changes to the STAR story builder form or the Common prompts section.
