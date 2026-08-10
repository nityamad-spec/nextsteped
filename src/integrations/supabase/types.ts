export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      ai_gateway_call_log: {
        Row: {
          attempt: number | null
          context: Json
          course_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          function_name: string
          http_status: number | null
          id: string
          model: string | null
          outcome: string
          purpose: string | null
          request_id: string | null
          teacher_id: string | null
          total_attempts: number | null
        }
        Insert: {
          attempt?: number | null
          context?: Json
          course_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          function_name: string
          http_status?: number | null
          id?: string
          model?: string | null
          outcome: string
          purpose?: string | null
          request_id?: string | null
          teacher_id?: string | null
          total_attempts?: number | null
        }
        Update: {
          attempt?: number | null
          context?: Json
          course_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          function_name?: string
          http_status?: number | null
          id?: string
          model?: string | null
          outcome?: string
          purpose?: string | null
          request_id?: string | null
          teacher_id?: string | null
          total_attempts?: number | null
        }
        Relationships: []
      }
      assessment_attempt_voids: {
        Row: {
          assessment_type: string
          course_id: string
          created_at: string
          id: string
          reason: string
          ref_key: string | null
          student_id: string
        }
        Insert: {
          assessment_type: string
          course_id: string
          created_at?: string
          id?: string
          reason?: string
          ref_key?: string | null
          student_id: string
        }
        Update: {
          assessment_type?: string
          course_id?: string
          created_at?: string
          id?: string
          reason?: string
          ref_key?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempt_voids_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempt_voids_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          answer: string
          answer_max_words: number | null
          bloom_justification: string | null
          bloom_level: number
          concept_id: string
          correct_index: number | null
          course_id: string
          created_at: string
          difficulty: string
          difficulty_estimate: number
          difficulty_justification: string | null
          exam_id: string | null
          explanation: string | null
          format: string
          id: string
          in_test: boolean
          is_distractor: boolean
          item_code: string
          mode: string
          model_answer: string | null
          options: Json | null
          question_text: string
          question_type: string
          quiz_day: number | null
          teacher_id: string
          tier: string
          topic: string
          updated_at: string
        }
        Insert: {
          answer: string
          answer_max_words?: number | null
          bloom_justification?: string | null
          bloom_level?: number
          concept_id: string
          correct_index?: number | null
          course_id: string
          created_at?: string
          difficulty?: string
          difficulty_estimate?: number
          difficulty_justification?: string | null
          exam_id?: string | null
          explanation?: string | null
          format?: string
          id?: string
          in_test?: boolean
          is_distractor?: boolean
          item_code?: string
          mode: string
          model_answer?: string | null
          options?: Json | null
          question_text: string
          question_type?: string
          quiz_day?: number | null
          teacher_id: string
          tier?: string
          topic: string
          updated_at?: string
        }
        Update: {
          answer?: string
          answer_max_words?: number | null
          bloom_justification?: string | null
          bloom_level?: number
          concept_id?: string
          correct_index?: number | null
          course_id?: string
          created_at?: string
          difficulty?: string
          difficulty_estimate?: number
          difficulty_justification?: string | null
          exam_id?: string | null
          explanation?: string | null
          format?: string
          id?: string
          in_test?: boolean
          is_distractor?: boolean
          item_code?: string
          mode?: string
          model_answer?: string | null
          options?: Json | null
          question_text?: string
          question_type?: string
          quiz_day?: number | null
          teacher_id?: string
          tier?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_results: {
        Row: {
          answers: Json
          branch_tier: string | null
          confidences: Json
          correct_answers: number
          course_id: string | null
          created_at: string
          exam_id: string | null
          id: string
          learner_level: string
          mastery_score: number | null
          mode: string
          question_ids: Json
          question_times: Json
          quiz_day: number | null
          score: number
          student_id: string
          time_spent: number
          total_questions: number
        }
        Insert: {
          answers?: Json
          branch_tier?: string | null
          confidences?: Json
          correct_answers: number
          course_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          learner_level?: string
          mastery_score?: number | null
          mode: string
          question_ids?: Json
          question_times?: Json
          quiz_day?: number | null
          score: number
          student_id: string
          time_spent?: number
          total_questions: number
        }
        Update: {
          answers?: Json
          branch_tier?: string | null
          confidences?: Json
          correct_answers?: number
          course_id?: string | null
          created_at?: string
          exam_id?: string | null
          id?: string
          learner_level?: string
          mastery_score?: number | null
          mode?: string
          question_ids?: Json
          question_times?: Json
          quiz_day?: number | null
          score?: number
          student_id?: string
          time_spent?: number
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          degree_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          degree_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          degree_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_versions: {
        Row: {
          scope: string
          scope_id: string
          updated_at: string
          version: number
        }
        Insert: {
          scope: string
          scope_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          scope?: string
          scope_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          code_content: string | null
          code_language: string | null
          content: string
          created_at: string
          has_code: boolean | null
          id: string
          metadata: Json
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          code_content?: string | null
          code_language?: string | null
          content: string
          created_at?: string
          has_code?: boolean | null
          id?: string
          metadata?: Json
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          code_content?: string | null
          code_language?: string | null
          content?: string
          created_at?: string
          has_code?: boolean | null
          id?: string
          metadata?: Json
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          mode: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          concept_code: string
          course_id: string
          created_at: string
          id: string
          weight: number
        }
        Insert: {
          concept_code: string
          course_id: string
          created_at?: string
          id?: string
          weight?: number
        }
        Update: {
          concept_code?: string
          course_id?: string
          created_at?: string
          id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "concepts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_exams: {
        Row: {
          approved: boolean
          archived_at: string | null
          archived_by: string | null
          breakdown: Json
          course_id: string
          created_at: string
          id: string
          kind: string
          label: string
          length_min: number
          position: number
          published_at: string | null
          published_by: string | null
          source: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          archived_at?: string | null
          archived_by?: string | null
          breakdown?: Json
          course_id: string
          created_at?: string
          id: string
          kind?: string
          label: string
          length_min?: number
          position?: number
          published_at?: string | null
          published_by?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          archived_at?: string | null
          archived_by?: string | null
          breakdown?: Json
          course_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string
          length_min?: number
          position?: number
          published_at?: string | null
          published_by?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_exams_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_material_files: {
        Row: {
          content_hash: string | null
          course_id: string
          created_at: string
          file_name: string
          file_size: number
          folder_type: string
          id: string
          rag_chunk_cursor: number
          rag_error: string | null
          rag_indexed_at: string | null
          rag_page_cursor: number
          rag_pass_started_at: string | null
          rag_status: string
          rag_total_pages: number | null
          storage_path: string
          superseded_at: string | null
          superseded_by: string | null
          teacher_id: string
        }
        Insert: {
          content_hash?: string | null
          course_id: string
          created_at?: string
          file_name: string
          file_size: number
          folder_type: string
          id?: string
          rag_chunk_cursor?: number
          rag_error?: string | null
          rag_indexed_at?: string | null
          rag_page_cursor?: number
          rag_pass_started_at?: string | null
          rag_status?: string
          rag_total_pages?: number | null
          storage_path: string
          superseded_at?: string | null
          superseded_by?: string | null
          teacher_id: string
        }
        Update: {
          content_hash?: string | null
          course_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          folder_type?: string
          id?: string
          rag_chunk_cursor?: number
          rag_error?: string | null
          rag_indexed_at?: string | null
          rag_page_cursor?: number
          rag_pass_started_at?: string | null
          rag_status?: string
          rag_total_pages?: number | null
          storage_path?: string
          superseded_at?: string | null
          superseded_by?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_material_files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_material_files_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "course_material_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_material_files_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_project_labs: {
        Row: {
          caution: string | null
          course_id: string
          created_at: string
          id: string
          learnings: string[]
          mission: string
          position: number
          published: boolean
          steps: Json
          summary: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          caution?: string | null
          course_id: string
          created_at?: string
          id?: string
          learnings?: string[]
          mission?: string
          position?: number
          published?: boolean
          steps?: Json
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Update: {
          caution?: string | null
          course_id?: string
          created_at?: string
          id?: string
          learnings?: string[]
          mission?: string
          position?: number
          published?: boolean
          steps?: Json
          summary?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_project_labs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_roster_allowlist: {
        Row: {
          added_by: string | null
          course_id: string
          created_at: string
          email: string
          full_name: string | null
          id: string
          invite_count: number
          invited_at: string | null
          source: string
          university: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          course_id: string
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invite_count?: number
          invited_at?: string | null
          source?: string
          university?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          course_id?: string
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invite_count?: number
          invited_at?: string | null
          source?: string
          university?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_roster_allowlist_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_ta_settings: {
        Row: {
          course_id: string
          created_at: string
          custom_exam_prompt: string | null
          diagnostic_type_counts: Json
          exam_approved: boolean
          exam_difficulty: string
          exam_enabled: boolean
          exam_manual_count: number | null
          exam_manual_questions: boolean
          exam_presentation: string | null
          exam_question_mix: string
          exam_schedule: Json | null
          exam_time_limit: number
          exam_type_counts: Json
          hint_ladder: boolean
          id: string
          knowledge_sources: string
          plagiarism_warnings: boolean
          practice_type_counts: Json
          quiz_approved: boolean
          quiz_day1_enabled: boolean
          quiz_day2_enabled: boolean
          quiz_days_enabled: Json
          quiz_difficulty: string | null
          quiz_enabled: boolean
          quiz_num_questions: number | null
          quiz_question_mix: string | null
          quiz_time_limit: number | null
          quiz_type_counts: Json
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          custom_exam_prompt?: string | null
          diagnostic_type_counts?: Json
          exam_approved?: boolean
          exam_difficulty?: string
          exam_enabled?: boolean
          exam_manual_count?: number | null
          exam_manual_questions?: boolean
          exam_presentation?: string | null
          exam_question_mix?: string
          exam_schedule?: Json | null
          exam_time_limit?: number
          exam_type_counts?: Json
          hint_ladder?: boolean
          id?: string
          knowledge_sources?: string
          plagiarism_warnings?: boolean
          practice_type_counts?: Json
          quiz_approved?: boolean
          quiz_day1_enabled?: boolean
          quiz_day2_enabled?: boolean
          quiz_days_enabled?: Json
          quiz_difficulty?: string | null
          quiz_enabled?: boolean
          quiz_num_questions?: number | null
          quiz_question_mix?: string | null
          quiz_time_limit?: number | null
          quiz_type_counts?: Json
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          custom_exam_prompt?: string | null
          diagnostic_type_counts?: Json
          exam_approved?: boolean
          exam_difficulty?: string
          exam_enabled?: boolean
          exam_manual_count?: number | null
          exam_manual_questions?: boolean
          exam_presentation?: string | null
          exam_question_mix?: string
          exam_schedule?: Json | null
          exam_time_limit?: number
          exam_type_counts?: Json
          hint_ladder?: boolean
          id?: string
          knowledge_sources?: string
          plagiarism_warnings?: boolean
          practice_type_counts?: Json
          quiz_approved?: boolean
          quiz_day1_enabled?: boolean
          quiz_day2_enabled?: boolean
          quiz_days_enabled?: Json
          quiz_difficulty?: string | null
          quiz_enabled?: boolean
          quiz_num_questions?: number | null
          quiz_question_mix?: string | null
          quiz_time_limit?: number | null
          quiz_type_counts?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_ta_settings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_teachers: {
        Row: {
          course_id: string
          created_at: string
          id: string
          role: string
          teacher_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          role?: string
          teacher_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          role?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_teachers_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_teaching_insights: {
        Row: {
          course_id: string
          created_at: string
          generated_at: string
          generated_by: string | null
          inputs_hash: string
          insights: Json
          model: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          inputs_hash: string
          insights: Json
          model: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          inputs_hash?: string
          insights?: Json
          model?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_teaching_insights_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_youtube_links: {
        Row: {
          course_id: string
          created_at: string
          id: string
          kind: string
          source_file_id: string | null
          teacher_id: string
          url: string
          video_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          kind?: string
          source_file_id?: string | null
          teacher_id: string
          url: string
          video_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          kind?: string
          source_file_id?: string | null
          teacher_id?: string
          url?: string
          video_id?: string | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          branch: string[] | null
          course_code: string | null
          created_at: string
          end_date: string | null
          enrollment_code: string
          enrollment_open: boolean
          final_week: number | null
          graduation_year: string[] | null
          id: string
          lesson_plan_draft_path: string | null
          lesson_plan_overall_outcomes: string | null
          lesson_plan_path: string | null
          lesson_plan_published_at: string | null
          materials_uploaded: boolean
          midterm_week: number | null
          name: string
          objectives: string[] | null
          published: boolean
          roster_enforcement: boolean
          roster_sync_sheet_url: string | null
          sections: string[] | null
          session_length_minutes: number | null
          sessions_per_week: number | null
          start_date: string | null
          syllabus_json_path: string | null
          syllabus_uploaded: boolean
          teacher_id: string
          term: string
          total_weeks: number | null
          updated_at: string
        }
        Insert: {
          branch?: string[] | null
          course_code?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_code?: string
          enrollment_open?: boolean
          final_week?: number | null
          graduation_year?: string[] | null
          id?: string
          lesson_plan_draft_path?: string | null
          lesson_plan_overall_outcomes?: string | null
          lesson_plan_path?: string | null
          lesson_plan_published_at?: string | null
          materials_uploaded?: boolean
          midterm_week?: number | null
          name: string
          objectives?: string[] | null
          published?: boolean
          roster_enforcement?: boolean
          roster_sync_sheet_url?: string | null
          sections?: string[] | null
          session_length_minutes?: number | null
          sessions_per_week?: number | null
          start_date?: string | null
          syllabus_json_path?: string | null
          syllabus_uploaded?: boolean
          teacher_id: string
          term: string
          total_weeks?: number | null
          updated_at?: string
        }
        Update: {
          branch?: string[] | null
          course_code?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_code?: string
          enrollment_open?: boolean
          final_week?: number | null
          graduation_year?: string[] | null
          id?: string
          lesson_plan_draft_path?: string | null
          lesson_plan_overall_outcomes?: string | null
          lesson_plan_path?: string | null
          lesson_plan_published_at?: string | null
          materials_uploaded?: boolean
          midterm_week?: number | null
          name?: string
          objectives?: string[] | null
          published?: boolean
          roster_enforcement?: boolean
          roster_sync_sheet_url?: string | null
          sections?: string[] | null
          session_length_minutes?: number | null
          sessions_per_week?: number | null
          start_date?: string | null
          syllabus_json_path?: string | null
          syllabus_uploaded?: boolean
          teacher_id?: string
          term?: string
          total_weeks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      degrees: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      diagnostic_generation_events: {
        Row: {
          attempt: number | null
          course_id: string
          created_at: string
          data: Json | null
          duration_ms: number | null
          gateway_call_id: string | null
          id: string
          message: string | null
          reason: string | null
          run_id: string
          status: string
          step: string
          tier: string | null
        }
        Insert: {
          attempt?: number | null
          course_id: string
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          gateway_call_id?: string | null
          id?: string
          message?: string | null
          reason?: string | null
          run_id: string
          status?: string
          step: string
          tier?: string | null
        }
        Update: {
          attempt?: number | null
          course_id?: string
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          gateway_call_id?: string | null
          id?: string
          message?: string | null
          reason?: string | null
          run_id?: string
          status?: string
          step?: string
          tier?: string | null
        }
        Relationships: []
      }
      diagnostic_generation_runs: {
        Row: {
          accepted: number
          attempts: number
          course_id: string
          created_at: string
          error_code: string | null
          id: string
          requested: number
          run_id: string
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          accepted?: number
          attempts?: number
          course_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          requested?: number
          run_id: string
          status: string
          tier: string
          updated_at?: string
        }
        Update: {
          accepted?: number
          attempts?: number
          course_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          requested?: number
          run_id?: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_generation_runs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_questions: {
        Row: {
          answer: string
          answer_max_words: number | null
          bloom_justification: string | null
          bloom_level: number
          concept_id: string
          content_text: string
          course_id: string
          created_at: string
          difficulty_estimate: number
          difficulty_justification: string | null
          explanation: string | null
          format: string
          id: string
          in_test: boolean
          is_distractor: boolean
          item_code: string
          model_answer: string | null
          options: Json | null
          teacher_id: string
          tier: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          answer_max_words?: number | null
          bloom_justification?: string | null
          bloom_level?: number
          concept_id: string
          content_text: string
          course_id: string
          created_at?: string
          difficulty_estimate?: number
          difficulty_justification?: string | null
          explanation?: string | null
          format?: string
          id?: string
          in_test?: boolean
          is_distractor?: boolean
          item_code: string
          model_answer?: string | null
          options?: Json | null
          teacher_id: string
          tier?: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          answer_max_words?: number | null
          bloom_justification?: string | null
          bloom_level?: number
          concept_id?: string
          content_text?: string
          course_id?: string
          created_at?: string
          difficulty_estimate?: number
          difficulty_justification?: string | null
          explanation?: string | null
          format?: string
          id?: string
          in_test?: boolean
          is_distractor?: boolean
          item_code?: string
          model_answer?: string | null
          options?: Json | null
          teacher_id?: string
          tier?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_questions_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_questions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_results: {
        Row: {
          answers: Json
          branch_tier: string | null
          confidences: Json
          course_id: string
          created_at: string
          id: string
          learner_level: string
          mastery_score: number | null
          question_ids: Json
          question_times: Json
          score: number
          student_id: string
          total_questions: number
        }
        Insert: {
          answers?: Json
          branch_tier?: string | null
          confidences?: Json
          course_id: string
          created_at?: string
          id?: string
          learner_level: string
          mastery_score?: number | null
          question_ids?: Json
          question_times?: Json
          score: number
          student_id: string
          total_questions: number
        }
        Update: {
          answers?: Json
          branch_tier?: string | null
          confidences?: Json
          course_id?: string
          created_at?: string
          id?: string
          learner_level?: string
          mastery_score?: number | null
          question_ids?: Json
          question_times?: Json
          score?: number
          student_id?: string
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          section: string | null
          student_id: string
          suspended_at: string | null
          suspended_by: string | null
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          section?: string | null
          student_id: string
          suspended_at?: string | null
          suspended_by?: string | null
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          section?: string | null
          student_id?: string
          suspended_at?: string | null
          suspended_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_weeks: {
        Row: {
          concepts: Json
          course_id: string
          created_at: string
          exam_type: string | null
          id: string
          is_exam_week: boolean
          locked: boolean
          overview: string
          quiz_type_counts: Json | null
          resources: Json
          updated_at: string
          week_name: string
          week_number: number
        }
        Insert: {
          concepts?: Json
          course_id: string
          created_at?: string
          exam_type?: string | null
          id?: string
          is_exam_week?: boolean
          locked?: boolean
          overview?: string
          quiz_type_counts?: Json | null
          resources?: Json
          updated_at?: string
          week_name?: string
          week_number: number
        }
        Update: {
          concepts?: Json
          course_id?: string
          created_at?: string
          exam_type?: string | null
          id?: string
          is_exam_week?: boolean
          locked?: boolean
          overview?: string
          quiz_type_counts?: Json | null
          resources?: Json
          updated_at?: string
          week_name?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_weeks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_signups: {
        Row: {
          branch_id: string | null
          consumed_at: string | null
          course_id: string | null
          created_at: string
          degree_id: string | null
          email: string
          enrollment_code: string
          graduation_year: string | null
          id: string
          name: string
          roll_number: string | null
          university_id: string | null
        }
        Insert: {
          branch_id?: string | null
          consumed_at?: string | null
          course_id?: string | null
          created_at?: string
          degree_id?: string | null
          email: string
          enrollment_code: string
          graduation_year?: string | null
          id?: string
          name: string
          roll_number?: string | null
          university_id?: string | null
        }
        Update: {
          branch_id?: string | null
          consumed_at?: string | null
          course_id?: string | null
          created_at?: string
          degree_id?: string | null
          email?: string
          enrollment_code?: string
          graduation_year?: string | null
          id?: string
          name?: string
          roll_number?: string | null
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_signups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_signups_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_signups_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_signups_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_course_id: string | null
          branch_id: string | null
          created_at: string
          degree_id: string | null
          department: string | null
          designation: string | null
          email: string | null
          graduation_year: string | null
          id: string
          institution: string | null
          learner_level: string | null
          name: string
          needs_password_setup: boolean
          role: string
          roll_number: string | null
          suspended_at: string | null
          suspended_by: string | null
          university_id: string | null
          updated_at: string
        }
        Insert: {
          active_course_id?: string | null
          branch_id?: string | null
          created_at?: string
          degree_id?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          graduation_year?: string | null
          id: string
          institution?: string | null
          learner_level?: string | null
          name: string
          needs_password_setup?: boolean
          role: string
          roll_number?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          active_course_id?: string | null
          branch_id?: string | null
          created_at?: string
          degree_id?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          graduation_year?: string | null
          id?: string
          institution?: string | null
          learner_level?: string | null
          name?: string
          needs_password_setup?: boolean
          role?: string
          roll_number?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_course_id_fkey"
            columns: ["active_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_tsv: unknown
          course_id: string
          created_at: string
          embedding: string
          file_id: string
          file_name: string
          folder_type: string | null
          id: string
          model_version: string
          page_end: number | null
          page_start: number | null
          source_type: string
          storage_path: string
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          content_tsv?: unknown
          course_id: string
          created_at?: string
          embedding: string
          file_id: string
          file_name: string
          folder_type?: string | null
          id?: string
          model_version: string
          page_end?: number | null
          page_start?: number | null
          source_type?: string
          storage_path: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          course_id?: string
          created_at?: string
          embedding?: string
          file_id?: string
          file_name?: string
          folder_type?: string | null
          id?: string
          model_version?: string
          page_end?: number | null
          page_start?: number | null
          source_type?: string
          storage_path?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "course_material_files"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_progress_log: {
        Row: {
          action: string
          context: Json
          course_id: string | null
          created_at: string
          error_code: string | null
          error_details: string | null
          error_message: string | null
          id: string
          step_id: string
          success: boolean
          teacher_id: string
        }
        Insert: {
          action: string
          context?: Json
          course_id?: string | null
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          error_message?: string | null
          id?: string
          step_id: string
          success: boolean
          teacher_id: string
        }
        Update: {
          action?: string
          context?: Json
          course_id?: string | null
          created_at?: string
          error_code?: string | null
          error_details?: string | null
          error_message?: string | null
          id?: string
          step_id?: string
          success?: boolean
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_progress_log_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      signin_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          success?: boolean
        }
        Relationships: []
      }
      signup_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      student_answer_rationales: {
        Row: {
          ai_evaluated_at: string | null
          ai_feedback: string | null
          ai_model_reasoning: string | null
          ai_verdict: string | null
          bloom_level: number
          course_id: string | null
          created_at: string
          id: string
          is_correct: boolean | null
          model_answer_snapshot: string | null
          question_id: string
          question_source: string
          rationale_text: string
          response_kind: string
          selected_answer: string | null
          source_format: string
          source_result_id: string | null
          student_id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          ai_evaluated_at?: string | null
          ai_feedback?: string | null
          ai_model_reasoning?: string | null
          ai_verdict?: string | null
          bloom_level: number
          course_id?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          model_answer_snapshot?: string | null
          question_id: string
          question_source: string
          rationale_text: string
          response_kind?: string
          selected_answer?: string | null
          source_format: string
          source_result_id?: string | null
          student_id: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          ai_evaluated_at?: string | null
          ai_feedback?: string | null
          ai_model_reasoning?: string | null
          ai_verdict?: string | null
          bloom_level?: number
          course_id?: string | null
          created_at?: string
          id?: string
          is_correct?: boolean | null
          model_answer_snapshot?: string | null
          question_id?: string
          question_source?: string
          rationale_text?: string
          response_kind?: string
          selected_answer?: string | null
          source_format?: string
          source_result_id?: string | null
          student_id?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_answer_rationales_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_answer_rationales_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_concept_mastery: {
        Row: {
          concept_code: string
          concept_id: string
          course_id: string
          created_at: string
          id: string
          last_assessed_at: string | null
          last_source: string | null
          last_source_id: string | null
          mastery_level: string
          mastery_score: number
          questions_attempted: number
          questions_correct: number
          sample_count: number
          student_id: string
          updated_at: string
        }
        Insert: {
          concept_code: string
          concept_id: string
          course_id: string
          created_at?: string
          id?: string
          last_assessed_at?: string | null
          last_source?: string | null
          last_source_id?: string | null
          mastery_level: string
          mastery_score: number
          questions_attempted?: number
          questions_correct?: number
          sample_count?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          concept_code?: string
          concept_id?: string
          course_id?: string
          created_at?: string
          id?: string
          last_assessed_at?: string | null
          last_source?: string | null
          last_source_id?: string | null
          mastery_level?: string
          mastery_score?: number
          questions_attempted?: number
          questions_correct?: number
          sample_count?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_concept_mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_concept_mastery_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      student_course_mastery: {
        Row: {
          accuracy_component: number | null
          course_id: string
          created_at: string
          id: string
          last_source: string | null
          last_source_id: string | null
          learner_level: string
          mastery_score: number
          sample_count: number
          student_id: string
          updated_at: string
        }
        Insert: {
          accuracy_component?: number | null
          course_id: string
          created_at?: string
          id?: string
          last_source?: string | null
          last_source_id?: string | null
          learner_level: string
          mastery_score: number
          sample_count?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          accuracy_component?: number | null
          course_id?: string
          created_at?: string
          id?: string
          last_source?: string | null
          last_source_id?: string | null
          learner_level?: string
          mastery_score?: number
          sample_count?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_course_mastery_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      student_feedback: {
        Row: {
          additional_comments: string | null
          clarity: number | null
          comparison: string | null
          course_id: string | null
          created_at: string
          difficulty_match: number | null
          ease: number | null
          guided: string | null
          id: string
          student_id: string
          understanding: number | null
          usefulness: number | null
        }
        Insert: {
          additional_comments?: string | null
          clarity?: number | null
          comparison?: string | null
          course_id?: string | null
          created_at?: string
          difficulty_match?: number | null
          ease?: number | null
          guided?: string | null
          id?: string
          student_id: string
          understanding?: number | null
          usefulness?: number | null
        }
        Update: {
          additional_comments?: string | null
          clarity?: number | null
          comparison?: string | null
          course_id?: string | null
          created_at?: string
          difficulty_match?: number | null
          ease?: number | null
          guided?: string | null
          id?: string
          student_id?: string
          understanding?: number | null
          usefulness?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_feedback_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      teacher_applications: {
        Row: {
          admin_notes: string | null
          assigned_course_id: string | null
          assignment_type: string | null
          created_at: string
          department: string | null
          designation: string | null
          email: string
          id: string
          institution: string | null
          name: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          university_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_course_id?: string | null
          assignment_type?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email: string
          id?: string
          institution?: string | null
          name: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_course_id?: string | null
          assignment_type?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string
          id?: string
          institution?: string | null
          name?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_applications_assigned_course_id_fkey"
            columns: ["assigned_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_applications_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_nav_permissions: {
        Row: {
          allowed_paths: string[]
          can_create_courses: boolean
          created_at: string
          teacher_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_paths?: string[]
          can_create_courses?: boolean
          created_at?: string
          teacher_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_paths?: string[]
          can_create_courses?: boolean
          created_at?: string
          teacher_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_nav_permissions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_nav_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_setup_progress: {
        Row: {
          completed_at: string | null
          course_id: string | null
          created_at: string
          id: string
          opened_at: string
          step_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          step_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          step_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_setup_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      wipe_audit_log: {
        Row: {
          course_id: string
          created_at: string
          dry_run: boolean
          duration_ms: number
          error: string | null
          finished_at: string
          id: string
          ok: boolean
          started_at: string
          steps: Json
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          dry_run?: boolean
          duration_ms?: number
          error?: string | null
          finished_at?: string
          id?: string
          ok: boolean
          started_at: string
          steps?: Json
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          dry_run?: boolean
          duration_ms?: number
          error?: string | null
          finished_at?: string
          id?: string
          ok?: boolean
          started_at?: string
          steps?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_cache_version: {
        Args: { _scope: string; _scope_id: string }
        Returns: number
      }
      course_dashboard_stats: {
        Args: { _course_id: string }
        Returns: {
          active_students: number
          total_sessions: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      fetch_rag_document_chunks: {
        Args: {
          _course_id: string
          _folder_types: string[]
          _max_chunks?: number
          _week?: number
        }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          file_name: string
          folder_type: string
          id: string
          page_end: number
          page_start: number
        }[]
      }
      is_active_enrollment: {
        Args: { _course_id: string; _student_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_course_member: {
        Args: { _course_id: string; _user_id: string }
        Returns: boolean
      }
      match_rag_chunks: {
        Args: {
          _course_id: string
          _folder_types?: string[]
          _match_count?: number
          _query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          file_name: string
          folder_type: string
          id: string
          page_end: number
          page_start: number
          similarity: number
        }[]
      }
      match_rag_chunks_hybrid: {
        Args: {
          _course_id: string
          _folder_types?: string[]
          _match_count?: number
          _query_embedding: string
          _query_text: string
        }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          file_name: string
          folder_type: string
          fused_score: number
          id: string
          keyword_rank: number
          page_end: number
          page_start: number
          similarity: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      teacher_can_view_student: {
        Args: { _student_id: string; _teacher_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
