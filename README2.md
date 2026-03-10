# NextStep — Project File Reference

A comprehensive listing of every code file in the project with its path and description.

---

## Root Configuration

| File | Description |
|------|-------------|
| `.lovable/plan.md` | Project plan and feature roadmap managed by Lovable |
| `index.html` | HTML entry point that loads the React app |
| `vite.config.ts` | Vite bundler configuration (dev server, plugins, path aliases) |
| `tailwind.config.ts` | Tailwind CSS theme configuration (colors, fonts, design tokens) |
| `postcss.config.js` | PostCSS configuration for Tailwind processing |
| `tsconfig.json` | Root TypeScript configuration with project references |
| `tsconfig.app.json` | TypeScript config for the application source code |
| `tsconfig.node.json` | TypeScript config for Node/Vite tooling files |
| `vitest.config.ts` | Vitest test runner configuration |
| `eslint.config.js` | ESLint linting rules and configuration |
| `components.json` | shadcn/ui component library configuration |
| `package.json` | Project dependencies, scripts, and metadata |
| `.env` | Environment variables (Supabase URL, keys — auto-generated) |

---

## Public Assets

| File | Description |
|------|-------------|
| `public/favicon.ico` | Browser tab icon |
| `public/placeholder.svg` | Placeholder image used in UI components |
| `public/robots.txt` | Search engine crawling directives |

---

## Source — Entry & App Shell

| File | Description |
|------|-------------|
| `src/main.tsx` | React app bootstrap — renders `<App />` into the DOM |
| `src/App.tsx` | Root component with route definitions and context providers |
| `src/App.css` | Global app-level CSS styles |
| `src/index.css` | Tailwind directives and CSS design tokens (colors, typography) |
| `src/tailwind.config.lov.json` | Lovable-specific Tailwind theme overrides |
| `src/vite-env.d.ts` | Vite client type declarations |

---

## Source — Pages

### Top-Level Pages

| File | Description |
|------|-------------|
| `src/pages/Index.tsx` | Root route — redirects users based on role and onboarding status |
| `src/pages/Landing.tsx` | Landing page with role selection (Professor / Student) |
| `src/pages/Auth.tsx` | Authentication page with sign-up and sign-in forms |
| `src/pages/NotFound.tsx` | 404 Not Found fallback page |

### Student Pages

| File | Description |
|------|-------------|
| `src/pages/student/StudentHome.tsx` | Student dashboard home with personalized greeting and navigation |
| `src/pages/student/StudentOnboarding.tsx` | Multi-step student onboarding (university, degree, course enrollment) |
| `src/pages/student/AIChat.tsx` | AI Teaching Assistant chat interface (learning & exam prep modes) |
| `src/pages/student/DiagnosticQuiz.tsx` | Initial diagnostic quiz to assess student knowledge level |
| `src/pages/student/Progress.tsx` | Student progress tracking and mastery visualization |
| `src/pages/student/InterviewPrep.tsx` | Interview preparation resources and practice |
| `src/pages/student/Employers.tsx` | Employer connections and career resources |
| `src/pages/student/Feedback.tsx` | Student feedback submission form for AI TA quality |

### Teacher Pages

| File | Description |
|------|-------------|
| `src/pages/teacher/TeacherOnboarding.tsx` | Teacher onboarding and profile setup |
| `src/pages/teacher/CourseCreation.tsx` | Course creation wizard (name, term, sections, objectives) |
| `src/pages/teacher/CourseDashboard.tsx` | Teacher dashboard with course metrics and student activity |
| `src/pages/teacher/ContentLibrary.tsx` | Upload and manage course materials (syllabus, documents) |
| `src/pages/teacher/ContentReview.tsx` | Review AI-generated content suggestions and recommendations |
| `src/pages/teacher/MaterialQualityCheck.tsx` | Quality assurance checks for uploaded course materials |
| `src/pages/teacher/AITASettings.tsx` | Configure AI Teaching Assistant behavior (hints, difficulty, etc.) |
| `src/pages/teacher/TeachingPlan.tsx` | Teaching plan and curriculum timeline management |
| `src/pages/teacher/Assessments.tsx` | Create and manage course assessments and quizzes |
| `src/pages/teacher/PublishEnrollment.tsx` | Publish course and manage enrollment codes |
| `src/pages/teacher/StudentInsights.tsx` | Analytics and insights on student performance |
| `src/pages/teacher/SettingsIntegrity.tsx` | Academic integrity and plagiarism settings |
| `src/pages/teacher/Support.tsx` | Help and support resources for teachers |

---

## Source — Layouts

| File | Description |
|------|-------------|
| `src/layouts/StudentLayout.tsx` | Shared layout wrapper for all student pages (sidebar, nav) |
| `src/layouts/TeacherLayout.tsx` | Shared layout wrapper for all teacher pages (sidebar, nav) |

---

## Source — Components

### Custom Components

| File | Description |
|------|-------------|
| `src/components/ComingSoon.tsx` | Placeholder component for features under development |
| `src/components/NavLink.tsx` | Navigation link component with active-state styling |
| `src/components/SetupProgressBar.tsx` | Progress bar for multi-step setup/onboarding flows |

### UI Components (shadcn/ui)

