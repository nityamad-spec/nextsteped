

## Plan: Generate Diagnostic Report PDF

### What
Generate a professionally formatted PDF report of the diagnostic test results for students enrolled today (March 28, 2026), including charts, tables, and analysis.

### Approach
Run a Python script using `reportlab` to create the PDF at `/mnt/documents/diagnostic_report_2026-03-28.pdf`. The script uses the data already queried from the database.

### PDF Contents (3 pages)

**Page 1:**
- Title: "Diagnostic Test Report — Intro to Python"
- Summary stats bar (156 enrolled, 155 completed, 99.4% rate, 15 questions)
- Pie chart showing learner level distribution (Expert 60%, Advanced 26.5%, Intermediate 10.3%, Beginner 3.2%)
- Level breakdown table with count, avg score, avg %, and score range
- Bar chart showing score distribution
- Key insights (4 bullet points)

**Page 2:**
- Beginner students table (5 students with name, score, percentage, avg confidence) — red header
- Intermediate students table (16 students) — amber header
- Confidence analysis (overconfidence alert for Nagarjuna, low-confidence notes)
- Recommendations (4 actionable items)
- Footer with generation date

### Technical Details
- Library: `reportlab` (already available)
- Color scheme: matches the app's purple primary with green/blue/amber/red for mastery levels
- Output: `/mnt/documents/diagnostic_report_2026-03-28.pdf`
- QA: convert pages to images with `pdftoppm` and visually inspect before delivering

### Files
- `/tmp/gen_report.py` — generation script (ephemeral)
- `/mnt/documents/diagnostic_report_2026-03-28.pdf` — final output

