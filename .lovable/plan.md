## Goal
In `/student/chat` Exam Prep mode, hide the chat surface entirely so only the Exam Prep panel (welcome hero + practice exams) is visible when no assessment is active.

## Changes (all in `src/pages/student/AIChat.tsx`)

1. **Messages area (line ~1418)** — wrap in a condition so it only renders when `mode === "learning"` OR `assessmentActive` is true. In exam mode outside an active assessment, the welcome message, message list, and empty-chat placeholder are not rendered.

2. **Input composer (line ~1511)** — wrap in the same condition. The disabled input row + "Exam Prep chat is off here…" placeholder is removed in exam mode. During an active exam assessment, the input stays hidden (AssessmentView handles its own UI).

3. **Privacy footer (line ~1545)** — keep visible in both modes (unchanged), OR move inside the messages/input block. Recommend keeping it visible under the Exam Prep panel since it's a persistent trust signal.

4. **Layout** — ensure the ExamPrepPanel container fills the available vertical space when the chat area is hidden (change `border-b` wrapper to flex-1 with scroll in exam mode, so the panel doesn't collapse to top).

## Preserved behavior
- When an exam assessment is actively running (`assessmentActive === true` in exam mode), the AssessmentView renders as today.
- Study mode is unchanged.
- ExamPrepPanel, Performance dashboard dialog, and leave-warning dialog unchanged.

## Risks
- Layout flicker if `assessmentActive` toggles — mitigated by keeping the same outer flex container.
- If any effect depends on the messages `<div ref={messagesEndRef}>` being mounted in exam mode, scroll-to-bottom calls become no-ops (safe; ref will be null).
