

# NextStep — AI Learning Platform

A clean, modern (Notion-inspired) responsive web app with two distinct experiences: **Teacher View** and **Student View**, selected at launch. Built UI-first with mock data, local storage for chat persistence, and ready for future backend integration.

---

## 1. Landing & Role Selection

- **Welcome screen** with NextStep branding and tagline
- Two role cards: **"I'm a Professor"** and **"I'm a Student"**
- Clean, minimal design with subtle animations

---

## 2. Teacher View

### 2.1 Teacher Onboarding Questionnaire
- Visual step-by-step form collecting: name, department, courses taught, teaching style preferences
- Clean progress indicator

### 2.2 Left Sidebar Navigation
- **Courses** (active)
- **Content Library**
- **Student Insights**
- **Assessments**
- **Settings / Integrity**
- **Support**
- Current course name displayed under the view label
- TA/Coordinator and Dept Admin roles shown but grayed out as "Coming Soon"

### 2.3 Course Creation & Syllabus Intake
- Form: course name, term (First Semester / Second Semester / Summer Semester), section(s), learning objectives
- Syllabus upload area (PDF/DOC) with drag-and-drop
- Teaching materials upload (slides, readings, problem sets, past exams)
- After upload: AI-generated syllabus review with improvement recommendations (mock data)
- Professor can approve all, select specific changes, or reject all
- Auto-extracted "Required Concepts List" that professor can edit

### 2.4 System-Generated Content (Mock Data)
- **Course Knowledge Map**: visual modules → topics → prerequisites
- **Question/Practice Bank**: concept explanations, applied practice, exam-style questions
- **Confidence tags** per topic (High/Medium/Low)

### 2.5 AI TA Settings
- "Hint ladder" enabled toggle (default on)
- Knowledge sources toggle: uploaded docs only vs. uploaded + web sources (recommended, with explanation of benefits)
- Citation required toggle (subtext: "AI will cite course materials and external resources as used/relevant")
- Plagiarism/similarity warnings toggle (subtext: "Flags potential academic integrity issues only during exam prep test module")
- Exam simulation rules: time, difficulty, question mix
- **Student Experience Preview** pane showing what students will see

### 2.6 Review & Publish Content
- Tabbed view: Concepts & Explanations, Practice Problems, Exam Simulation Bank
- Actions: Approve / Edit / Regenerate / Flag incorrect content
- Add custom problems manually
- Publish to sections, set start/end date, generate enrollment code

### 2.7 Student Enrollment
- Add students via CSV upload or course code
- Toggle: diagnostic quiz required (Y/N)
- Enable weekly nudges toggle

### 2.8 Course Dashboard (Command Center)
- At-a-glance cards: active students, total sessions, top 5 misunderstood concepts, mastery distribution, at-risk learners count
- Teacher actions: broadcast messages, push recommended practice sets, add clarifying notes to concepts
- **Dashboards & Insights** sections: engagement metrics, concept mastery heatmap, question trends, assessment readiness
- Drill-down: click a concept to see common wrong paths, sample prompts, recommended interventions

### 2.9 Course Closeout
- Summary report export (PDF/CSV mockup)
- "What to improve next term" suggestions
- Save content pack as reusable template

---

## 3. Student View

### 3.1 Student Onboarding (Lightweight)
- Simple profile: student name and course enrollment (course code selection)
- No interview prep questions since that feature is "coming soon"

### 3.2 Diagnostic Quiz
- 5-10 questions adapted to the enrolled course (mock questions)
- Output: learner level (Beginner / Intermediate / Advanced / Expert) + topic-level baseline
- "Your plan this week" outcome screen with recommended activities

### 3.3 Bottom Tab / Left Nav Navigation
- **Home**
- **AI TA Chat** (with Learning Mode and Exam Prep Mode as sub-tabs)
- **Interview Prep** (grayed out, "Coming Soon" badge)
- **Progress**
- **Employers** (grayed out, "Later Feature" badge)
- Current course name displayed under the view label

### 3.4 Home (Personalized Dashboard)
- Student learner level label prominently displayed (e.g., "Beginner")
- Cards: "Continue where you left off", "Recommended practice", "Exam in X days — take a simulation"
- "Take Simulation" button routes directly to Exam Prep mode
- Quick action buttons: Start Learning Session, Take Exam Simulation

### 3.5 AI TA Chat — Learning Mode
- Separate chat history from Exam mode, persisted in local storage
- On opening: returns to most recent chat (does NOT auto-create new chat)
- "New Chat" button to start fresh conversation
- Chat history sidebar listing previous conversations
- Topic selector (module tree), difficulty controls, "Ask for a hint" button, "Show steps" toggle, "Cite course notes" toggle
- AI responds with: concept explanation, quick example, check-for-understanding question (mock streaming responses)
- Adaptive flow: wrong answer → hint ladder + remediation; correct → next harder question
- **Interactive exercise demo**: embedded code terminal where student can type code and AI checks correctness
- Rich responses with text, visualizations, and interactive elements
- Refuses direct answers for graded assignments, offers guidance instead

### 3.6 AI TA Chat — Exam Prep Mode
- Separate tab within AI TA Chat, with its own independent chat history
- Exam simulation setup: choose exam, time limit, difficulty mix
- During simulation: timer, question navigator, scratchpad, minimal hints per professor rules
- After simulation: score summary, topic breakdown, "Review mistakes" path with mini-lessons and practice questions
- Separate chat history from Learning Mode

### 3.7 Interview Prep (Coming Soon — Grayed Out)
- Visible but non-functional tab with "Coming Soon" overlay
- Preview of what's planned: Behavioral Practice, Technical Practice
- Once active: choice between voice-interview simulation or text-based practice
- Standardized interview prep guides preview (resume editing, behavioral interview 101)
- Custom guides based on student's target role
- Plagiarism detection for text-based practice

### 3.8 Progress Tab
- **Learning Journey**: mastery map by topic with timeline showing progression (e.g., "Beginner in April 2025 → Expert by November 2025")
- Starting point highlighted vs. current level
- **Employability Readiness** journey: Beginner → Developing → Prepared (separate from learning journey)
- Weekly learning streak
- Exam readiness gauge
- "What to do next" recommendations

### 3.9 Employers Tab (Grayed Out — Later Feature)
- Visible but non-functional with "Coming Later" badge
- Preview layout: employers hiring for target role, required skills, student's current skills gap, personal notes from employees

---

## 4. Responsive Design
- Fully responsive layout working on desktop and mobile
- Bottom tab navigation on mobile, left sidebar on desktop
- Touch-friendly interactions and appropriately sized tap targets

---

## 5. Design System
- Clean, modern Notion-inspired aesthetic
- Neutral base colors with accent highlights for key actions
- Consistent card-based layouts, subtle shadows, generous whitespace
- Clear typography hierarchy
- Smooth transitions and micro-interactions

