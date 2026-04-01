/**
 * Single source of truth for the workshop lesson plan.
 * Both the professor's TeachingPlan and the student's StudentHome import from here
 * so that any changes approved during setup are reflected everywhere.
 */

export type WorkshopResource = {
  id: string;
  title: string;
  action: string;
  type: "textbook" | "lab" | "case-study" | "exercise" | "article" | "news" | "tool" | "video" | "quiz";
  source?: string;
  provenance?: "uploads" | "web" | "instructor";
};

export type WorkshopDay = {
  id: string;
  day: number;
  dates: string;
  topic: string;
  resources: WorkshopResource[];
  weightage: number;
  locked: boolean;
};

export const workshopPlan: WorkshopDay[] = [
  {
    id: "d1", day: 1, dates: "Day 1",
    topic: "Python Fundamentals: Variables, Data Types & Control Flow",
    weightage: 30, locked: false,
    resources: [
      { id: "r1", title: "Intro to Python Slides", action: "Cover variables, data types, operators, and basic I/O", type: "textbook", provenance: "uploads" },
      { id: "r2", title: "Python Setup Guide", action: "Install Python and set up IDE", type: "textbook", provenance: "uploads" },
      { id: "r4", title: "Interactive Coding Exercise", action: "Practice variables and data types in live session", type: "exercise", provenance: "uploads" },
      { id: "r5", title: "Pair Programming: Hello World Variations", action: "Work with a partner to create creative output programs — build communication and collaboration skills", type: "lab", provenance: "instructor" },
    ],
  },
  {
    id: "d2", day: 2, dates: "Day 2",
    topic: "Functions, Lists & Dictionaries",
    weightage: 40, locked: true,
    resources: [
      { id: "r3", title: "Functions & Data Structures Slides", action: "Function definitions, parameters, lists, and dictionaries", type: "textbook", provenance: "uploads" },
      { id: "r11", title: "Calculator Lab", action: "Build a calculator using functions", type: "lab", provenance: "uploads" },
      { id: "r6", title: "List Comprehension Exercise", action: "Practice with list comprehensions and dictionary operations", type: "lab", provenance: "uploads" },
      { id: "r7", title: "Group Mini-Project: Contact Book App", action: "Collaborate in small teams to design and build a contact book using dictionaries — practice teamwork and task delegation", type: "exercise", provenance: "instructor" },
    ],
  },
  {
    id: "d3", day: 3, dates: "Day 3",
    topic: "File Handling, OOP Basics & Review",
    weightage: 30, locked: true,
    resources: [
      { id: "r18", title: "OOP & File Handling Slides", action: "Classes, objects, file reading/writing", type: "textbook", provenance: "uploads" },
      { id: "r21", title: "File Organizer Project", action: "Build a simple file organizer script", type: "exercise", provenance: "uploads" },
      { id: "r16", title: "Workshop Review Sheet", action: "Comprehensive review covering all workshop topics", type: "textbook", provenance: "uploads" },
      { id: "r22", title: "Oral Presentation: Project Showcase", action: "Present your File Organizer project to the class — develop public speaking and technical communication skills", type: "exercise", provenance: "instructor" },
      { id: "r23", title: "Peer Code Review Session", action: "Review and give constructive feedback on a classmate's code — strengthen critical thinking and peer learning", type: "lab", provenance: "instructor" },
    ],
  },
];
