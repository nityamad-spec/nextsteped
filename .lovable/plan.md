# Show user email instead of user_id in Admin Setup Debug audit logs

The only audit log shown on `/admin/setup-debug` is the wipe audit table in `src/components/admin/WipeAuditTab.tsx`. It currently renders `user_id.slice(0,8)…`. Replace with the user's email from `profiles.email`.

## Changes

**`src/components/admin/WipeAuditTab.tsx`**

1. Extend `Row` type with `userEmail?: string`.
2. After fetching the page of `wipe_audit_log` rows, collect the distinct `user_id`s and run one lookup:
   ```ts
   const { data: profs } = await supabase
     .from("profiles")
     .select("id, email")
     .in("id", uniqueIds);
   const emailById = new Map(profs?.map(p => [p.id, p.email]));
   const enriched = rows.map(r => ({ ...r, userEmail: emailById.get(r.user_id) }));
   ```
3. Render in the "User" cell: `r.userEmail ?? r.user_id.slice(0,8)+"…"`, with `title={r.user_id}` preserved so the full id is still available on hover.
4. Update the search filter (line 75) and placeholder (line 112) to also match against `userEmail` and read "Filter by course_id / user / error / id…".

No schema or RLS change — admin already has select access to `profiles`.

## Files

- `src/components/admin/WipeAuditTab.tsx` — single file.

## Out of scope

- Other admin pages (no other audit tables surface `user_id` today).
- Caching the profile lookup across renders (page is small, refetch on each load is fine).
