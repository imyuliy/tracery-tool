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
      audit_log: {
        Row: {
          action: string
          id: string
          ip_address: unknown
          payload: Json | null
          project_id: string | null
          resource_id: string | null
          resource_type: string | null
          service_token_id: string | null
          timestamp: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          id?: string
          ip_address?: unknown
          payload?: Json | null
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          service_token_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: string
          ip_address?: unknown
          payload?: Json | null
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          service_token_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bestek_templates: {
        Row: {
          client: string
          created_at: string | null
          id: string
          optional_sections: Json | null
          required_sections: Json
          version: string
        }
        Insert: {
          client: string
          created_at?: string | null
          id?: string
          optional_sections?: Json | null
          required_sections: Json
          version: string
        }
        Update: {
          client?: string
          created_at?: string | null
          id?: string
          optional_sections?: Json | null
          required_sections?: Json
          version?: string
        }
        Relationships: []
      }
      cadastral_parcels: {
        Row: {
          brk_identifier: string
          contact_info: Json | null
          created_at: string | null
          eigenaar: string | null
          eigenaar_type: string | null
          geometry: unknown
          id: string
          length_within_m: number | null
          notes: string | null
          opstalrecht: boolean | null
          trace_id: string
        }
        Insert: {
          brk_identifier: string
          contact_info?: Json | null
          created_at?: string | null
          eigenaar?: string | null
          eigenaar_type?: string | null
          geometry: unknown
          id?: string
          length_within_m?: number | null
          notes?: string | null
          opstalrecht?: boolean | null
          trace_id: string
        }
        Update: {
          brk_identifier?: string
          contact_info?: Json | null
          created_at?: string | null
          eigenaar?: string | null
          eigenaar_type?: string | null
          geometry?: unknown
          id?: string
          length_within_m?: number | null
          notes?: string | null
          opstalrecht?: boolean | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadastral_parcels_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      clashes: {
        Row: {
          clash_type: string
          created_at: string | null
          dekking_check: string | null
          geometry: unknown
          id: string
          km_position: number
          min_distance_m: number | null
          nen3140_klasse: string | null
          segment_id: string | null
          severity: string | null
          trace_id: string
          utility_id: string | null
        }
        Insert: {
          clash_type: string
          created_at?: string | null
          dekking_check?: string | null
          geometry: unknown
          id?: string
          km_position: number
          min_distance_m?: number | null
          nen3140_klasse?: string | null
          segment_id?: string | null
          severity?: string | null
          trace_id: string
          utility_id?: string | null
        }
        Update: {
          clash_type?: string
          created_at?: string | null
          dekking_check?: string | null
          geometry?: unknown
          id?: string
          km_position?: number
          min_distance_m?: number | null
          nen3140_klasse?: string | null
          segment_id?: string | null
          severity?: string | null
          trace_id?: string
          utility_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clashes_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clashes_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "v_segment_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clashes_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clashes_utility_id_fkey"
            columns: ["utility_id"]
            isOneToOne: false
            referencedRelation: "utilities"
            referencedColumns: ["id"]
          },
        ]
      }
      design_parameters: {
        Row: {
          aansluitpunt_type_eind: string | null
          aansluitpunt_type_start: string | null
          created_at: string | null
          created_by: string | null
          geplande_eind: string | null
          geplande_start: string | null
          id: string
          is_active: boolean | null
          kabeltype: string
          min_afstand_derden_m: number
          min_bocht_radius_m: number
          min_dekking_m: number
          min_vertic_afst_kruising_m: number
          n_min_1_eis: string | null
          nao_tarieflijst_versie: string
          opslagfactor: number
          peildatum: string
          project_id: string
          risicotolerantie: string
          sleufbreedte_m: number
          sleufdiepte_m: number
          sources: Json
          spanningsniveau_kv: number
          version: number
          werkstrook_m: number
        }
        Insert: {
          aansluitpunt_type_eind?: string | null
          aansluitpunt_type_start?: string | null
          created_at?: string | null
          created_by?: string | null
          geplande_eind?: string | null
          geplande_start?: string | null
          id?: string
          is_active?: boolean | null
          kabeltype: string
          min_afstand_derden_m: number
          min_bocht_radius_m: number
          min_dekking_m: number
          min_vertic_afst_kruising_m: number
          n_min_1_eis?: string | null
          nao_tarieflijst_versie: string
          opslagfactor?: number
          peildatum: string
          project_id: string
          risicotolerantie: string
          sleufbreedte_m: number
          sleufdiepte_m: number
          sources?: Json
          spanningsniveau_kv: number
          version: number
          werkstrook_m: number
        }
        Update: {
          aansluitpunt_type_eind?: string | null
          aansluitpunt_type_start?: string | null
          created_at?: string | null
          created_by?: string | null
          geplande_eind?: string | null
          geplande_start?: string | null
          id?: string
          is_active?: boolean | null
          kabeltype?: string
          min_afstand_derden_m?: number
          min_bocht_radius_m?: number
          min_dekking_m?: number
          min_vertic_afst_kruising_m?: number
          n_min_1_eis?: string | null
          nao_tarieflijst_versie?: string
          opslagfactor?: number
          peildatum?: string
          project_id?: string
          risicotolerantie?: string
          sleufbreedte_m?: number
          sleufdiepte_m?: number
          sources?: Json
          spanningsniveau_kv?: number
          version?: number
          werkstrook_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_parameters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_parameters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_parameters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      eisen: {
        Row: {
          bron_prefix: string | null
          brondocument: string | null
          created_at: string | null
          eis_code: string
          eisenpakket_version_id: string
          eistekst: string
          eistitel: string
          embedding: string | null
          fase: string | null
          id: string
          objecttype: string
          raw: Json | null
          type_bewijsdocument: string | null
          verantwoordelijke_rol: string | null
          verificatiemethode: string | null
        }
        Insert: {
          bron_prefix?: string | null
          brondocument?: string | null
          created_at?: string | null
          eis_code: string
          eisenpakket_version_id: string
          eistekst: string
          eistitel: string
          embedding?: string | null
          fase?: string | null
          id?: string
          objecttype: string
          raw?: Json | null
          type_bewijsdocument?: string | null
          verantwoordelijke_rol?: string | null
          verificatiemethode?: string | null
        }
        Update: {
          bron_prefix?: string | null
          brondocument?: string | null
          created_at?: string | null
          eis_code?: string
          eisenpakket_version_id?: string
          eistekst?: string
          eistitel?: string
          embedding?: string | null
          fase?: string | null
          id?: string
          objecttype?: string
          raw?: Json | null
          type_bewijsdocument?: string | null
          verantwoordelijke_rol?: string | null
          verificatiemethode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eisen_eisenpakket_version_id_fkey"
            columns: ["eisenpakket_version_id"]
            isOneToOne: false
            referencedRelation: "eisenpakket_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      eisenpakket_versions: {
        Row: {
          eisenpakket_id: string
          id: string
          imported_at: string | null
          imported_by: string | null
          notes: string | null
          row_count: number | null
          source_file: string | null
          source_file_hash: string | null
          status: string | null
          version_label: string
        }
        Insert: {
          eisenpakket_id: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          notes?: string | null
          row_count?: number | null
          source_file?: string | null
          source_file_hash?: string | null
          status?: string | null
          version_label: string
        }
        Update: {
          eisenpakket_id?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          notes?: string | null
          row_count?: number | null
          source_file?: string | null
          source_file_hash?: string | null
          status?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "eisenpakket_versions_eisenpakket_id_fkey"
            columns: ["eisenpakket_id"]
            isOneToOne: false
            referencedRelation: "eisenpakketten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eisenpakket_versions_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eisenpakketten: {
        Row: {
          client: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          client: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          client?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eisenpakketten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eisenpakketten_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          expires_at: string | null
          export_type: string
          file_size_bytes: number | null
          generated_at: string | null
          generated_by: string | null
          id: string
          manifest_hash: string | null
          project_id: string
          storage_path: string
          trace_id: string | null
        }
        Insert: {
          expires_at?: string | null
          export_type: string
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          manifest_hash?: string | null
          project_id: string
          storage_path: string
          trace_id?: string | null
        }
        Update: {
          expires_at?: string | null
          export_type?: string
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          manifest_hash?: string | null
          project_id?: string
          storage_path?: string
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      klic_requests: {
        Row: {
          area: unknown
          created_at: string | null
          id: string
          klic_reference: string | null
          klic_type: string | null
          raw_response: Json | null
          received_at: string | null
          status: string | null
          submitted_at: string | null
          trace_id: string
        }
        Insert: {
          area?: unknown
          created_at?: string | null
          id?: string
          klic_reference?: string | null
          klic_type?: string | null
          raw_response?: Json | null
          received_at?: string | null
          status?: string | null
          submitted_at?: string | null
          trace_id: string
        }
        Update: {
          area?: unknown
          created_at?: string | null
          id?: string
          klic_reference?: string | null
          klic_type?: string | null
          raw_response?: Json | null
          received_at?: string | null
          status?: string | null
          submitted_at?: string | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "klic_requests_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      permits: {
        Row: {
          created_at: string | null
          geometry: unknown
          granted_at: string | null
          id: string
          issuing_body: string
          lead_time_weeks: number | null
          notes: string | null
          permit_type: string
          reference: string | null
          required: boolean | null
          status: string | null
          submitted_at: string | null
          trace_id: string
        }
        Insert: {
          created_at?: string | null
          geometry?: unknown
          granted_at?: string | null
          id?: string
          issuing_body: string
          lead_time_weeks?: number | null
          notes?: string | null
          permit_type: string
          reference?: string | null
          required?: boolean | null
          status?: string | null
          submitted_at?: string | null
          trace_id: string
        }
        Update: {
          created_at?: string | null
          geometry?: unknown
          granted_at?: string | null
          id?: string
          issuing_body?: string
          lead_time_weeks?: number | null
          notes?: string | null
          permit_type?: string
          reference?: string | null
          required?: boolean | null
          status?: string | null
          submitted_at?: string | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permits_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_eisen_scope: {
        Row: {
          created_at: string | null
          fases: string[]
          in_scope: boolean
          notes: string | null
          objecttype: string
          project_id: string
        }
        Insert: {
          created_at?: string | null
          fases?: string[]
          in_scope?: boolean
          notes?: string | null
          objecttype: string
          project_id: string
        }
        Update: {
          created_at?: string | null
          fases?: string[]
          in_scope?: boolean
          notes?: string | null
          objecttype?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_eisen_scope_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_eisen_scope_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          bbox: unknown
          bto_reference: string | null
          budget_plafond_eur: number | null
          client: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          eisenpakket_version_id: string | null
          id: string
          name: string
          org_id: string
          perceel: string | null
          planning_plafond_weken: number | null
          scope_description: string | null
          settings: Json | null
          status: string | null
          total_length_m: number | null
          updated_at: string | null
        }
        Insert: {
          bbox?: unknown
          bto_reference?: string | null
          budget_plafond_eur?: number | null
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          eisenpakket_version_id?: string | null
          id?: string
          name: string
          org_id: string
          perceel?: string | null
          planning_plafond_weken?: number | null
          scope_description?: string | null
          settings?: Json | null
          status?: string | null
          total_length_m?: number | null
          updated_at?: string | null
        }
        Update: {
          bbox?: unknown
          bto_reference?: string | null
          budget_plafond_eur?: number | null
          client?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          eisenpakket_version_id?: string | null
          id?: string
          name?: string
          org_id?: string
          perceel?: string | null
          planning_plafond_weken?: number | null
          scope_description?: string | null
          settings?: Json | null
          status?: string | null
          total_length_m?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_eisenpakket_version_id_fkey"
            columns: ["eisenpakket_version_id"]
            isOneToOne: false
            referencedRelation: "eisenpakket_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audit_hash: string
          completion_tokens: number | null
          content_md: string
          edited_by_user: boolean | null
          generated_at: string | null
          id: string
          model: string | null
          prompt_tokens: number | null
          report_type: string
          section_number: string | null
          section_title: string
          sources: Json | null
          trace_id: string
          user_edits: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audit_hash: string
          completion_tokens?: number | null
          content_md: string
          edited_by_user?: boolean | null
          generated_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          report_type: string
          section_number?: string | null
          section_title: string
          sources?: Json | null
          trace_id: string
          user_edits?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audit_hash?: string
          completion_tokens?: number | null
          content_md?: string
          edited_by_user?: boolean | null
          generated_at?: string | null
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          report_type?: string
          section_number?: string | null
          section_title?: string
          sources?: Json | null
          trace_id?: string
          user_edits?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sections_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements_chunks: {
        Row: {
          categorie: string | null
          chunk_index: number
          created_at: string | null
          document_id: string
          eis_id: string | null
          embedding: string | null
          id: string
          page_number: number | null
          section_title: string | null
          text: string
          tokens: number | null
        }
        Insert: {
          categorie?: string | null
          chunk_index: number
          created_at?: string | null
          document_id: string
          eis_id?: string | null
          embedding?: string | null
          id?: string
          page_number?: number | null
          section_title?: string | null
          text: string
          tokens?: number | null
        }
        Update: {
          categorie?: string | null
          chunk_index?: number
          created_at?: string | null
          document_id?: string
          eis_id?: string | null
          embedding?: string | null
          id?: string
          page_number?: number | null
          section_title?: string | null
          text?: string
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "requirements_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "requirements_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements_documents: {
        Row: {
          client: string
          created_at: string | null
          document_type: string | null
          id: string
          mime_type: string | null
          org_id: string
          page_count: number | null
          parse_error: string | null
          parse_status: string | null
          parsed_at: string | null
          project_id: string | null
          scope: string
          storage_path: string
          title: string
          valid_from: string | null
          valid_to: string | null
          version: string | null
        }
        Insert: {
          client: string
          created_at?: string | null
          document_type?: string | null
          id?: string
          mime_type?: string | null
          org_id: string
          page_count?: number | null
          parse_error?: string | null
          parse_status?: string | null
          parsed_at?: string | null
          project_id?: string | null
          scope: string
          storage_path: string
          title: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string | null
        }
        Update: {
          client?: string
          created_at?: string | null
          document_type?: string | null
          id?: string
          mime_type?: string | null
          org_id?: string
          page_count?: number | null
          parse_error?: string | null
          parse_status?: string | null
          parsed_at?: string | null
          project_id?: string | null
          scope?: string
          storage_path?: string
          title?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requirements_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          aanbevolen_techniek: string | null
          beheerder: string | null
          beheerder_type: string | null
          bgt_fysiek_voorkomen: string | null
          bgt_lokaal_id: string | null
          bgt_niveau: number | null
          bgt_subtype: string | null
          bgt_type: string
          created_at: string | null
          geometry: unknown
          id: string
          impact: Json | null
          km_end: number
          km_start: number
          length_m: number
          sequence: number
          trace_id: string
          warnings: Json | null
        }
        Insert: {
          aanbevolen_techniek?: string | null
          beheerder?: string | null
          beheerder_type?: string | null
          bgt_fysiek_voorkomen?: string | null
          bgt_lokaal_id?: string | null
          bgt_niveau?: number | null
          bgt_subtype?: string | null
          bgt_type: string
          created_at?: string | null
          geometry: unknown
          id?: string
          impact?: Json | null
          km_end: number
          km_start: number
          length_m: number
          sequence: number
          trace_id: string
          warnings?: Json | null
        }
        Update: {
          aanbevolen_techniek?: string | null
          beheerder?: string | null
          beheerder_type?: string | null
          bgt_fysiek_voorkomen?: string | null
          bgt_lokaal_id?: string | null
          bgt_niveau?: number | null
          bgt_subtype?: string | null
          bgt_type?: string
          created_at?: string | null
          geometry?: unknown
          id?: string
          impact?: Json | null
          km_end?: number
          km_start?: number
          length_m?: number
          sequence?: number
          trace_id?: string
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
          scopes: string[] | null
          token_hash: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
          scopes?: string[] | null
          token_hash: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
          scopes?: string[] | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      stakeholders: {
        Row: {
          attributes: Json | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          name: string
          role: string | null
          segment_count: number | null
          trace_id: string
          type: string
        }
        Insert: {
          attributes?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name: string
          role?: string | null
          segment_count?: number | null
          trace_id: string
          type: string
        }
        Update: {
          attributes?: Json | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name?: string
          role?: string | null
          segment_count?: number | null
          trace_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      station_works: {
        Row: {
          categorie: string
          created_at: string | null
          geschatte_kosten_eur: number | null
          geschatte_uren: number | null
          id: string
          lead_time_weken: number | null
          omschrijving: string
          rol: string
          sta_code: string | null
          station_id: string
          trace_id: string
          vereist: boolean | null
        }
        Insert: {
          categorie: string
          created_at?: string | null
          geschatte_kosten_eur?: number | null
          geschatte_uren?: number | null
          id?: string
          lead_time_weken?: number | null
          omschrijving: string
          rol: string
          sta_code?: string | null
          station_id: string
          trace_id: string
          vereist?: boolean | null
        }
        Update: {
          categorie?: string
          created_at?: string | null
          geschatte_kosten_eur?: number | null
          geschatte_uren?: number | null
          id?: string
          lead_time_weken?: number | null
          omschrijving?: string
          rol?: string
          sta_code?: string | null
          station_id?: string
          trace_id?: string
          vereist?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "station_works_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_works_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          adres: string | null
          attributes: Json | null
          bouwjaar: number | null
          code: string | null
          created_at: string | null
          eigenaar: string
          id: string
          location: unknown
          name: string
          org_id: string
          schakelinstallatie_merk: string | null
          spanningsniveau_kv_primair: number
          spanningsniveau_kv_secundair: number | null
          station_type: string
        }
        Insert: {
          adres?: string | null
          attributes?: Json | null
          bouwjaar?: number | null
          code?: string | null
          created_at?: string | null
          eigenaar: string
          id?: string
          location: unknown
          name: string
          org_id: string
          schakelinstallatie_merk?: string | null
          spanningsniveau_kv_primair: number
          spanningsniveau_kv_secundair?: number | null
          station_type: string
        }
        Update: {
          adres?: string | null
          attributes?: Json | null
          bouwjaar?: number | null
          code?: string | null
          created_at?: string | null
          eigenaar?: string
          id?: string
          location?: unknown
          name?: string
          org_id?: string
          schakelinstallatie_merk?: string | null
          spanningsniveau_kv_primair?: number
          spanningsniveau_kv_secundair?: number | null
          station_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      switching_events: {
        Row: {
          afgestemd_met: string | null
          created_at: string | null
          doorlooptijd_minuten: number | null
          event_type: string
          gepland_venster_eind: string | null
          gepland_venster_start: string | null
          id: string
          n_min_1_impact: string | null
          notes: string | null
          schakelbevoegdheid_vereist: string | null
          station_id: string
          status: string | null
          trace_id: string
        }
        Insert: {
          afgestemd_met?: string | null
          created_at?: string | null
          doorlooptijd_minuten?: number | null
          event_type: string
          gepland_venster_eind?: string | null
          gepland_venster_start?: string | null
          id?: string
          n_min_1_impact?: string | null
          notes?: string | null
          schakelbevoegdheid_vereist?: string | null
          station_id: string
          status?: string | null
          trace_id: string
        }
        Update: {
          afgestemd_met?: string | null
          created_at?: string | null
          doorlooptijd_minuten?: number | null
          event_type?: string
          gepland_venster_eind?: string | null
          gepland_venster_start?: string | null
          id?: string
          n_min_1_impact?: string | null
          notes?: string | null
          schakelbevoegdheid_vereist?: string | null
          station_id?: string
          status?: string | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "switching_events_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "switching_events_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      traces: {
        Row: {
          analysis_error: string | null
          analysis_status: string | null
          created_at: string | null
          eind_station_id: string | null
          geometry: unknown
          id: string
          length_m: number | null
          parameter_version_used: number | null
          peildatum: string | null
          project_id: string
          source_file: string | null
          source_format: string | null
          start_station_id: string | null
          variant: string
          variant_label: string | null
        }
        Insert: {
          analysis_error?: string | null
          analysis_status?: string | null
          created_at?: string | null
          eind_station_id?: string | null
          geometry?: unknown
          id?: string
          length_m?: number | null
          parameter_version_used?: number | null
          peildatum?: string | null
          project_id: string
          source_file?: string | null
          source_format?: string | null
          start_station_id?: string | null
          variant: string
          variant_label?: string | null
        }
        Update: {
          analysis_error?: string | null
          analysis_status?: string | null
          created_at?: string | null
          eind_station_id?: string | null
          geometry?: unknown
          id?: string
          length_m?: number | null
          parameter_version_used?: number | null
          peildatum?: string | null
          project_id?: string
          source_file?: string | null
          source_format?: string | null
          start_station_id?: string | null
          variant?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_param_version"
            columns: ["project_id", "parameter_version_used"]
            isOneToOne: false
            referencedRelation: "design_parameters"
            referencedColumns: ["project_id", "version"]
          },
          {
            foreignKeyName: "traces_eind_station_id_fkey"
            columns: ["eind_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traces_start_station_id_fkey"
            columns: ["start_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          org_id: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          org_id?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      utilities: {
        Row: {
          attributes: Json | null
          created_at: string | null
          diameter_mm: number | null
          diepte_m: number | null
          eigenaar: string
          geometry: unknown
          id: string
          klic_request_id: string | null
          materiaal: string | null
          medium: string
          trace_id: string
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          diameter_mm?: number | null
          diepte_m?: number | null
          eigenaar: string
          geometry?: unknown
          id?: string
          klic_request_id?: string | null
          materiaal?: string | null
          medium: string
          trace_id: string
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          diameter_mm?: number | null
          diepte_m?: number | null
          eigenaar?: string
          geometry?: unknown
          id?: string
          klic_request_id?: string | null
          materiaal?: string | null
          medium?: string
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "utilities_klic_request_id_fkey"
            columns: ["klic_request_id"]
            isOneToOne: false
            referencedRelation: "klic_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utilities_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      v_eisen_coverage: {
        Row: {
          aantal_eisen_geciteerd: number | null
          approved_at: string | null
          eisen_refs: Json | null
          generated_at: string | null
          report_type: string | null
          section_number: string | null
          section_title: string | null
          trace_id: string | null
        }
        Insert: {
          aantal_eisen_geciteerd?: never
          approved_at?: string | null
          eisen_refs?: never
          generated_at?: string | null
          report_type?: string | null
          section_number?: string | null
          section_title?: string | null
          trace_id?: string | null
        }
        Update: {
          aantal_eisen_geciteerd?: never
          approved_at?: string | null
          eisen_refs?: never
          generated_at?: string | null
          report_type?: string | null
          section_number?: string | null
          section_title?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_project_summary: {
        Row: {
          bto_reference: string | null
          budget_plafond_eur: number | null
          client: string | null
          created_at: string | null
          id: string | null
          longest_variant_m: number | null
          name: string | null
          perceel: string | null
          planning_plafond_weken: number | null
          status: string | null
          variant_count: number | null
        }
        Relationships: []
      }
      v_segment_detail: {
        Row: {
          aanbevolen_techniek: string | null
          beheerder: string | null
          beheerder_type: string | null
          bgt_fysiek_voorkomen: string | null
          bgt_lokaal_id: string | null
          bgt_niveau: number | null
          bgt_subtype: string | null
          bgt_type: string | null
          created_at: string | null
          display_name: string | null
          geometry: unknown
          id: string | null
          impact: Json | null
          km_end: number | null
          km_start: number | null
          length_m: number | null
          next_segment_id: string | null
          prev_segment_id: string | null
          sequence: number | null
          trace_id: string | null
          warnings: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_trace_id_fkey"
            columns: ["trace_id"]
            isOneToOne: false
            referencedRelation: "traces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      current_org_id: { Args: never; Returns: string }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      eisen_for_project: {
        Args: { p_project_id: string }
        Returns: {
          brondocument: string
          eis_code: string
          eis_id: string
          eistekst: string
          eistitel: string
          embedding: string
          fase: string
          objecttype: string
        }[]
      }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
