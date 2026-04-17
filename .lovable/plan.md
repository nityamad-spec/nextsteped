

## Goal
Define a **JSON-shaped template** for the syllabus context block returned by `fetchSyllabusContext`. The LLM receives structured JSON instead of labeled prose, so it can parse `objectives`, `outcomes`, and per-week `topic` fields unambiguously — no risk of conflating sections or misreading week numbers.

This plan defines the template only (chat output). No code changes.

## The template

A single fenced JSON block, minified to save chars, with short field names:

```text
SYLLABUS_CONTEXT (JSON):
{"course":{"code":"CS101","title":"Intro to Python","term":"Fall 2025"},
"summary":"Foundational Python: syntax, data structures, problem-solving.",
"objectives":["Build fluency with Python syntax","Apply control flow and functions","Read and debug small programs"],
"outcomes":["Write working Python scripts","Decompose problems into functions","Use lists/dicts idiomatically"],
"schedule":[
{"w":1,"topic":"Variables & types","desc":"primitives, assignment, I/O"},
{"w":2,"topic":"Control flow","desc":"if/else, loops, booleans"},
{"w":3,"topic":"Functions","desc":"defs, args, return, scope"},
...
{"w":16,"topic":"Final project","desc":"capstone integration"}
]}
```

## Why JSON over labeled prose

| Property | Benefit |
|---|---|
| **Unambiguous field names** (`objectives` vs `outcomes`) | Model can't conflate them — the key *is* the label |
| **Numeric `w` field** | "Week 3" maps to `"w":3` — exact int match, no `W03` vs `W3` ambiguity |
| **Array structure** | Model knows objective count, can iterate; no "is this the last bullet?" guessing |
| **Single fenced block** with `SYLLABUS_CONTEXT` prefix | Easy for model to locate and treat as authoritative course data |
| **Minified (no pretty-print)** | Saves ~30% chars vs indented JSON — more weeks/objectives fit in 2,000-char cap |
| **Short keys** (`w`, `desc` not `weekNumber`, `description`) | Char savings compound across 16 weeks |

## Budget allocation (total: 2,000 chars)

| Block | Hard cap | Notes |
|---|---|---|
| `course` + `summary` | 300 | Stable header |
| `objectives` (≤6 items, ≤120 chars each) | 450 | JSON quoting overhead ~5 chars/item |
| `outcomes` (≤6 items, ≤120 chars each) | 450 | Same |
| `schedule` (16 weeks × ~50 chars) | 800 | `{"w":N,"topic":"...","desc":"..."}` ≈ 50 chars |

## Per-field truncation rules

- Objectives/outcomes: trim to 120 chars, suffix `…` if cut
- `topic`: trim to 40 chars
- `desc`: trim to 60 chars
- Drop excess objectives/outcomes (keep first 6) — never truncate mid-string
- **Escape quotes/backslashes** in any string field before serializing (avoid breaking JSON)
- Omit empty arrays entirely (no `"objectives":[]`)
- Final `.slice(0, 2000)` safety guard kept

## Concrete worked example (~750 chars)

```text
SYLLABUS_CONTEXT (JSON):
{"course":{"code":"CS101","title":"Intro to Python","term":"Fall 2025"},
"summary":"Foundational programming course covering Python syntax, data structures, and problem-solving.",
"objectives":["Build fluency with Python syntax and core data types","Apply control flow and functions to solve problems","Read and debug small Python programs"],
"outcomes":["Write working Python scripts using variables, loops, and functions","Decompose problems into reusable functions","Use lists, dicts, and strings idiomatically"],
"schedule":[
{"w":1,"topic":"Variables & types","desc":"primitives, assignment, basic I/O"},
{"w":2,"topic":"Control flow","desc":"if/else, for/while, boolean logic"},
{"w":3,"topic":"Functions","desc":"defs, args, return, scope"},
{"w":4,"topic":"Lists & tuples","desc":"indexing, slicing, iteration"},
{"w":5,"topic":"Dictionaries & sets","desc":"key/value, lookup, membership"}
]}
```

## Trade-offs vs prose template

- **Pro**: zero ambiguity, machine-parseable if we ever want to log/inspect the context
- **Con**: ~10–15% more char overhead from JSON syntax (`{}`, `""`, `,`) — partially offset by short keys and minification
- **Con**: slightly less human-readable in edge function logs

## Scope

- This plan defines the **chat output template only**. No code changes proposed here.
- If approved, the follow-up edit wires this shape into `fetchSyllabusContext` in `supabase/functions/chat/index.ts` (single function rewrite, ~30 lines).

