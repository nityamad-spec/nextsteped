# Refine Resources and Compensation comparison UI

## Compensation page

- Restyle the three tier summary boxes as clearly differentiated tinted panels:
  - Tier-1: light green surface with matching green border, marker, and readable text.
  - Mid-tier: light amber surface with matching amber border, marker, and readable text.
  - AI-first startups: light violet surface with matching violet border, marker, and readable text.
- Apply the same tier color language consistently to the tier labels, range bars, and expanded details using theme-safe color tokens.
- Change range expansion from single-selection to independent multi-selection, so students can keep any number of role/tier boxes open for side-by-side comparison and close each one individually.
- Remove the gray “Each bar sits on the same…” information strip entirely.
- Give “Highest ceiling,” “Best balance,” and “Fast start” distinct, intentional label colors even when their underlying result happens to come from the same company tier.
- Add the missing period to “Largest equity grants in this table.” in the stored compensation data and preserve consistent sentence punctuation across the displayed detail.

## Resources page

- Give the Companies and Compensation entry buttons distinct visual identities rather than identical cards:
  - Companies: green-tinted icon/surface treatment.
  - Compensation: violet-tinted icon/surface treatment.
- Keep both treatments aligned with the current light NextStep design and maintain clear hover, focus, and mobile states.
- Add a concise subheading below the Companies title explaining that students can compare target employers, pay ranges, roles, interview formats, rounds, difficulty, and preparation guidance.

## Technical details

- Extend the existing semantic color tokens for tier and resource-category surfaces, borders, and foregrounds, including dark-theme equivalents.
- Replace the compensation component’s single open key with a set of open keys, toggled independently.
- Update the one affected compensation matrix record in the shared backend; no schema change is needed.
- Keep all current filters, company details, careers links, and compensation calculations unchanged.

## Verification

- Check desktop and mobile layouts for the Resources overview, Companies list, and Compensation matrix.
- Confirm multiple compensation cells remain open simultaneously and each can close independently.
- Confirm tier panels and highlight labels are visually distinct, readable, and consistent in light and dark themes.
- Run the existing type check and report any unrelated failures without changing them.
