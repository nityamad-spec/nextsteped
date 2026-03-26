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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
          concept_id: string
          course_id: string
          created_at: string
          id: string
          weight: number
        }
        Insert: {
          concept_id: string
          course_id: string
          created_at?: string
          id?: string
          weight?: number
        }
        Update: {
          concept_id?: string
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
      courses: {
        Row: {
          branch: string | null
          created_at: string
          end_date: string | null
          enrollment_code: string
          id: string
          materials_uploaded: boolean
          name: string
          objectives: string[] | null
          published: boolean
          sections: string[] | null
          start_date: string | null
          syllabus_json_path: string | null
          syllabus_uploaded: boolean
          teacher_id: string
          term: string
          updated_at: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_code?: string
          id?: string
          materials_uploaded?: boolean
          name: string
          objectives?: string[] | null
          published?: boolean
          sections?: string[] | null
          start_date?: string | null
          syllabus_json_path?: string | null
          syllabus_uploaded?: boolean
          teacher_id: string
          term: string
          updated_at?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_code?: string
          id?: string
          materials_uploaded?: boolean
          name?: string
          objectives?: string[] | null
          published?: boolean
          sections?: string[] | null
          start_date?: string | null
          syllabus_json_path?: string | null
          syllabus_uploaded?: boolean
          teacher_id?: string
          term?: string
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
          is_distractor: boolean
          item_id: string
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
          is_distractor?: boolean
          item_id: string
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
          is_distractor?: boolean
          item_id?: string
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
          created_at: string
          id: string
          learner_level: string
          question_times: Json
          score: number
          student_id: string
          total_questions: number
        }
        Insert: {
          answers?: Json
          confidences?: Json
          created_at?: string
          id?: string
          learner_level: string
          question_times?: Json
          score: number
          student_id: string
          total_questions: number
        }
        Update: {
          answers?: Json
          confidences?: Json
          created_at?: string
          id?: string
          learner_level?: string
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
          student_id: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          student_id: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
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
          graduation_year: string | null
          id: string
          learner_level: string | null
          name: string
          role: string
          university_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          degree_id?: string | null
          department?: string | null
          graduation_year?: string | null
          id: string
          learner_level?: string | null
          name: string
          role: string
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          degree_id?: string | null
          department?: string | null
          graduation_year?: string | null
          id?: string
          learner_level?: string | null
          name?: string
          role?: string
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
      [_ in never]: never
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
