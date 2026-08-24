import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CodingExercisesSection, { type CodingSectionWeek } from "./CodingExercisesSection";
import type { CodingExercise } from "@/lib/codingExercises";

// ---- Mocks -----------------------------------------------------------------

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

const fetchWeekExercisesMock = vi.fn();
const updateExerciseMock = vi.fn();
const setPublishedMock = vi.fn();
const deleteExerciseMock = vi.fn();

vi.mock("@/lib/codingExercises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/codingExercises")>();
  return {
    ...actual,
    fetchWeekExercises: (...args: any[]) => fetchWeekExercisesMock(...args),
    updateExercise: (...args: any[]) => updateExerciseMock(...args),
    setWeekExercisesPublished: (...args: any[]) => setPublishedMock(...args),
    deleteExercise: (...args: any[]) => deleteExerciseMock(...args),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
    }),
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: "tok" } } }),
    },
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ---- Fixtures --------------------------------------------------------------

const week: CodingSectionWeek = {
  week: 2,
  week_name: "Coding week",
  overview: "",
  is_exam_week: false,
  is_coding_week: true,
  locked: false,
  concepts: [{ id: "c1", name: "Concept 1" }],
  resources: [],
};

let exerciseSeq = 0;
const makeExercise = (overrides: Partial<CodingExercise> = {}): CodingExercise => ({
  id: `ex-${++exerciseSeq}`,
  course_id: "course-1",
  week_number: 2,
  position: exerciseSeq,
  title: `Exercise ${exerciseSeq}`,
  problem_statement: "Do the thing",
  language: "python",
  input_spec: "stdin",
  output_spec: "stdout",
  constraints: null,
  examples: [{ input: "1", output: "2" }],
  starter_code: null,
  primary_language: null,
  standard_test_cases: [{ input: "1", expected_output: "2" }],
  published: false,
  published_at: null,
  reviewed_at: null,
  reference_solution: "print(2)",
  hidden_test_cases: [{ input: "9", expected_output: "10" }],
  ...overrides,
});

const renderSection = () =>
  render(<CodingExercisesSection courseId="course-1" week={week} codingApproved />);

beforeEach(() => {
  vi.clearAllMocks();
  exerciseSeq = 0;
  fetchWeekExercisesMock.mockResolvedValue([]);
  updateExerciseMock.mockResolvedValue(undefined);
  setPublishedMock.mockResolvedValue(undefined);
});

// ---- Tests -----------------------------------------------------------------

describe("CodingExercisesSection — review flow", () => {
  it("blocks publishing while any exercise is unreviewed", async () => {
    fetchWeekExercisesMock.mockResolvedValue([makeExercise()]);
    renderSection();

    const publish = await screen.findByRole("button", { name: "Publish exercises" });
    fireEvent.click(publish);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Review required", variant: "destructive" }),
      ),
    );
    expect(setPublishedMock).not.toHaveBeenCalled();
    expect(screen.getByText("Needs review")).toBeTruthy();
  });

  it("opens the review dialog, marks reviewed, and advances to the next exercise", async () => {
    const rows = [makeExercise(), makeExercise()];
    fetchWeekExercisesMock.mockResolvedValue(rows);
    renderSection();

    const reviewBtn = await screen.findByRole("button", { name: `Review ${rows[0].title}` });
    fireEvent.click(reviewBtn);

    // Review mode chrome
    expect(await screen.findByText("Review coding exercise")).toBeTruthy();
    expect(screen.getByText("Exercise 1 of 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed & next" }));

    await waitFor(() =>
      expect(updateExerciseMock).toHaveBeenCalledWith(
        rows[0].id,
        expect.objectContaining({ title: rows[0].title }),
        { markReviewed: true },
      ),
    );
    expect(await screen.findByText("Exercise 2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save & mark reviewed" })).toBeTruthy();
  });

  it("auto-opens the review dialog over unreviewed exercises after generation", async () => {
    const generated = [makeExercise(), makeExercise()];
    fetchWeekExercisesMock.mockResolvedValue(generated);

    const ndjson = `{"type":"heartbeat"}\n{"type":"result","payload":{"generated":2}}\n`;
    const encoded = new TextEncoder().encode(ndjson);
    let sent = false;
    fetchMock.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: () =>
            sent
              ? Promise.resolve({ value: undefined, done: true })
              : ((sent = true), Promise.resolve({ value: encoded, done: false })),
        }),
      },
      text: () => Promise.resolve(""),
    });

    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Generate exercises" }));

    expect(await screen.findByText("Review coding exercise")).toBeTruthy();
    expect(screen.getByText("Exercise 1 of 2")).toBeTruthy();
  });
});
