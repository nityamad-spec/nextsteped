import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { StarStory } from "@/lib/starStories";

type Row = {
  id: string;
  title: string;
  themes: string[] | null;
  situation: string | null;
  task: string | null;
  action: string | null;
  result: string | null;
  updated_at: string;
};

const toStory = (r: Row): StarStory => ({
  id: r.id,
  title: r.title,
  themes: r.themes ?? [],
  situation: r.situation ?? "",
  task: r.task ?? "",
  action: r.action ?? "",
  result: r.result ?? "",
  updatedAt: r.updated_at,
});

export type StarStoryInput = Omit<StarStory, "id" | "updatedAt">;

/** Loads and mutates the signed-in student's STAR stories for one course. */
export function useStarStories(courseId: string | null) {
  const [stories, setStories] = useState<StarStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) {
      setStories([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("star_stories")
      .select("id,title,themes,situation,task,action,result,updated_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Couldn't load your stories.");
        } else {
          setStories(((data ?? []) as Row[]).map(toStory));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const create = useCallback(
    async (input: StarStoryInput) => {
      if (!courseId) return false;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) {
        toast.error("Please sign in again to save your story.");
        return false;
      }
      const { data, error } = await supabase
        .from("star_stories")
        .insert({ ...input, course_id: courseId, student_id: uid })
        .select("id,title,themes,situation,task,action,result,updated_at")
        .single();
      if (error || !data) {
        toast.error("Couldn't save your story. Try again.");
        return false;
      }
      setStories((prev) => [toStory(data as Row), ...prev]);
      return true;
    },
    [courseId],
  );

  const update = useCallback(async (id: string, input: StarStoryInput) => {
    const { data, error } = await supabase
      .from("star_stories")
      .update(input)
      .eq("id", id)
      .select("id,title,themes,situation,task,action,result,updated_at")
      .single();
    if (error || !data) {
      toast.error("Couldn't save your changes. Try again.");
      return false;
    }
    const next = toStory(data as Row);
    setStories((prev) => prev.map((s) => (s.id === id ? next : s)));
    return true;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("star_stories").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete that story. Try again.");
      return false;
    }
    setStories((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  return { stories, loading, create, update, remove };
}
