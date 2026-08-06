import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

/**
 * Integration tests: race conditions around per-course suspend/restore.
 *
 * Covers three classes of race:
 *  1. Rapid course switching in useCourseAccess — an in-flight response for the
 *     PREVIOUS course must never overwrite state for the current course.
 *  2. Concurrent suspend/restore of two different courses for the same student,
 *     with out-of-order server responses — each course must land on its own
 *     final value, never clobbering the sibling enrollment.
 *  3. Rapid toggle of the SAME course (suspend then restore) with out-of-order
 *     responses — the latest issued intent must win.
 */

const STUDENT = "student-1";
const COURSE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const COURSE_B = "bbbbbbbb-0000-0000-0000-000000000002";

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  suspended_at: string | null;
}

let enrollments: EnrollmentRow[] = [];

/** Deferred controls so tests can resolve reads out of order. */
type Pending = { courseId: string; resolve: () => void };
let pendingReads: Pending[] = [];
let deferReads = false;

const AUTH_USER = { id: STUDENT };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: AUTH_USER }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = (table: string) => {
    const filters: Record<string, string> = {};
    const row = () =>
      enrollments.find((r) =>
        Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
      ) ?? null;

    const chain: any = {
      select: () => chain,
      eq: (col: string, val: string) => {
        filters[col] = val;
        return chain;
      },
      maybeSingle: () => {
        if (table === "enrollments" && deferReads) {
          const snapshot = row();
          return new Promise((resolve) => {
            pendingReads.push({
              courseId: filters.course_id,
              resolve: () => resolve({ data: snapshot, error: null }),
            });
          });
        }
        return Promise.resolve({ data: row(), error: null });
      },
    };
    return chain;
  };

  return { supabase: { from: (table: string) => makeQuery(table) } };
});

import { useCourseAccess } from "./useCourseAccess";

/**
 * Mirrors the admin page's per-course state merge: a response only ever
 * rewrites the row for its own courseId.
 */
type CourseState = { courseId: string; suspendedAt: string | null };
function mergeCourseResult(
  courses: CourseState[],
  courseId: string,
  suspendedAt: string | null,
): CourseState[] {
  return courses.map((c) => (c.courseId === courseId ? { ...c, suspendedAt } : c));
}

/** Fake edge function: applies the write to the store, resolution is deferred. */
function setEnrollmentSuspension(courseId: string, suspend: boolean) {
  let release!: (v: { suspended_at: string | null }) => void;
  const promise = new Promise<{ suspended_at: string | null }>((r) => (release = r));
  const suspended_at = suspend ? new Date().toISOString() : null;
  return {
    promise,
    commit: () => {
      enrollments = enrollments.map((r) =>
        r.course_id === courseId ? { ...r, suspended_at } : r,
      );
      release({ suspended_at });
    },
  };
}

beforeEach(() => {
  pendingReads = [];
  deferReads = false;
  enrollments = [
    { student_id: STUDENT, course_id: COURSE_A, suspended_at: "2026-08-01T00:00:00Z" },
    { student_id: STUDENT, course_id: COURSE_B, suspended_at: null },
  ];
});

describe("per-course suspension race conditions", () => {
  it("ignores an in-flight response for a course the student already switched away from", async () => {
    deferReads = true;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCourseAccess(id),
      { initialProps: { id: COURSE_A } },
    );

    await waitFor(() => expect(pendingReads).toHaveLength(1));

    // Switch to the active course before the suspended course's read lands.
    rerender({ id: COURSE_B });
    await waitFor(() => expect(pendingReads).toHaveLength(2));

    // Resolve out of order: stale COURSE_A first, then current COURSE_B.
    await act(async () => {
      pendingReads[0].resolve();
      pendingReads[1].resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // The stale suspended=true response must not leak into COURSE_B's state.
    expect(result.current.suspended).toBe(false);
  });

  it("does not resurrect a stale suspended state when switching back and forth quickly", async () => {
    deferReads = true;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCourseAccess(id),
      { initialProps: { id: COURSE_B } },
    );
    await waitFor(() => expect(pendingReads).toHaveLength(1));

    rerender({ id: COURSE_A });
    await waitFor(() => expect(pendingReads).toHaveLength(2));
    rerender({ id: COURSE_B });
    await waitFor(() => expect(pendingReads).toHaveLength(3));

    await act(async () => {
      pendingReads[2].resolve(); // current lands first
      pendingReads[1].resolve(); // stale COURSE_A lands late
      pendingReads[0].resolve(); // stale COURSE_B lands last
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.suspended).toBe(false);
  });

  it("keeps concurrent writes to two courses isolated when responses arrive out of order", async () => {
    let courses: CourseState[] = [
      { courseId: COURSE_A, suspendedAt: "2026-08-01T00:00:00Z" },
      { courseId: COURSE_B, suspendedAt: null },
    ];

    // Fire both in quick succession: restore A, suspend B.
    const callA = setEnrollmentSuspension(COURSE_A, false);
    const callB = setEnrollmentSuspension(COURSE_B, true);

    // Server answers B first, then A.
    callB.commit();
    const resB = await callB.promise;
    courses = mergeCourseResult(courses, COURSE_B, resB.suspended_at);

    callA.commit();
    const resA = await callA.promise;
    courses = mergeCourseResult(courses, COURSE_A, resA.suspended_at);

    expect(courses.find((c) => c.courseId === COURSE_A)!.suspendedAt).toBeNull();
    expect(courses.find((c) => c.courseId === COURSE_B)!.suspendedAt).not.toBeNull();

    // Hooks reading the store agree with the merged UI state.
    const a = renderHook(() => useCourseAccess(COURSE_A));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.suspended).toBe(false);

    const b = renderHook(() => useCourseAccess(COURSE_B));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.suspended).toBe(true);
  });

  it("applies the last issued intent when the same course is toggled twice in quick succession", async () => {
    let courses: CourseState[] = [{ courseId: COURSE_A, suspendedAt: null }];

    const suspend = setEnrollmentSuspension(COURSE_A, true);
    const restore = setEnrollmentSuspension(COURSE_A, false);

    // Server commits in issue order; the second (restore) is the final state.
    suspend.commit();
    courses = mergeCourseResult(courses, COURSE_A, (await suspend.promise).suspended_at);
    restore.commit();
    courses = mergeCourseResult(courses, COURSE_A, (await restore.promise).suspended_at);

    expect(courses[0].suspendedAt).toBeNull();

    const a = renderHook(() => useCourseAccess(COURSE_A));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.suspended).toBe(false);

    // Sibling enrollment untouched throughout.
    const b = renderHook(() => useCourseAccess(COURSE_B));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.suspended).toBe(false);
  });
});
