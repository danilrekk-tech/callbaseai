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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_processing_jobs: {
        Row: {
          attempts: number
          call_id: string | null
          details: Json
          error: string | null
          finished_at: string | null
          id: string
          latency_ms: number | null
          model: string | null
          provider: string | null
          stage: string
          started_at: string
          status: string
        }
        Insert: {
          attempts?: number
          call_id?: string | null
          details?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider?: string | null
          stage: string
          started_at?: string
          status?: string
        }
        Update: {
          attempts?: number
          call_id?: string | null
          details?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider?: string | null
          stage?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_processing_jobs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          avg_latency_ms: number | null
          base_url: string | null
          created_at: string
          enabled: boolean
          error_count: number
          id: string
          kind: string
          last_error: string | null
          last_error_at: string | null
          last_latency_ms: number | null
          last_success_at: string | null
          model: string | null
          name: string
          priority: number
          request_count: number
          secret_name: string | null
          status: string
          success_count: number
          updated_at: string
        }
        Insert: {
          avg_latency_ms?: number | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          error_count?: number
          id?: string
          kind: string
          last_error?: string | null
          last_error_at?: string | null
          last_latency_ms?: number | null
          last_success_at?: string | null
          model?: string | null
          name: string
          priority?: number
          request_count?: number
          secret_name?: string | null
          status?: string
          success_count?: number
          updated_at?: string
        }
        Update: {
          avg_latency_ms?: number | null
          base_url?: string | null
          created_at?: string
          enabled?: boolean
          error_count?: number
          id?: string
          kind?: string
          last_error?: string | null
          last_error_at?: string | null
          last_latency_ms?: number | null
          last_success_at?: string | null
          model?: string | null
          name?: string
          priority?: number
          request_count?: number
          secret_name?: string | null
          status?: string
          success_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          request_count: number
          revoked: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          request_count?: number
          revoked?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          request_count?: number
          revoked?: boolean
        }
        Relationships: []
      }
      call_analyses: {
        Row: {
          buying_signals: string[]
          call_id: string
          confidence: number | null
          created_at: string
          effective_phrases: string[]
          facts: Json
          id: string
          ineffective_phrases: string[]
          interpretations: Json
          key_moments: Json
          loss_reason: string | null
          loss_reasons: string[]
          loss_signals: string[]
          manager_actions: string[]
          manager_mistakes: string[]
          model: string | null
          motivation: string | null
          needs: string[]
          outcome: string | null
          pain_points: string[]
          provider: string | null
          raw: Json | null
          recommendations: string[]
          sale_reason: string | null
          sale_reasons: string[]
          stages: Json
          successful_phrases: string[]
          summary: string | null
          turning_point: string | null
          turning_points: Json
          unsuccessful_phrases: string[]
        }
        Insert: {
          buying_signals?: string[]
          call_id: string
          confidence?: number | null
          created_at?: string
          effective_phrases?: string[]
          facts?: Json
          id?: string
          ineffective_phrases?: string[]
          interpretations?: Json
          key_moments?: Json
          loss_reason?: string | null
          loss_reasons?: string[]
          loss_signals?: string[]
          manager_actions?: string[]
          manager_mistakes?: string[]
          model?: string | null
          motivation?: string | null
          needs?: string[]
          outcome?: string | null
          pain_points?: string[]
          provider?: string | null
          raw?: Json | null
          recommendations?: string[]
          sale_reason?: string | null
          sale_reasons?: string[]
          stages?: Json
          successful_phrases?: string[]
          summary?: string | null
          turning_point?: string | null
          turning_points?: Json
          unsuccessful_phrases?: string[]
        }
        Update: {
          buying_signals?: string[]
          call_id?: string
          confidence?: number | null
          created_at?: string
          effective_phrases?: string[]
          facts?: Json
          id?: string
          ineffective_phrases?: string[]
          interpretations?: Json
          key_moments?: Json
          loss_reason?: string | null
          loss_reasons?: string[]
          loss_signals?: string[]
          manager_actions?: string[]
          manager_mistakes?: string[]
          model?: string | null
          motivation?: string | null
          needs?: string[]
          outcome?: string | null
          pain_points?: string[]
          provider?: string | null
          raw?: Json | null
          recommendations?: string[]
          sale_reason?: string | null
          sale_reasons?: string[]
          stages?: Json
          successful_phrases?: string[]
          summary?: string | null
          turning_point?: string | null
          turning_points?: Json
          unsuccessful_phrases?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "call_analyses_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_objections: {
        Row: {
          call_id: string
          created_at: string
          handled: boolean
          handling_quality: string | null
          id: string
          manager_response: string | null
          objection_id: string
          quote: string | null
        }
        Insert: {
          call_id: string
          created_at?: string
          handled?: boolean
          handling_quality?: string | null
          id?: string
          manager_response?: string | null
          objection_id: string
          quote?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string
          handled?: boolean
          handling_quality?: string | null
          id?: string
          manager_response?: string | null
          objection_id?: string
          quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_objections_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_objections_objection_id_fkey"
            columns: ["objection_id"]
            isOneToOne: false
            referencedRelation: "objections"
            referencedColumns: ["id"]
          },
        ]
      }
      call_patterns: {
        Row: {
          call_id: string
          created_at: string
          evidence: string | null
          id: string
          pattern_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          evidence?: string | null
          id?: string
          pattern_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          evidence?: string | null
          id?: string
          pattern_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_patterns_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_patterns_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          call_date: string
          client_company: string | null
          client_name: string | null
          client_type: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_name: string
          file_size: number | null
          id: string
          language: string | null
          manager_id: string | null
          metadata: Json
          mime_type: string | null
          outcome: string
          processed_at: string | null
          status: string
          storage_path: string
          summary: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          call_date?: string
          client_company?: string | null
          client_name?: string | null
          client_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          language?: string | null
          manager_id?: string | null
          metadata?: Json
          mime_type?: string | null
          outcome?: string
          processed_at?: string | null
          status?: string
          storage_path: string
          summary?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          call_date?: string
          client_company?: string | null
          client_name?: string | null
          client_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          language?: string | null
          manager_id?: string | null
          metadata?: Json
          mime_type?: string | null
          outcome?: string
          processed_at?: string | null
          status?: string
          storage_path?: string
          summary?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          budget_sensitivity: string | null
          buying_signals: string[]
          call_id: string
          choice_criteria: string[]
          client_type: string | null
          communication_style: string | null
          created_at: string
          facts: Json
          fears: string[]
          id: string
          interest_level: string | null
          interpretations: Json
          motivation: string | null
          need: string | null
          objections: string[]
          pains: string[]
          refusal_signals: string[]
        }
        Insert: {
          budget_sensitivity?: string | null
          buying_signals?: string[]
          call_id: string
          choice_criteria?: string[]
          client_type?: string | null
          communication_style?: string | null
          created_at?: string
          facts?: Json
          fears?: string[]
          id?: string
          interest_level?: string | null
          interpretations?: Json
          motivation?: string | null
          need?: string | null
          objections?: string[]
          pains?: string[]
          refusal_signals?: string[]
        }
        Update: {
          budget_sensitivity?: string | null
          buying_signals?: string[]
          call_id?: string
          choice_criteria?: string[]
          client_type?: string | null
          communication_style?: string | null
          created_at?: string
          facts?: Json
          fears?: string[]
          id?: string
          interest_level?: string | null
          interpretations?: Json
          motivation?: string | null
          need?: string | null
          objections?: string[]
          pains?: string[]
          refusal_signals?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          chunk_id: string
          created_at: string
          embedding: string
          id: string
          model: string
        }
        Insert: {
          chunk_id: string
          created_at?: string
          embedding: string
          id?: string
          model: string
        }
        Update: {
          chunk_id?: string
          created_at?: string
          embedding?: string
          id?: string
          model?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: true
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          call_id: string | null
          category: string
          created_at: string
          evidence: string | null
          id: string
          kind: string
          statement: string
          weight: number | null
        }
        Insert: {
          call_id?: string | null
          category: string
          created_at?: string
          evidence?: string | null
          id?: string
          kind?: string
          statement: string
          weight?: number | null
        }
        Update: {
          call_id?: string | null
          category?: string
          created_at?: string
          evidence?: string | null
          id?: string
          kind?: string
          statement?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          call_id: string | null
          content: string
          created_at: string
          id: string
          metadata: Json
          source_type: string
          title: string | null
        }
        Insert: {
          call_id?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          source_type: string
          title?: string | null
        }
        Update: {
          call_id?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          source_type?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_assessments: {
        Row: {
          argumentation: string | null
          bad_actions: string[]
          call_id: string
          conversation_structure: string | null
          created_at: string
          empathy_score: number | null
          expertise_score: number | null
          facts: Json
          good_actions: string[]
          id: string
          interpretations: Json
          manager_id: string | null
          missed_opportunities: string[]
          mistakes: string[]
          needs_discovery: string | null
          objection_handling: string | null
          overall_score: number | null
          presentation_quality: string | null
          pressure_score: number | null
          questions_asked: string[]
        }
        Insert: {
          argumentation?: string | null
          bad_actions?: string[]
          call_id: string
          conversation_structure?: string | null
          created_at?: string
          empathy_score?: number | null
          expertise_score?: number | null
          facts?: Json
          good_actions?: string[]
          id?: string
          interpretations?: Json
          manager_id?: string | null
          missed_opportunities?: string[]
          mistakes?: string[]
          needs_discovery?: string | null
          objection_handling?: string | null
          overall_score?: number | null
          presentation_quality?: string | null
          pressure_score?: number | null
          questions_asked?: string[]
        }
        Update: {
          argumentation?: string | null
          bad_actions?: string[]
          call_id?: string
          conversation_structure?: string | null
          created_at?: string
          empathy_score?: number | null
          expertise_score?: number | null
          facts?: Json
          good_actions?: string[]
          id?: string
          interpretations?: Json
          manager_id?: string | null
          missed_opportunities?: string[]
          mistakes?: string[]
          needs_discovery?: string | null
          objection_handling?: string | null
          overall_score?: number | null
          presentation_quality?: string | null
          pressure_score?: number | null
          questions_asked?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "manager_assessments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_assessments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      objections: {
        Row: {
          best_responses: string[]
          category: string | null
          created_at: string
          description: string | null
          handled_count: number
          id: string
          occurrences: number
          title: string
          updated_at: string
          won_count: number
        }
        Insert: {
          best_responses?: string[]
          category?: string | null
          created_at?: string
          description?: string | null
          handled_count?: number
          id?: string
          occurrences?: number
          title: string
          updated_at?: string
          won_count?: number
        }
        Update: {
          best_responses?: string[]
          category?: string | null
          created_at?: string
          description?: string | null
          handled_count?: number
          id?: string
          occurrences?: number
          title?: string
          updated_at?: string
          won_count?: number
        }
        Relationships: []
      }
      patterns: {
        Row: {
          confidence: number | null
          confirmations: number
          created_at: string
          description: string | null
          id: string
          kind: string | null
          name: string
          outcome_link: string | null
          status: string
          success_count: number
          success_rate: number | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          confirmations?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name: string
          outcome_link?: string | null
          status?: string
          success_count?: number
          success_rate?: number | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          confirmations?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string | null
          name?: string
          outcome_link?: string | null
          status?: string
          success_count?: number
          success_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      transcript_segments: {
        Row: {
          call_id: string
          end_ms: number | null
          id: string
          idx: number
          speaker: string | null
          speaker_role: string | null
          start_ms: number | null
          text: string
          transcript_id: string
        }
        Insert: {
          call_id: string
          end_ms?: number | null
          id?: string
          idx: number
          speaker?: string | null
          speaker_role?: string | null
          start_ms?: number | null
          text: string
          transcript_id: string
        }
        Update: {
          call_id?: string
          end_ms?: number | null
          id?: string
          idx?: number
          speaker?: string | null
          speaker_role?: string | null
          start_ms?: number | null
          text?: string
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          call_id: string
          created_at: string
          full_text: string
          id: string
          language: string | null
          language_probability: number | null
          model: string | null
          provider: string
          raw: Json | null
          words_count: number
        }
        Insert: {
          call_id: string
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          language_probability?: number | null
          model?: string | null
          provider?: string
          raw?: Json | null
          words_count?: number
        }
        Update: {
          call_id?: string
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          language_probability?: number | null
          model?: string | null
          provider?: string
          raw?: Json | null
          words_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_knowledge: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          call_id: string
          chunk_id: string
          content: string
          metadata: Json
          similarity: number
          source_type: string
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "analyst" | "viewer"
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
    Enums: {
      app_role: ["admin", "analyst", "viewer"],
    },
  },
} as const
