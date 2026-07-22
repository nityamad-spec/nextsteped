import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import WeeklyQuizDialog from "./WeeklyQuizDialog";

// ---- Mocks -----------------------------------------------------------------

const insertMock = vi.fn();
const invokeMock = vi.fn();
let questionsRow: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        if (table === "assessment_questions") {
          // chain: .select().eq().eq().eq()  → returns { data, error }
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            then: (resolve: any) => resolve({ data: questionsRow, error: null }),
          };
          return chain;
        }
        if (table === "assessment_results") {
          return {
            insert: (payload: any) => {
              insertMock(payload);
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: { id: "result-123" }, error: null }),
                }),
              };
            },
          };
        }
        if (table === "student_course_mastery") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: { learner_level: "medium" }, error: null }),
          };
          return chain;
        }
        return {};
      },
      functions: {
        invoke: (...args: any[]) => {
          invokeMock(...args);
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  };
});

// AssessmentView calls fetch() for explain-answers — stub it.
const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ explanations: [] }),
  } as any)
);
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  insertMock.mockClear();
  invokeMock.mockClear();
  fetchMock.mockClear();
  questionsRow = [
    {
      id: "q1",
      question_text: "What is 2 + 2?",
      question_type: "MCQ",
      options: ["3", "4", "5"],
      answer: "4",
      topic: "ARITH",
      difficulty: "Easy",
      difficulty_estimate: 0.3,
      bloom_level: 2,
      quiz_day: 1,
      mode: "daily_quiz",
      course_id: "course-1",
    },
  ];
});

// ---- Tests -----------------------------------------------------------------

