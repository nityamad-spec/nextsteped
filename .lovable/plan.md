## Root cause

The **Generative AI Leader** course has `roster_enforcement = true` with 103 approved emails. When a student whose email is NOT on that roster hits **Enroll & Take Diagnostic**, the `enroll-additional-course` edge function correctly returns:

```
403 { "error": "Your email isn't on this course's approved roster. Please contact your instructor." }
```

However, `src/components/AddCourseDialog.tsx` uses `supabase.functions.invoke(...)`. When the function returns any non-2xx, supabase-js throws a `FunctionsHttpError` whose `.message` is the generic string **"Edge Function returned a non-2xx status code"** and does not populate `data`. The dialog's `catch` block just toasts `err.message`, so the specific roster message never reaches the user.

So the error the user sees is real but masked — the actual reason is almost certainly that their email isn't on the approved roster for that course (or, less likely, enrollment is closed / code stale — but the live validator already showed ✓ so those are ruled out here).

## Fix

Update `src/components/AddCourseDialog.tsx` `submit()` to read the JSON body from `FunctionsHttpError` before falling back to a generic message:

```ts
} catch (err: any) {
  let msg = err?.message || "Couldn't enroll. Please try again.";
  try {
    const body = await err?.context?.json?.();
    if (body?.error) msg = body.error;
  } catch { /* ignore */ }
  toast.error(msg);
}
```

Apply the same body-extraction pattern to the `validate-enrollment-code` invoke catch block in the same file for consistency.

No backend changes. No schema changes. UI-only fix so students see the actual reason (roster mismatch, closed enrollment, etc.) instead of the generic non-2xx message.

## Verification

- Try enrolling with an email not on the roster for `de0bed1a` → toast should read: *"Your email isn't on this course's approved roster. Please contact your instructor."*
- Try with an allow-listed email → succeeds and routes to diagnostic.
