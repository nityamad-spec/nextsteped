# Plan: Stop auto-fixing test failures — require approval first

## Goal

Make it explicit that any failing test (Phase 7 or otherwise) must be reported to you and await your review/approval before code is changed. The agent should not silently patch failing tests.

## Why this matters now

Phase 7 tests are regression guards for the reasoning-follow-up feature. A failure means the implementation may not match the spec (e.g., a Bloom-3+ primary ships without a follow-up, or the mastery penalty math is wrong). Auto-fixing would defeat that signal.

## Proposed changes

1. **Project memory rule**
  Create `mem://constraints/no-auto-fix-on-test-failure.md` as a `constraint` memory:
  - Rule: If any test fails during a turn, stop and report the failure to the user. Do not edit source code, tests, or configuration to make the test pass without explicit user approval.
  - How to report: list the failing test file(s), the specific assertion/error, and a short diagnosis of which part of the implementation likely caused it.
  - Exception: purely cosmetic/typo fixes in test descriptions or comments are allowed only if the user has already approved a broader change in the same turn.
2. **Update `mem://index.md**`
  Add a Core line:  
   `Failing tests are reported, not auto-fixed — wait for user approval before changing code.`
3. **(Optional) Add a repo-visible marker**
  If you want the rule visible outside the memory system, add a short `TESTING.md` note at the project root describing the same policy. This is optional because the memory rule governs agent behavior.

## Workflow after this rule is live

1. Agent runs the relevant test suites after implementation changes.
2. If any test fails, the agent halts code changes and returns a concise report: failing test name, error message, suspected cause, and asks whether to (a) investigate further, (b) attempt a fix, or (c) leave it as-is.
3. Only after you approve does the agent modify code or tests.

## Risks & trade-offs

- **Slower iteration**: every genuine test failure now blocks the agent until you respond. This is the intended cost of preserving test integrity.
- **Flaky tests**: if a test is flaky, the agent will stop on each flake. We may later need to mark known-flaky tests or quarantine them, but that also requires your approval.
- **No CI enforcement**: this rule lives in project memory, so it constrains agent behavior but does not add a GitHub Actions gate. If you later want CI-level enforcement, we can add a workflow that fails on test errors with no auto-fix step.

## Questions before implementing

1. Do you want the optional `TESTING.md` repo marker, or is the memory rule enough? Yes i want the `TESTING.md` repo marker
2. Should the rule apply to lint/typecheck failures as well, or only test failures? Both
3. If a test fails because of an obvious typo in the test itself (e.g., wrong mock data), do you still want to approve the fix, or can the agent fix self-evident test-only typos without asking?  The agent can fix self-evident test-only typos without asking

## Approval requested

Approve this plan and I will create the memory rule and update the index. If you also want CI enforcement, let me know and I will add that as an additional phase.