import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import StudentHome from "./StudentHome";

// ---- Controlled data stores ------------------------------------------------

const COURSE_A = "course-aaa";
const COURSE_B = "course-bbb";
const STUDENT_ID = "student-1";

const concepts = [
  { id: "concept-1", concept_code: "Basic Data Types", weight: 0.07, course_id: COURSE_A },
  { id: "concept-2", concept_code: "Python Fundamentals", weight: 0.07, course_id: COURSE_A },
  { id: "concept-3", concept_code: "File I/O", weight: 0.13, course_id: COURSE_A },
];

const masteryStore: Record<string, any[]> = {};
const courseMasteryStore: Record<string, any> = {};

const courseRow = {
  id: COURSE_A,
  teacher_id: "teacher-1",
  name: "Intro to Python",
  start_date: new Date().toISOString().slice(0, 10),
  total_weeks: 16,
  lesson_plan_published_at: new Date().toISOString(),
};

const lessonPlanWeeks = [
  {
    week_number: 1,
    week_name: "Week 1 — Getting Started",
    overview: "Intro",
    is_exam_week: false,
    concepts: [{ id: "concept-1", name: "Basic Data Types" }],
    resources: [],
  },
];

// ---- Hook + context mocks --------------------------------------------------

let enrolledCourseId: string = COURSE_A;
vi.mock("@/hooks/useEnrolledCourseId", () => ({
  useEnrolledCourseId: () => enrolledCourseId,
}));
vi.mock("@/hooks/useStudentStatus", () => ({
  useStudentStatus: () => ({ profileData: { name: "Test Student" } }),
}));
vi.mock("@/hooks/useTASettings", () => ({
  useTASettings: () => ({ taSettings: { quizNumQuestions: 5, quizTimeLimit: 10 } }),
}));
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    studentProfile: { name: "Test Student" },
    currentCourse: { name: "Intro to Python" },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: STUDENT_ID } }),
}));

// Stub the quiz dialog with a minimal component that exposes a Close button
// which fires `onOpenChange(false)` — that's the state change that should
// re-trigger the mastery effect in StudentHome.
vi.mock("@/components/WeeklyQuizDialog", () => ({
  __esModule: true,
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="quiz-dialog">
        <button onClick={() => onOpenChange(false)}>Close Quiz</button>
      </div>
    ) : null,
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => <div {...props} />,
    },
  ),
}));

// ---- Supabase mock ---------------------------------------------------------

const chain = (data: any) => {
  const c: any = {
    select: () => c,
    eq: () => c,
    neq: () => c,
    not: () => c,
    is: () => c,
    gte: () => c,
    lte: () => c,
    in: () => c,
    order: () => c,
    limit: () => c,
    range: () => c,
    maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    then: (resolve: any) => resolve({ data, error: null }),
  };
  return c;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "concepts") {
        return chain(concepts.filter((c) => c.course_id === enrolledCourseId));
      }
      if (table === "student_concept_mastery") {
        return chain(masteryStore[`${STUDENT_ID}|${enrolledCourseId}`] || []);
      }
      if (table === "student_course_mastery") {
        return chain(courseMasteryStore[`${STUDENT_ID}|${enrolledCourseId}`] || null);
      }
      if (table === "courses") return chain(courseRow);
      if (table === "lesson_plan_weeks") return chain(lessonPlanWeeks);
      return chain([]);
    },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: {}, error: null })) },
  },
}));

// ---- Helpers ---------------------------------------------------------------

const renderHome = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider>
          <StudentHome />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};


const getTile = (label: string) => screen.getByText(label).closest("div")!;

/** The full per-concept grid now lives behind "View full mastery map". */
const openMasteryMap = async () => {
  const link = await screen.findByRole("button", { name: /view full mastery map/i });
  await act(async () => {
    fireEvent.click(link);
  });
  await screen.findByText("Concept mastery map");
};

beforeEach(() => {
  enrolledCourseId = COURSE_A;
  for (const k of Object.keys(masteryStore)) delete masteryStore[k];
  for (const k of Object.keys(courseMasteryStore)) delete courseMasteryStore[k];
});

// ---- Tests -----------------------------------------------------------------

describe("StudentHome — concept mastery heatmap", () => {
  it("renders 'not explored' tiles when no mastery rows exist for the course", async () => {
    renderHome();
    await openMasteryMap();

    await waitFor(() => {
      expect(screen.getByText("Basic Data Types")).toBeInTheDocument();
    });
    expect(screen.getByText("Python Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("File I/O")).toBeInTheDocument();
    // All three tiles show the unexplored state and no percentage
    expect(screen.getAllByText("Not explored").length).toBeGreaterThanOrEqual(3);
    expect(getTile("Basic Data Types").textContent).not.toMatch(/\d+%/);
  });

  it("re-renders the heatmap with updated mastery percentages after the weekly quiz dialog closes", async () => {
    renderHome();
    await openMasteryMap();

    await waitFor(() => {
      expect(screen.getByText("Basic Data Types")).toBeInTheDocument();
    });
    // Initial state — no mastery recorded yet
    expect(getTile("Basic Data Types").textContent).toContain("Not explored");
    expect(getTile("Python Fundamentals").textContent).toContain("Not explored");

    // Close the map so the lesson-plan quiz button is reachable again
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("Concept mastery map")).not.toBeInTheDocument(),
    );

    // Simulate the quiz writing rows to the DB (only for COURSE_A)
    masteryStore[`${STUDENT_ID}|${COURSE_A}`] = [
      { concept_id: "concept-1", mastery_score: 0.8, questions_attempted: 5 },
      { concept_id: "concept-2", mastery_score: 0.5, questions_attempted: 4 },
    ];
    courseMasteryStore[`${STUDENT_ID}|${COURSE_A}`] = { mastery_score: 0.65 };

    // Open the quiz from the lesson plan
    const takeQuiz = await screen.findByRole("button", { name: /take quiz/i });
    fireEvent.click(takeQuiz);
    expect(await screen.findByTestId("quiz-dialog")).toBeInTheDocument();

    // Close it — this flips `quizDialog.open` which is a dep of the mastery effect
    fireEvent.click(screen.getByRole("button", { name: /close quiz/i }));

    // Heatmap re-fetches and reflects new mastery for COURSE_A's concepts
    await openMasteryMap();
    await waitFor(() => {
      expect(getTile("Basic Data Types").textContent).toContain("80%");
    });
    expect(getTile("Python Fundamentals").textContent).toContain("50%");
    // Untouched concept still shows the unexplored state
    expect(getTile("File I/O").textContent).toContain("Not explored");
  });

  it("scopes mastery lookup to the enrolled course — does not leak data from another course", async () => {
    // Mastery exists for COURSE_B but student is enrolled in COURSE_A
    masteryStore[`${STUDENT_ID}|${COURSE_B}`] = [
      { concept_id: "concept-1", mastery_score: 0.9, questions_attempted: 10 },
    ];
    enrolledCourseId = COURSE_A;

    renderHome();
    await openMasteryMap();

    await waitFor(() => {
      expect(screen.getByText("Basic Data Types")).toBeInTheDocument();
    });
    // The COURSE_B mastery should NOT appear on the COURSE_A heatmap
    expect(getTile("Basic Data Types").textContent).not.toContain("90%");
    expect(getTile("Basic Data Types").textContent).toContain("Not explored");
  });
});
