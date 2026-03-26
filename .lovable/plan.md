

## Plan: Add All Teachers as Collaborators to PWIM Course

### Current State
- **1 course** exists: `PWIM` (id: `cc551ce8-378e-468b-969b-b99bb1c04495`, owner: `b976c587...` / Rhea)
- **3 teacher profiles**: Akash (`b58dc64d...`), X (`93fc4b95...`), Rhea (`b976c587...`)
- **No other courses** exist, so no deletion needed
- `course_teachers` table is empty

### Data Operations (via insert tool)

Insert 3 rows into `course_teachers`:

```sql
INSERT INTO course_teachers (course_id, teacher_id, role) VALUES
  ('cc551ce8-378e-468b-969b-b99bb1c04495', 'b976c587-6e7a-4121-89ab-69f3bb00dbae', 'owner'),
  ('cc551ce8-378e-468b-969b-b99bb1c04495', 'b58dc64d-d1e4-4411-8dc1-743f50bc6a11', 'collaborator'),
  ('cc551ce8-378e-468b-969b-b99bb1c04495', '93fc4b95-32b9-4f17-890d-f87f17f98e7e', 'collaborator');
```

- Rhea (the `courses.teacher_id` owner) gets role `'owner'`
- Akash and X get role `'collaborator'`
- No schema changes or code changes needed — this is a data-only operation

