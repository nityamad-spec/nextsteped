

## Fix Lesson Plan Display Structure

### Problem
The current lesson plan displays a flat list under "Concepts & Activities" — all resources are shown at the same level. The user wants a **hierarchical, chronological** structure:

1. **Learning Outcomes** (brief checklist)
2. **Concepts** (listed in order for that week)
   - Under each concept: its specific lectures, exercises, activities

### Data Model Change
The current `WorkshopResource` has no concept grouping. Resources need a `concept` field so they can be grouped hierarchically.

**`src/data/workshopPlan.ts`**: Add optional `concept?: string` to `WorkshopResource`. Update mock data so each resource has a concept label (e.g., "Variables & Types", "Control Flow"). Resources with the same concept get grouped together.

### Display Changes (3 files)

All three files that render lesson plans will use the same hierarchical layout:

```text
Week 1: Python Fundamentals
├── Learning Outcomes
│   ✓ Understand variables and data types
│   ✓ Write basic control flow statements
├── Variables & Data Types          ← concept heading
│   ├── Intro to Python Slides      [textbook]
│   ├── Python Setup Guide           [textbook]
│   └── Interactive Coding Exercise  [exercise]
├── Control Flow                    ← concept heading
│   └── Pair Programming: Hello World [lab]
└── Teaching Strategies (collapsible, optional)
```

**Files to update:**
1. **`src/data/workshopPlan.ts`** — Add `concept` field to type and mock data
2. **`src/pages/teacher/ContentLibrary.tsx`** (`renderLessonPlanWeek`) — Group resources by concept, render concept headings with nested activities
3. **`src/pages/student/StudentHome.tsx`** (lesson plan section) — Same hierarchical grouping
4. **`src/pages/teacher/TeachingPlan.tsx`** (resource rendering in edit view) — Group by concept in the display/edit cards

### Rendering Logic
```typescript
// Group resources by concept, preserving order of first appearance
const concepts = resources.reduce((acc, r) => {
  const key = r.concept || "General";
  if (!acc.has(key)) acc.set(key, []);
  acc.get(key).push(r);
  return acc;
}, new Map());

// Render: concept heading → indented activity list
```

### Summary
- Remove the "Overview" section (user only wants Learning Outcomes → Concepts → Activities)
- Remove flat "Concepts & Activities" heading
- Group resources under concept headings in chronological order
- Each concept shows its activities (lectures, exercises, labs) nested beneath it
- Teaching Strategies stays as a collapsible at the bottom