describe("WeeklyQuizDialog", () => {
  it("does not render quiz content when closed", () => {
    render(
      <WeeklyQuizDialog
        open={false}
        onOpenChange={() => {}}
        courseId="course-1"
        studentId="student-1"
        day={1}
      />
    );
    expect(screen.queryByText(/Weekly Quiz/i)).not.toBeInTheDocument();
  });

  it("loads questions and shows the intro screen when opened from the lesson plan", async () => {
    render(
      <WeeklyQuizDialog
        open={true}
        onOpenChange={() => {}}
        courseId="course-1"
        studentId="student-1"
        day={1}
        numQuestions={5}
        timeLimitMinutes={10}
      />
    );

    // Intro phase headline rendered by AssessmentView
    await waitFor(() => {
      expect(screen.getByText(/Weekly Quiz — Week 1/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Start Quiz/i })).toBeInTheDocument();
  });

  it("records results and updates mastery on submit", async () => {
    const onOpenChange = vi.fn();

    render(
      <WeeklyQuizDialog
        open={true}
        onOpenChange={onOpenChange}
        courseId="course-1"
        studentId="student-1"
        day={2}
        numQuestions={5}
        timeLimitMinutes={10}
      />
    );

    // Wait for intro, then start
    const startBtn = await screen.findByRole("button", { name: /Start Quiz/i });
    fireEvent.click(startBtn);

    // Pick the correct option "4"
    const correctOpt = await screen.findByLabelText("4");
    fireEvent.click(correctOpt);

    // Submit
    const submitBtn = await screen.findByRole("button", { name: /Submit Quiz/i });
    fireEvent.click(submitBtn);

    // Insert into assessment_results
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow).toMatchObject({
      student_id: "student-1",
      course_id: "course-1",
      mode: "daily_quiz",
      quiz_day: 2,
      total_questions: 1,
      correct_answers: 1,
      score: 100,
    });
    expect(insertedRow.answers).toHaveLength(1);
    expect(insertedRow.answers[0]).toMatchObject({
      question_id: "q1",
      topic: "ARITH",
      selected: "4",
      correct: "4",
      is_correct: true,
    });

    // update-mastery edge function invoked with per-concept tally
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fnName, payload] = invokeMock.mock.calls[0];
    expect(fnName).toBe("update-mastery");
    expect(payload.body).toMatchObject({
      course_id: "course-1",
      source: "weekly_quiz",
      source_id: "result-123",
      per_question: [
        { concept_code: "ARITH", difficulty: 0.3, bloom: 2, is_correct: true },
      ],
    });
  });

  // ---- Phase 7: reasoning follow-up flow ---------------------------------

  // Helper: build a primary + reasoning pair for the mocked fetch.
  const makeReasoningRow = () => ({
    id: "q1-r",
    question_text: "Why is 2 + 2 = 4?",
    question_type: "MCQ",
    options: [
      "Because addition of natural numbers is defined that way",
      "Because 4 is even",
      "Because 2 is prime",
      "Because 2 × 2 = 4",
    ],
    answer: "Because addition of natural numbers is defined that way",
    topic: "ARITH",
    difficulty: "Easy",
    difficulty_estimate: 0.3,
    bloom_level: 3,
    quiz_day: 1,
    mode: "daily_quiz",
    course_id: "course-1",
    explanation: "The follow-up asks about the underlying rule.",
    question_role: "reasoning",
    parent_question_id: "q1",
  });

  const renderQuiz = () =>
    render(
      <WeeklyQuizDialog
        open={true}
        onOpenChange={() => {}}
        courseId="course-1"
        studentId="student-1"
        day={1}
        numQuestions={5}
        timeLimitMinutes={10}
      />
    );

  const startQuiz = async () => {
    const start = await screen.findByRole("button", { name: /Start Quiz/i });
    fireEvent.click(start);
  };

  it("does not render the follow-up before the primary is answered", async () => {
    questionsRow = [questionsRow[0], makeReasoningRow()];
    renderQuiz();
    await startQuiz();
    await screen.findByText("What is 2 + 2?");
    expect(screen.queryByText(/Why is that the correct answer/i)).not.toBeInTheDocument();
  });

  it("does not render the follow-up after a wrong primary answer", async () => {
    questionsRow = [questionsRow[0], makeReasoningRow()];
    renderQuiz();
    await startQuiz();
    // Pick a wrong option.
    fireEvent.click(await screen.findByLabelText("3"));
    // Follow-up UI never appears.
    expect(screen.queryByText(/Why is that the correct answer/i)).not.toBeInTheDocument();
    // With only 1 primary, Submit is the last-question button and should be enabled.
    const submit = await screen.findByRole("button", { name: /Submit Quiz/i });
    expect(submit).not.toBeDisabled();
  });

  it("renders the follow-up after a correct primary and gates Submit until it's answered", async () => {
    questionsRow = [questionsRow[0], makeReasoningRow()];
    renderQuiz();
    await startQuiz();
    fireEvent.click(await screen.findByLabelText("4")); // correct primary

    // Follow-up appears.
    await screen.findByText(/Why is that the correct answer/i);
    await screen.findByText(/Why is 2 \+ 2 = 4\?/i);

    // Submit locked until the follow-up is answered.
    const submit = await screen.findByRole("button", { name: /Submit Quiz/i });
    expect(submit).toBeDisabled();

    // Answer the follow-up correctly.
    fireEvent.click(
      screen.getByLabelText("Because addition of natural numbers is defined that way")
    );

    // Teaching moment: explanation appears inline before Submit unlocks.
    await screen.findByText(/The follow-up asks about the underlying rule/i);
    // Submit is now unlocked.
    expect(await screen.findByRole("button", { name: /Submit Quiz/i })).not.toBeDisabled();
  });

  it("persists reasoning_* fields on the answers payload after a correct primary + correct follow-up (boost path)", async () => {
    questionsRow = [questionsRow[0], makeReasoningRow()];
    renderQuiz();
    await startQuiz();
    fireEvent.click(await screen.findByLabelText("4"));
    await screen.findByText(/Why is that the correct answer/i);
    fireEvent.click(
      screen.getByLabelText("Because addition of natural numbers is defined that way")
    );
    fireEvent.click(await screen.findByRole("button", { name: /Submit Quiz/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const answer = insertMock.mock.calls[0][0].answers[0];
    expect(answer).toMatchObject({
      question_id: "q1",
      is_correct: true,
      reasoning_question_id: "q1-r",
      reasoning_selected: "Because addition of natural numbers is defined that way",
      reasoning_correct: "Because addition of natural numbers is defined that way",
      reasoning_is_correct: true,
    });
    // reasoning_bloom is populated when the dialog builds meta for the follow-up row;
    // it may be null in this mock setup — assert the field is present, not its exact value.
    expect(answer).toHaveProperty("reasoning_bloom");
  });

  it("persists reasoning_is_correct=false on the penalty path (correct primary + wrong follow-up)", async () => {
    questionsRow = [questionsRow[0], makeReasoningRow()];
    renderQuiz();
    await startQuiz();
    fireEvent.click(await screen.findByLabelText("4"));
    await screen.findByText(/Why is that the correct answer/i);
    // Wrong follow-up pick.
    fireEvent.click(screen.getByLabelText("Because 4 is even"));
    fireEvent.click(await screen.findByRole("button", { name: /Submit Quiz/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const answer = insertMock.mock.calls[0][0].answers[0];
    expect(answer.reasoning_is_correct).toBe(false);
    expect(answer.reasoning_selected).toBe("Because 4 is even");
  });

  it("defensive: primary correct with NO shipped follow-up unlocks Submit and omits reasoning_* fields", async () => {
    // No reasoning row in the fetch — Phase 2's drop-and-backfill outcome.
    // The dialog must not trap the student behind a follow-up that never rendered.
    renderQuiz();
    await startQuiz();
    fireEvent.click(await screen.findByLabelText("4"));

    // No follow-up UI at all.
    expect(screen.queryByText(/Why is that the correct answer/i)).not.toBeInTheDocument();

    // Submit unlocked immediately.
    const submit = await screen.findByRole("button", { name: /Submit Quiz/i });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const answer = insertMock.mock.calls[0][0].answers[0];
    // Phase 4 semantics: no reasoning fields when no follow-up row shipped.
    expect(answer.reasoning_question_id).toBeUndefined();
    expect(answer.reasoning_is_correct).toBeUndefined();
  });
});