| File | Description |
|------|-------------|
| `src/components/ui/accordion.tsx` | Expandable/collapsible accordion sections |
| `src/components/ui/alert.tsx` | Alert notification banners |
| `src/components/ui/alert-dialog.tsx` | Modal confirmation dialogs |
| `src/components/ui/aspect-ratio.tsx` | Maintains consistent aspect ratios for media |
| `src/components/ui/avatar.tsx` | User avatar with image and fallback initials |
| `src/components/ui/badge.tsx` | Small label/tag badges |
| `src/components/ui/breadcrumb.tsx` | Breadcrumb navigation trail |
| `src/components/ui/button.tsx` | Button component with multiple variants |
| `src/components/ui/calendar.tsx` | Date picker calendar widget |
| `src/components/ui/card.tsx` | Card container with header, content, and footer |
| `src/components/ui/carousel.tsx` | Image/content carousel slider |
| `src/components/ui/chart.tsx` | Chart wrapper for Recharts integration |
| `src/components/ui/checkbox.tsx` | Checkbox input control |
| `src/components/ui/collapsible.tsx` | Collapsible content panel |
| `src/components/ui/command.tsx` | Command palette / searchable menu |
| `src/components/ui/context-menu.tsx` | Right-click context menu |
| `src/components/ui/dialog.tsx` | Modal dialog overlay |
| `src/components/ui/drawer.tsx` | Bottom/side drawer panel |
| `src/components/ui/dropdown-menu.tsx` | Dropdown menu with items and submenus |
| `src/components/ui/form.tsx` | Form wrapper with react-hook-form integration |
| `src/components/ui/hover-card.tsx` | Popover card on hover |
| `src/components/ui/input.tsx` | Text input field |
| `src/components/ui/input-otp.tsx` | One-time password input |
| `src/components/ui/label.tsx` | Form field label |
| `src/components/ui/menubar.tsx` | Horizontal menu bar |
| `src/components/ui/navigation-menu.tsx` | Multi-level navigation menu |
| `src/components/ui/pagination.tsx` | Page navigation controls |
| `src/components/ui/popover.tsx` | Floating popover panel |
| `src/components/ui/progress.tsx` | Progress bar indicator |
| `src/components/ui/radio-group.tsx` | Radio button group |
| `src/components/ui/resizable.tsx` | Resizable panel layout |
| `src/components/ui/scroll-area.tsx` | Custom scrollable container |
| `src/components/ui/select.tsx` | Dropdown select input |
| `src/components/ui/separator.tsx` | Horizontal/vertical divider line |
| `src/components/ui/sheet.tsx` | Side sheet overlay panel |
| `src/components/ui/sidebar.tsx` | Sidebar navigation component |
| `src/components/ui/skeleton.tsx` | Loading placeholder skeleton |
| `src/components/ui/slider.tsx` | Range slider input |
| `src/components/ui/sonner.tsx` | Toast notification provider (Sonner) |
| `src/components/ui/switch.tsx` | Toggle switch control |
| `src/components/ui/table.tsx` | Data table with rows and columns |
| `src/components/ui/tabs.tsx` | Tabbed content panels |
| `src/components/ui/textarea.tsx` | Multi-line text input |
| `src/components/ui/toast.tsx` | Toast notification component |
| `src/components/ui/toaster.tsx` | Toast notification container/renderer |
| `src/components/ui/toggle.tsx` | Toggle button |
| `src/components/ui/toggle-group.tsx` | Group of toggle buttons |
| `src/components/ui/tooltip.tsx` | Hover tooltip |
| `src/components/ui/use-toast.ts` | Toast state management hook used internally by UI toast components |

---

## Source — Contexts

| File | Description |
|------|-------------|
| `src/contexts/AppContext.tsx` | Global app state (role, profiles, courses, chat sessions) with localStorage persistence |
| `src/contexts/AuthContext.tsx` | Authentication state and methods (signUp, signIn, signOut) via Supabase Auth |

---

## Source — Hooks

| File | Description |
|------|-------------|
| `src/hooks/use-mobile.tsx` | Detects mobile viewport for responsive behavior |
| `src/hooks/use-toast.ts` | Toast notification hook (imperative toast API) |
| `src/hooks/useChatSessions.ts` | Manages AI chat sessions (create, load, send messages, streaming) |
| `src/hooks/useStudentStatus.ts` | Fetches student profile and enrollment status from the database |

---

## Source — Data & Types

| File | Description |
|------|-------------|
| `src/data/mockData.ts` | Mock/default data for courses, TA settings, quiz questions, etc. |
| `src/types/index.ts` | TypeScript type definitions (UserRole, Course, ChatMessage, TASettings, etc.) |

---

## Source — Integrations

| File | Description |
|------|-------------|
| `src/integrations/supabase/client.ts` | Auto-generated Supabase client instance (do not edit) |
| `src/integrations/supabase/types.ts` | Auto-generated database type definitions from Supabase schema (do not edit) |

---

## Source — Utilities

| File | Description |
|------|-------------|
| `src/lib/utils.ts` | Utility functions (e.g., `cn()` for Tailwind class merging) |

---

## Source — Tests

| File | Description |
|------|-------------|
| `src/test/setup.ts` | Test environment setup (jsdom, testing-library matchers) |
| `src/test/example.test.ts` | Example test file demonstrating Vitest usage |

---

## Supabase — Backend Functions

| File | Description |
|------|-------------|
| `supabase/functions/chat/index.ts` | Edge function: AI chat endpoint using Lovable AI gateway (streaming responses) |

---

## Supabase — Configuration

| File | Description |
|------|-------------|
| `supabase/config.toml` | Supabase project configuration (auth, API, storage settings — auto-generated) |
