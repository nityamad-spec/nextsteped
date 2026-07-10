import { describe, it, expect } from "vitest";
import { isTeacherPathAllowed, TEACHER_NAV_ALWAYS_ON } from "@/hooks/useTeacherNavPermissions";

describe("isTeacherPathAllowed", () => {
  const supportOnly = [...TEACHER_NAV_ALWAYS_ON];

  it("newly-approved teacher (Support only) cannot reach dashboard/chat/analytics/content-library", () => {
    expect(isTeacherPathAllowed("/teacher/courses/dashboard", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/chat", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/analytics", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/content-library", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/setup", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/setup/exam-mode", supportOnly)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/support", supportOnly)).toBe(true);
  });

  it("empty allow-list denies every teacher path", () => {
    expect(isTeacherPathAllowed("/teacher/support", [])).toBe(false);
    expect(isTeacherPathAllowed("/teacher/analytics", [])).toBe(false);
  });

  it("granting Setup unlocks setup sub-pages only (not siblings)", () => {
    const allowed = [...TEACHER_NAV_ALWAYS_ON, "/teacher/setup"];
    expect(isTeacherPathAllowed("/teacher/setup", allowed)).toBe(true);
    expect(isTeacherPathAllowed("/teacher/setup/upload", allowed)).toBe(true);
    expect(isTeacherPathAllowed("/teacher/setup/exam-mode", allowed)).toBe(true);
    expect(isTeacherPathAllowed("/teacher/chat", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/analytics", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/content-library", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/courses/dashboard", allowed)).toBe(false);
  });

  it("granting Content Library does not leak Chat/Analytics/Dashboard", () => {
    const allowed = [...TEACHER_NAV_ALWAYS_ON, "/teacher/content-library"];
    expect(isTeacherPathAllowed("/teacher/content-library", allowed)).toBe(true);
    expect(isTeacherPathAllowed("/teacher/chat", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/analytics", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/courses/dashboard", allowed)).toBe(false);
  });

  it("prefix look-alikes are not accepted", () => {
    // Granting /teacher/chat must NOT match /teacher/chatter or /teacher/chat-foo
    const allowed = [...TEACHER_NAV_ALWAYS_ON, "/teacher/chat"];
    expect(isTeacherPathAllowed("/teacher/chat", allowed)).toBe(true);
    expect(isTeacherPathAllowed("/teacher/chatter", allowed)).toBe(false);
    expect(isTeacherPathAllowed("/teacher/chat-foo", allowed)).toBe(false);
  });
});
