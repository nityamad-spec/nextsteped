## Update universities list

Data-only change to the `universities` table (used by the student onboarding combobox):

- Insert four rows if not already present:
  - CMR College of Engineering & Technology
  - CMR Engineering College
  - CMR Institute of Technology
  - CMR Technical Campus
- Delete any rows whose name matches "ABC University" (case-insensitive).

No code changes — the onboarding page reads from this table.