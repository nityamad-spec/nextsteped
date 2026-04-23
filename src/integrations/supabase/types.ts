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
      assessment_questions: {
        Row: {
          answer: string
          correct_index: number | null
          course_id: string
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          mode: string
          options: Json | null
          question_text: string
          question_type: string
          quiz_day: number | null
          teacher_id: string
          topic: string
        }
        Insert: {
          answer: string
          correct_index?: number | null
          course_id: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          mode: string
          options?: Json | null
          question_text: string
          question_type?: string
          quiz_day?: number | null
          teacher_id: string
          topic: string
        }
        Update: {
          answer?: string
          correct_index?: number | null
          course_id?: string
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          mode?: string
          options?: Json | null
          question_text?: string
          question_type?: string
          quiz_day?: number | null
          teacher_id?: string
          topic?: string
        }
        Relationships: [
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
          correct_answers: number
          course_id: string | null
          created_at: string
          id: string
          mode: string
          quiz_day: number | null
          score: number
          student_id: string
          time_spent: number
          total_questions: number
        }
        Insert: {
          answers?: Json
          correct_answers: number
          course_id?: string | null
          created_at?: string
          id?: string
          mode: string
          quiz_day?: number | null
          score: number
          student_id: string
          time_spent?: number
          total_questions: number
        }
        Update: {
          answers?: Json
          correct_answers?: number
          course_id?: string | null
          created_at?: string
          id?: string
          mode?: string
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
      course_material_files: {
        Row: {
          course_id: string | null
          created_at: string
          file_name: string
          file_size: number
          folder_type: string
          id: string
          storage_path: string
          teacher_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          file_name: string
          file_size: number
          folder_type: string
          id?: string
          storage_path: string
          teacher_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          folder_type?: string
          id?: string
          storage_path?: string
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
            foreignKeyName: "course_material_files_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_ta_settings: {
        Row: {
          course_id: string
          created_at: string
          custom_exam_prompt: string | null
          custom_study_prompt: string | null
          exam_approved: boolean
          exam_difficulty: string
          exam_enabled: boolean
          exam_manual_count: number | null
          exam_manual_questions: boolean
          exam_presentation: string | null
          exam_question_mix: string
          exam_time_limit: number
          hint_ladder: boolean
          id: string
          knowledge_sources: string
          plagiarism_warnings: boolean
          quiz_approved: boolean
          quiz_day1_enabled: boolean
          quiz_day2_enabled: boolean
          quiz_days_enabled: Json
          quiz_difficulty: string | null
          quiz_enabled: boolean
          quiz_num_questions: number | null
          quiz_question_mix: string | null
          quiz_time_limit: number | null
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          custom_exam_prompt?: string | null
          custom_study_prompt?: string | null
          exam_approved?: boolean
          exam_difficulty?: string
          exam_enabled?: boolean
          exam_manual_count?: number | null
          exam_manual_questions?: boolean
          exam_presentation?: string | null
          exam_question_mix?: string
          exam_time_limit?: number
          hint_ladder?: boolean
          id?: string
          knowledge_sources?: string
          plagiarism_warnings?: boolean
          quiz_approved?: boolean
          quiz_day1_enabled?: boolean
          quiz_day2_enabled?: boolean
          quiz_days_enabled?: Json
          quiz_difficulty?: string | null
          quiz_enabled?: boolean
          quiz_num_questions?: number | null
          quiz_question_mix?: string | null
          quiz_time_limit?: number | null
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          custom_exam_prompt?: string | null
          custom_study_prompt?: string | null
          exam_approved?: boolean
          exam_difficulty?: string
          exam_enabled?: boolean
          exam_manual_count?: number | null
          exam_manual_questions?: boolean
          exam_presentation?: string | null
          exam_question_mix?: string
          exam_time_limit?: number
          hint_ladder?: boolean
          id?: string
          knowledge_sources?: string
          plagiarism_warnings?: boolean
          quiz_approved?: boolean
          quiz_day1_enabled?: boolean
          quiz_day2_enabled?: boolean
          quiz_days_enabled?: Json
          quiz_difficulty?: string | null
          quiz_enabled?: boolean
          quiz_num_questions?: number | null
          quiz_question_mix?: string | null
          quiz_time_limit?: number | null
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
          lesson_plan_path: string | null
          lesson_plan_published_at: string | null
          materials_uploaded: boolean
          midterm_week: number | null
          name: string
          objectives: string[] | null
          published: boolean
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
          lesson_plan_path?: string | null
          lesson_plan_published_at?: string | null
          materials_uploaded?: boolean
          midterm_week?: number | null
          name: string
          objectives?: string[] | null
          published?: boolean
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
          lesson_plan_path?: string | null
          lesson_plan_published_at?: string | null
          materials_uploaded?: boolean
          midterm_week?: number | null
          name?: string
          objectives?: string[] | null
          published?: boolean
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
      diagnostic_questions: {
        Row: {
          answer: string
          bloom_justification: string | null
          bloom_level: number
          concept_id: string | null
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
          options: Json | null
          teacher_id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          bloom_justification?: string | null
          bloom_level?: number
          concept_id?: string | null
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
          options?: Json | null
          teacher_id: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          bloom_justification?: string | null
          bloom_level?: number
          concept_id?: string | null
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
          options?: Json | null
          teacher_id?: string
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
          confidences: Json
          course_id: string | null
          created_at: string
          id: string
          learner_level: string
          question_ids: Json
          question_times: Json
          score: number
          student_id: string
          total_questions: number
        }
        Insert: {
          answers?: Json
          confidences?: Json
          course_id?: string | null
          created_at?: string
          id?: string
          learner_level: string
          question_ids?: Json
          question_times?: Json
          score: number
          student_id: string
          total_questions: number
        }
        Update: {
          answers?: Json
          confidences?: Json
          course_id?: string | null
          created_at?: string
          id?: string
          learner_level?: string
          question_ids?: Json
          question_times?: Json
          score?: number
          student_id?: string
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          section: string | null
          student_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          section?: string | null
          student_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          section?: string | null
          student_id?: string
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
      profiles: {
        Row: {
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
          role: string
          roll_number: string | null
          university_id: string | null
          updated_at: string
        }
        Insert: {
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
          role: string
          roll_number?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Update: {
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
          role?: string
          roll_number?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
      teacher_applications: {
        Row: {
          admin_notes: string | null
          assigned_course_id: string | null
          assignment_type: string | null
          created_at: string
          email: string
          id: string
          name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_course_id?: string | null
          assignment_type?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          assigned_course_id?: string | null
          assignment_type?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_applications_assigned_course_id_fkey"
            columns: ["assigned_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_setup_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          opened_at: string
          step_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          step_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          step_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_cache_version: {
        Args: { _scope: string; _scope_id: string }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_course_member: {
        Args: { _course_id: string; _user_id: string }
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
