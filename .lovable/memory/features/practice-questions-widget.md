---
name: Practice Questions Widget
description: Interactive AI-generated practice questions in study mode with per-question feedback and history
type: feature
---
Study mode has a "Practice" button in the header that opens a full-screen widget.

Flow:
1. Student types what they want to practice in a free-form text box (e.g. "loops and conditionals", "5 questions on OOP")
2. AI generates questions via the chat edge function with a specialized system prompt
3. Questions presented one at a time — student answers, clicks "Check Answer", sees instant feedback with explanation
4. After all questions: results summary with score, topic review suggestions
5. Results persisted to `assessment_results` with `mode = "practice"` for history tracking

Key decisions:
- No question type selector — AI decides mix naturally
- No concept multi-select — simple text prompt instead
- Per-question instant feedback (not end-of-assessment like exam mode)
- No timer or proctoring
- History viewable within the widget
- Results inform mastery tracking
