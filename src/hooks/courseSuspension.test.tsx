import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * Integration tests: per-course suspension must isolate to a single enrollment.
 *
 * A student enrolled in COURSE_A (suspended) and COURSE_B (active) must:
 *  - be blocked from COURSE_A,
 *  - keep full access to COURSE_B,
 *  - never be auto-resolved into the suspended course.
 */

const STUDENT = "student-1";
const COURSE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const COURSE_B = "bbbbbbbb-0000-0000-0000-000000000002";

interface EnrollmentRow {
  student_id: string;
  course_id: string;
  enrolled_at: string;
  suspended_at: string | null;
}

let enrollments: EnrollmentRow[] = [];
let profile: { active_course_id: string | null } = { active_course_id: null };
const profileUpdates: any[] = [];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: STUDENT } }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = (table: string) => {
    const filters: Record<string, string> = {};
    let orderDesc = false;

    const rows = () => {
      if (table === "enrollments") {
        let out = enrollments.filter((r) =>
          Object.entries(filters).every(([k, v]) => (r as any)[k] === v),
        );
        if (orderDesc) {
          out = [...out].sort((a, b) => (a.enrolled_at < b.enrolled_at ? 1 : -1));
        }
        return out;
      }
      if (table === "profiles") return [profile];
      if (table === "courses") return [{ id: filters.id, name: "Course" }];
      return [];
    };

    const chain: any = {
      select: () => chain,
      eq: (col: string, val: string) => {
        filters[col] = val;
        return chain;
      },
      order: () => {
        orderDesc = true;
        return chain;
      },
      update: (payload: any) => {
        profileUpdates.push(payload);
        if (table === "profiles") profile = { ...profile, ...payload };
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows(), error: null }),
    };
    return chain;
  };

  return { supabase: { from: (table: string) => makeQuery(table) } };
});

import { useCourseAccess } from "./useCourseAccess";
import { useEnrolledCourseId } from "./useEnrolledCourseId";

beforeEach(() => {
  localStorage.clear();
  profileUpdates.length = 0;
  profile = { active_course_id: null };
  enrollments = [
    {
      student_id: STUDENT,
      course_id: COURSE_A,
      enrolled_at: "2026-01-02T00:00:00Z",
      suspended_at: "2026-08-01T00:00:00Z",
    },
    {
      student_id: STUDENT,
      course_id: COURSE_B,
      enrolled_at: "2026-01-01T00:00:00Z",
      suspended_at: null,
    },
  ];
});

describe("per-course suspension isolation", () => {
  it("blocks the suspended course only", async () => {
    const a = renderHook(() => useCourseAccess(COURSE_A));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.suspended).toBe(true);

    const b = renderHook(() => useCourseAccess(COURSE_B));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.suspended).toBe(false);
  });

  it("auto-resolves to the active course when no course is cached", async () => {
    const { result } = renderHook(() => useEnrolledCourseId());
    await waitFor(() => expect(result.current).toBe(COURSE_B));
    expect(localStorage.getItem("enrolledCourseId")).toBe(COURSE_B);
  });

  it("does not prefer the suspended course even when it is the most recent enrollment", async () => {
    const { result } = renderHook(() => useEnrolledCourseId());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).not.toBe(COURSE_A);
  });

  it("keeps a still-valid cached suspended course selected (so the notice can render)", async () => {
    localStorage.setItem("enrolledCourseId", COURSE_A);
    const { result } = renderHook(() => useEnrolledCourseId());
    await waitFor(() => expect(result.current).toBe(COURSE_A));

    const access = renderHook(() => useCourseAccess(COURSE_A));
    await waitFor(() => expect(access.result.current.loading).toBe(false));
    expect(access.result.current.suspended).toBe(true);
  });

  it("reactivating course A restores access without touching course B", async () => {
    enrollments = enrollments.map((r) =>
      r.course_id === COURSE_A ? { ...r, suspended_at: null } : r,
    );

    const a = renderHook(() => useCourseAccess(COURSE_A));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.suspended).toBe(false);

    const b = renderHook(() => useCourseAccess(COURSE_B));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.suspended).toBe(false);
  });

  it("suspending every enrollment still resolves a course (student sees the notice, not a blank app)", async () => {
    enrollments = enrollments.map((r) => ({ ...r, suspended_at: "2026-08-01T00:00:00Z" }));
    const { result } = renderHook(() => useEnrolledCourseId());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect([COURSE_A, COURSE_B]).toContain(result.current);
  });
});
