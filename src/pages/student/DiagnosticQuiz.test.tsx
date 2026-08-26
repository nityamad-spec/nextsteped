import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiagnosticQuiz from "./DiagnosticQuiz";

const STUDENT_ID = "student-1";
const COURSE_ID = "course-1";

// ---- Proctoring: capture the callbacks so tests can fire a violation -------
let proctorOpts: any = null;
vi.mock("@/hooks/useProctoring", () => ({
  useProctoring: (opts: any) => {
    proctorOpts = opts;
    return {
      violations: 0,
      isFullscreen: true,
      enterFullscreen: vi.fn(async () => true),
      reportViolation: vi.fn(),
    };
  },
  fullscreenSupported: () => false,
  exitFullscreen: vi.fn(async () => {}),
  requestFullscreenOn: vi.fn(async () => true),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: STUDENT_ID } }),
}));
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    studentProfile: { name: "Test Student" },
    setStudentProfile: vi.fn(),
    setDiagnosticComplete: vi.fn(),
    currentCourse: { id: COURSE_ID, name: "Intro to Python" },
  }),
}));
vi.mock("@/lib/attemptVoids", () => ({
  countAttemptVoids: vi.fn(async () => 0),
  recordAttemptVoid: vi.fn(async () => {}),
  VOID_LOCK_THRESHOLD: 2,
}));

vi.mock("framer-motion", () => {
  const cache: Record<string, any> = {};
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, key: string) => {
          if (!cache[key]) {
            cache[key] = ({ children, ...rest }: any) => {
              const {
                initial, animate, exit, transition, variants, whileHover,
                whileTap, whileInView, viewport, layout, layoutId, ...domProps
              } = rest;
              return <div {...domProps}>{children}</div>;
            };
          }
          return cache[key];
        },
      },
    ),
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// ---- Supabase mock ---------------------------------------------------------

/** Hoisted so the vi.mock factory (which runs first) can read them. */
const state = vi.hoisted(() => ({
  /** Bloom level for the standard-tier questions; 3+ makes reasoning mandatory. */
  standardBloom: 1,
  /** When true, the Phase A → Phase B fetch never resolves (simulated hang). */
  branchFetchHangs: false,
  standardFetched: false,
  invoke: null as any,
}));

const makeRowsLocal = (tier: string, bloom: number) =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${tier}-q${i}`,
    content_text: `Question ${tier} ${i}`,
    options: ["Alpha", "Beta"],
    answer: "A",
    format: "mcq",
    topic: "Basics",
    explanation: "",
    bloom_level: bloom,
    difficulty_estimate: 0.5,
    tier,
    course_id: COURSE_ID,
    in_test: true,
  }));

const invoke = vi.hoisted(() => vi.fn(async () => ({ data: { learner_level: "developing" }, error: null })));

const chain = (result: () => Promise<any>) => {
  const c: any = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (key === "then") return (res: any, rej: any) => result().then(res, rej);
        if (key === "maybeSingle" || key === "single")
          return () => result().then((r: any) => ({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }));
        return () => c;
      },
    },
  );
  return c;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "diagnostic_questions") {
        return chain(async () => {
          // The standard batch is fetched at mount; anything later is the branch.
          if (state.branchFetchHangs && state.standardFetched) return new Promise(() => {});
          state.standardFetched = true;
          return { data: makeRowsLocal("standard", state.standardBloom), error: null };
        });
      }
      return chain(async () => ({ data: null, error: null }));
    },
    functions: { invoke },
  },
}));

const renderQuiz = () =>
  render(
    <MemoryRouter initialEntries={[`/student/diagnostic?course=${COURSE_ID}`]}>
      <DiagnosticQuiz />
    </MemoryRouter>,
  );

const startQuiz = async () => {
  const start = await screen.findByRole("button", { name: /start quiz/i });
  await act(async () => {
    fireEvent.click(start);
    // requestAnimationFrame inside the click handler
    await new Promise((r) => setTimeout(r, 20));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  proctorOpts = null;
  state.standardBloom = 1;
  state.branchFetchHangs = false;
  state.standardFetched = false;
  localStorage.clear();
});

describe("DiagnosticQuiz — no invisible blockers in fullscreen", () => {
  it("renders the proctoring warning inline in the quiz container, not in a portal", async () => {
    renderQuiz();
    await startQuiz();
    await screen.findByText(/Question standard \d/);

    await act(async () => {
      proctorOpts.onWarn?.("window_blur", 1);
    });

    const warning = await screen.findByText(/Stay on the quiz/i);
    // Must live inside the quiz container (the fullscreen element), never on body.
    expect(warning.closest("[data-testid='diagnostic-quiz-container']")).not.toBeNull();
  });

  it("shows a visible inline error instead of a toast when reasoning is missing", async () => {
    state.standardBloom = 4;
    renderQuiz();
    await startQuiz();
    await screen.findByText(/Question standard \d/);

    fireEvent.click(screen.getByText("Alpha"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next question/i }));
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/reasoning/i);
    // Still on the first question — the student was not silently blocked.
    expect(screen.getByText(/Question 1 of/i)).toBeTruthy();
  });

  it("does not leave the student stuck when the adaptive fetch hangs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.branchFetchHangs = true;
    renderQuiz();
    await startQuiz();
    await screen.findByText(/Question standard \d/);

    for (let i = 0; i < 10; i++) {
      await screen.findByText(/Question standard \d/);
      fireEvent.click(screen.getByText("Alpha"));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /next question|finish quiz/i }));
        await vi.advanceTimersByTimeAsync(200);
      });
    }

    // The branch fetch never resolves; the timeout must release the flow and
    // fall back to submitting what we have.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    vi.useRealTimers();
  });
});
