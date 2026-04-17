import { supabase } from "@/integrations/supabase/client";

/**
 * Cache scopes used by the chat edge function's RAG layer.
 * Bumping a version forces all warm chat instances to re-fetch on next request.
 */
export type CacheScope = "syllabus" | "concepts" | "questions";

/**
 * Bumps the version counter for a cached RAG resource so the AI assistant
 * picks up the change on its very next call. Best-effort: failures are
 * swallowed (cache will still expire on TTL).
 *
 * @param scope    "syllabus" | "concepts" | "questions"
 * @param scopeId  teacher_id for "syllabus", course_id for the others
 */
export async function bumpCacheVersion(scope: CacheScope, scopeId: string): Promise<void> {
  if (!scopeId) return;
  try {
    const { error } = await supabase.rpc("bump_cache_version" as any, {
      _scope: scope,
      _scope_id: scopeId,
    });
    if (error) {
      console.warn(`[cache] bump ${scope}:${scopeId} failed:`, error.message);
    }
  } catch (e) {
    console.warn(`[cache] bump ${scope}:${scopeId} threw:`, e);
  }
}
