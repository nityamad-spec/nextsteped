import { describe, expect, it } from "vitest";
import { DEMO_STAR_STORIES, isStudentCreatedStory, type StarStory } from "./starStories";

describe("isStudentCreatedStory", () => {
  it("excludes demo stories from Practice progress", () => {
    expect(DEMO_STAR_STORIES.filter(isStudentCreatedStory)).toHaveLength(0);
  });

  it("counts a story created in the current session", () => {
    const story: StarStory = {
      ...DEMO_STAR_STORIES[0],
      id: "local-123",
    };
    expect(isStudentCreatedStory(story)).toBe(true);
  });
});