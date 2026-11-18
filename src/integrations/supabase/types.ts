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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_sessions: {
        Row: {
          api_connection_id: string | null
          chat_id: string
          ended_at: string | null
          heartbeat_at: string
          id: string
          lock_token: string | null
          project_id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          api_connection_id?: string | null
          chat_id: string
          ended_at?: string | null
          heartbeat_at?: string
          id?: string
          lock_token?: string | null
          project_id: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          api_connection_id?: string | null
          chat_id?: string
          ended_at?: string | null
          heartbeat_at?: string
          id?: string
          lock_token?: string | null
          project_id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_api_connection_id_fkey"
            columns: ["api_connection_id"]
            isOneToOne: false
            referencedRelation: "api_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sessions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: true
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      api_connections: {
        Row: {
          created_at: string
          google_project: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          last_error: string | null
          last_tested_at: string | null
          metadata: Json
          model: string | null
          name: string
          provider: string
          quota_exceeded_at: string | null
          secret_ciphertext: string
          secret_hint: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_project?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          metadata?: Json
          model?: string | null
          name: string
          provider: string
          quota_exceeded_at?: string | null
          secret_ciphertext: string
          secret_hint?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_project?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_error?: string | null
          last_tested_at?: string | null
          metadata?: Json
          model?: string | null
          name?: string
          provider?: string
          quota_exceeded_at?: string | null
          secret_ciphertext?: string
          secret_hint?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          agent: string
          change_summary: string | null
          chat_id: string | null
          commit_sha: string | null
          created_at: string
          evidence: Json
          file_path: string | null
          id: string
          operation: string
          project_id: string | null
          result: string | null
          status: string
          tests: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          agent?: string
          change_summary?: string | null
          chat_id?: string | null
          commit_sha?: string | null
          created_at?: string
          evidence?: Json
          file_path?: string | null
          id?: string
          operation: string
          project_id?: string | null
          result?: string | null
          status?: string
          tests?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          agent?: string
          change_summary?: string | null
          chat_id?: string | null
          commit_sha?: string | null
          created_at?: string
          evidence?: Json
          file_path?: string | null
          id?: string
          operation?: string
          project_id?: string | null
          result?: string | null
          status?: string
          tests?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          chat_id: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          branch: string | null
          created_at: string
          id: string
          model: string
          project_id: string
          repository_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          id?: string
          model: string
          project_id: string
          repository_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          id?: string
          model?: string
          project_id?: string
          repository_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          api_connection_id: string | null
          branch: string | null
          chat_id: string | null
          created_at: string
          errors: Json
          head_sha: string | null
          id: string
          last_operation: string | null
          modified_files: Json
          pending_tasks: Json
          project_id: string
          reason: string
          repo_full_name: string | null
          resumed_at: string | null
          state: Json
          status: string
          user_id: string
        }
        Insert: {
          api_connection_id?: string | null
          branch?: string | null
          chat_id?: string | null
          created_at?: string
          errors?: Json
          head_sha?: string | null
          id?: string
          last_operation?: string | null
          modified_files?: Json
          pending_tasks?: Json
          project_id: string
          reason?: string
          repo_full_name?: string | null
          resumed_at?: string | null
          state?: Json
          status?: string
          user_id: string
        }
        Update: {
          api_connection_id?: string | null
          branch?: string | null
          chat_id?: string | null
          created_at?: string
          errors?: Json
          head_sha?: string | null
          id?: string
          last_operation?: string | null
          modified_files?: Json
          pending_tasks?: Json
          project_id?: string
          reason?: string
          repo_full_name?: string | null
          resumed_at?: string | null
          state?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_api_connection_id_fkey"
            columns: ["api_connection_id"]
            isOneToOne: false
            referencedRelation: "api_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      development_logs: {
        Row: {
          chat_id: string | null
          created_at: string
          details: Json
          id: string
          level: string
          message: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          level?: string
          message: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          level?: string
          message?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_logs_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      development_tasks: {
        Row: {
          chat_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          payload: Json
          project_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json
          project_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_tasks_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      file_changes: {
        Row: {
          change_type: string
          chat_id: string | null
          commit_sha: string | null
          created_at: string
          diff_summary: string | null
          file_path: string
          id: string
          new_sha: string | null
          previous_sha: string | null
          project_id: string
          repository_id: string | null
          user_id: string
        }
        Insert: {
          change_type: string
          chat_id?: string | null
          commit_sha?: string | null
          created_at?: string
          diff_summary?: string | null
          file_path: string
          id?: string
          new_sha?: string | null
          previous_sha?: string | null
          project_id: string
          repository_id?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          chat_id?: string | null
          commit_sha?: string | null
          created_at?: string
          diff_summary?: string | null
          file_path?: string
          id?: string
          new_sha?: string | null
          previous_sha?: string | null
          project_id?: string
          repository_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_changes_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_changes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_changes_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_history: {
        Row: {
          applied_at: string
          description: string | null
          id: string
          name: string
          version: string
        }
        Insert: {
          applied_at?: string
          description?: string | null
          id?: string
          name: string
          version: string
        }
        Update: {
          applied_at?: string
          description?: string | null
          id?: string
          name?: string
          version?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_memory: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          project_id: string
          source_chat_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind?: string
          project_id: string
          source_chat_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          project_id?: string
          source_chat_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_source_chat_id_fkey"
            columns: ["source_chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          context_summary: string | null
          created_at: string
          default_model: string | null
          description: string | null
          id: string
          last_activity_at: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string
          default_model?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string
          default_model?: string | null
          description?: string | null
          id?: string
          last_activity_at?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      repositories: {
        Row: {
          connection_id: string | null
          created_at: string
          default_branch: string
          full_name: string
          html_url: string | null
          id: string
          is_authorized: boolean
          last_commit_sha: string | null
          last_synced_at: string | null
          name: string
          owner: string
          private: boolean
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          default_branch?: string
          full_name: string
          html_url?: string | null
          id?: string
          is_authorized?: boolean
          last_commit_sha?: string | null
          last_synced_at?: string | null
          name: string
          owner: string
          private?: boolean
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          default_branch?: string
          full_name?: string
          html_url?: string | null
          id?: string
          is_authorized?: boolean
          last_commit_sha?: string | null
          last_synced_at?: string | null
          name?: string
          owner?: string
          private?: boolean
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repositories_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "api_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repositories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      repository_snapshots: {
        Row: {
          branch: string
          created_at: string
          file_count: number
          head_sha: string
          id: string
          project_id: string | null
          repository_id: string
          tree: Json
          user_id: string
        }
        Insert: {
          branch: string
          created_at?: string
          file_count?: number
          head_sha: string
          id?: string
          project_id?: string | null
          repository_id: string
          tree?: Json
          user_id: string
        }
        Update: {
          branch?: string
          created_at?: string
          file_count?: number
          head_sha?: string
          id?: string
          project_id?: string | null
          repository_id?: string
          tree?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repository_snapshots_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          created_at: string
          details: Json
          duration_ms: number | null
          id: string
          project_id: string | null
          run_id: string
          status: string
          suite: string
          test_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          id?: string
          project_id?: string | null
          run_id: string
          status: string
          suite: string
          test_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          id?: string
          project_id?: string | null
          run_id?: string
          status?: string
          suite?: string
          test_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_agent_lock: {
        Args: { _chat_id: string; _stale_seconds?: number }
        Returns: string
      }
      devstudio_installed_version: {
        Args: never
        Returns: {
          applied_at: string
          name: string
          version: string
        }[]
      }
      devstudio_schema_status: {
        Args: never
        Returns: {
          exists_flag: boolean
          policy_count: number
          rls_enabled: boolean
          table_name: string
        }[]
      }
      owns_project: { Args: { _project_id: string }; Returns: boolean }
      release_agent_lock: {
        Args: { _chat_id: string; _status?: string; _token: string }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
