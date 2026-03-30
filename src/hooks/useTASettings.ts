import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TASettings } from "@/types";
import { defaultTASettings } from "@/data/mockData";

interface DBTASettings {
  id: string;
  course_id: string;
  hint_ladder: boolean;
  knowledge_sources: string;
  plagiarism_warnings: boolean;
  exam_time_limit: number;
  exam_difficulty: string;
  exam_question_mix: string;
  exam_presentation: string | null;
  custom_study_prompt: string | null;
  custom_exam_prompt: string | null;
  quiz_num_questions: number | null;
  quiz_question_mix: string | null;
  quiz_difficulty: string | null;
  quiz_time_limit: number | null;
  exam_approved: boolean;
  quiz_approved: boolean;
  exam_enabled: boolean;
  quiz_enabled: boolean;
  exam_manual_questions: boolean;
  exam_manual_count: number | null;
}

function dbToAppSettings(row: DBTASettings): TASettings {
  return {
    hintLadder: row.hint_ladder,
    knowledgeSources: row.knowledge_sources as TASettings["knowledgeSources"],
    plagiarismWarnings: row.plagiarism_warnings,
    examTimeLimit: row.exam_time_limit,
    examDifficulty: row.exam_difficulty as TASettings["examDifficulty"],
    examQuestionMix: row.exam_question_mix,
    examPresentation: (row.exam_presentation as TASettings["examPresentation"]) || "all_at_once",
    customStudyPrompt: row.custom_study_prompt || "",
    customExamPrompt: row.custom_exam_prompt || "",
    quizNumQuestions: row.quiz_num_questions || 5,
    quizQuestionMix: row.quiz_question_mix || "mixed",
    quizDifficulty: row.quiz_difficulty || "Medium",
    quizTimeLimit: row.quiz_time_limit || 10,
    studySystemPrompt: defaultTASettings.studySystemPrompt,
    examSystemPrompt: defaultTASettings.examSystemPrompt,
    examApproved: row.exam_approved,
    quizApproved: row.quiz_approved,
    examEnabled: row.exam_enabled,
    quizEnabled: row.quiz_enabled,
    examManualQuestions: row.exam_manual_questions,
    examManualCount: row.exam_manual_count,
  };
}

export function useTASettings(courseId: string | null) {
  const [taSettings, setTASettings] = useState<TASettings>(defaultTASettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) {
      setTASettings(defaultTASettings);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("course_ta_settings")
        .select("*")
        .eq("course_id", courseId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching TA settings:", error);
        setTASettings(defaultTASettings);
      } else if (data) {
        setTASettings(dbToAppSettings(data as unknown as DBTASettings));
      } else {
        setTASettings(defaultTASettings);
      }
      setLoading(false);
    };

    fetch();
  }, [courseId]);

  const saveTASettings = useCallback(
    async (settings: TASettings) => {
      if (!courseId) return;

      const row = {
        course_id: courseId,
        hint_ladder: settings.hintLadder,
        knowledge_sources: settings.knowledgeSources,
        plagiarism_warnings: settings.plagiarismWarnings,
        exam_time_limit: settings.examTimeLimit,
        exam_difficulty: settings.examDifficulty,
        exam_question_mix: settings.examQuestionMix,
        exam_presentation: settings.examPresentation || "all_at_once",
        custom_study_prompt: settings.customStudyPrompt || "",
        custom_exam_prompt: settings.customExamPrompt || "",
        quiz_num_questions: settings.quizNumQuestions || 5,
        quiz_question_mix: settings.quizQuestionMix || "mixed",
        quiz_difficulty: settings.quizDifficulty || "Medium",
        quiz_time_limit: settings.quizTimeLimit || 10,
        exam_approved: settings.examApproved ?? false,
        quiz_approved: settings.quizApproved ?? false,
        exam_enabled: settings.examEnabled ?? false,
        quiz_enabled: settings.quizEnabled ?? false,
        exam_manual_questions: settings.examManualQuestions ?? false,
        exam_manual_count: settings.examManualCount ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("course_ta_settings")
        .upsert(row, { onConflict: "course_id" });

      if (error) {
        console.error("Error saving TA settings:", error);
        throw error;
      }

      setTASettings(settings);
    },
    [courseId]
  );

  return { taSettings, loading, saveTASettings };
}
