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
      company_assets: {
        Row: {
          asset_name: string
          assigned_to: string | null
          category: string | null
          id: string
          last_service_date: string | null
          next_service_date: string | null
          serial_number: string | null
          status: string | null
        }
        Insert: {
          asset_name: string
          assigned_to?: string | null
          category?: string | null
          id?: string
          last_service_date?: string | null
          next_service_date?: string | null
          serial_number?: string | null
          status?: string | null
        }
        Update: {
          asset_name?: string
          assigned_to?: string | null
          category?: string | null
          id?: string
          last_service_date?: string | null
          next_service_date?: string | null
          serial_number?: string | null
          status?: string | null
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          company_name: string
          created_at: string
          deductions_file_number: string | null
          email: string | null
          id: string
          legal_id: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          company_name: string
          created_at?: string
          deductions_file_number?: string | null
          email?: string | null
          id?: string
          legal_id?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          created_at?: string
          deductions_file_number?: string | null
          email?: string | null
          id?: string
          legal_id?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      contract_deduction_rules: {
        Row: {
          contract_id: string
          created_at: string | null
          deduction_kind: string | null
          id: string
          percent: number
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          deduction_kind?: string | null
          id?: string
          percent: number
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          deduction_kind?: string | null
          id?: string
          percent?: number
        }
        Relationships: []
      }
      contract_line_items: {
        Row: {
          contract_id: string
          created_at: string | null
          description: string
          id: string
          sort_order: number | null
          total_amount: number | null
          wbs_weight_percent: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          description: string
          id?: string
          sort_order?: number | null
          total_amount?: number | null
          wbs_weight_percent?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          description?: string
          id?: string
          sort_order?: number | null
          total_amount?: number | null
          wbs_weight_percent?: number | null
        }
        Relationships: []
      }
      contract_milestones: {
        Row: {
          amount: number | null
          contract_id: string | null
          created_at: string | null
          id: string
          name: string
          section_code: string | null
          sort_order: number | null
          weight_percentage: number | null
        }
        Insert: {
          amount?: number | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          section_code?: string | null
          sort_order?: number | null
          weight_percentage?: number | null
        }
        Update: {
          amount?: number | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          section_code?: string | null
          sort_order?: number | null
          weight_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          advance_payment_amount: number
          agreement_type: string | null
          contract_number: string | null
          contract_type: Database["public"]["Enums"]["mo_contract_type"]
          created_at: string
          deleted_at: string | null
          end_date: string | null
          entity_id: string
          gl_account_code: string | null
          id: string
          index_coefficient: number | null
          index_linkage_base_date: string | null
          insurance_pct: number
          insurance_percent: number | null
          is_deleted: boolean
          lab_fees_pct: number | null
          makat: string | null
          name: string | null
          parent_contract_id: string | null
          pricing_model: string
          project_id: string
          retention_pct: number
          retention_percent: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["mo_contract_status"]
          testing_pct: number
          testing_percent: number | null
          total_amount: number | null
        }
        Insert: {
          advance_payment_amount?: number
          agreement_type?: string | null
          contract_number?: string | null
          contract_type: Database["public"]["Enums"]["mo_contract_type"]
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          entity_id: string
          gl_account_code?: string | null
          id?: string
          index_coefficient?: number | null
          index_linkage_base_date?: string | null
          insurance_pct?: number
          insurance_percent?: number | null
          is_deleted?: boolean
          lab_fees_pct?: number | null
          makat?: string | null
          name?: string | null
          parent_contract_id?: string | null
          pricing_model?: string
          project_id: string
          retention_pct?: number
          retention_percent?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["mo_contract_status"]
          testing_pct?: number
          testing_percent?: number | null
          total_amount?: number | null
        }
        Update: {
          advance_payment_amount?: number
          agreement_type?: string | null
          contract_number?: string | null
          contract_type?: Database["public"]["Enums"]["mo_contract_type"]
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          entity_id?: string
          gl_account_code?: string | null
          id?: string
          index_coefficient?: number | null
          index_linkage_base_date?: string | null
          insurance_pct?: number
          insurance_percent?: number | null
          is_deleted?: boolean
          lab_fees_pct?: number | null
          makat?: string | null
          name?: string | null
          parent_contract_id?: string | null
          pricing_model?: string
          project_id?: string
          retention_pct?: number
          retention_percent?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["mo_contract_status"]
          testing_pct?: number
          testing_percent?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          created_at: string | null
          id: string
          log_date: string | null
          project_id: string | null
          safety_issues: string | null
          weather: string | null
          work_description: string | null
          workers_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_date?: string | null
          project_id?: string | null
          safety_issues?: string | null
          weather?: string | null
          work_description?: string | null
          workers_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          log_date?: string | null
          project_id?: string | null
          safety_issues?: string | null
          weather?: string | null
          work_description?: string | null
          workers_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_type: string | null
          created_at: string
          document_type: string
          file_name: string
          file_url: string | null
          id: string
          related_to: string | null
          storage_path: string | null
          title: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          document_type: string
          file_name: string
          file_url?: string | null
          id?: string
          related_to?: string | null
          storage_path?: string | null
          title: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          document_type?: string
          file_name?: string
          file_url?: string | null
          id?: string
          related_to?: string | null
          storage_path?: string | null
          title?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          address: string | null
          company_id: string | null
          contact_info: Json
          created_at: string
          deductions_file_number: string | null
          deleted_at: string | null
          id: string
          is_deleted: boolean
          legal_id: string | null
          mo_entity_code: string | null
          name: string
          type: Database["public"]["Enums"]["mo_entity_type"]
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          contact_info?: Json
          created_at?: string
          deductions_file_number?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          legal_id?: string | null
          mo_entity_code?: string | null
          name: string
          type: Database["public"]["Enums"]["mo_entity_type"]
        }
        Update: {
          address?: string | null
          company_id?: string | null
          contact_info?: Json
          created_at?: string
          deductions_file_number?: string | null
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean
          legal_id?: string | null
          mo_entity_code?: string | null
          name?: string
          type?: Database["public"]["Enums"]["mo_entity_type"]
        }
        Relationships: []
      }
      ev_charging_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          kwh: number
          meter_reading_end: number | null
          meter_reading_start: number | null
          parking_spot_id: string
          recorded_by: string | null
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          kwh?: number
          meter_reading_end?: number | null
          meter_reading_start?: number | null
          parking_spot_id: string
          recorded_by?: string | null
          started_at: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          kwh?: number
          meter_reading_end?: number | null
          meter_reading_start?: number | null
          parking_spot_id?: string
          recorded_by?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ev_charging_sessions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_monthly_bills: {
        Row: {
          created_at: string
          currency: string
          electricity_cost: number
          electricity_rate_per_kwh: number
          id: string
          issued_at: string | null
          kwh_total: number
          management_fee: number
          parking_spot_id: string
          period_end: string
          period_start: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          currency?: string
          electricity_cost?: number
          electricity_rate_per_kwh?: number
          id?: string
          issued_at?: string | null
          kwh_total?: number
          management_fee?: number
          parking_spot_id: string
          period_end: string
          period_start: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          currency?: string
          electricity_cost?: number
          electricity_rate_per_kwh?: number
          id?: string
          issued_at?: string | null
          kwh_total?: number
          management_fee?: number
          parking_spot_id?: string
          period_end?: string
          period_start?: string
          total_amount?: number
        }
        Relationships: []
      }
      finance_clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_deleted: boolean
          name: string
          payment_terms_days: number | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          payment_terms_days?: number | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          payment_terms_days?: number | null
          tax_id?: string | null
        }
        Relationships: []
      }
      finance_invoices: {
        Row: {
          allocation_number: string | null
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: number
          items: Json
          journal_entry_id: string | null
          project_id: string | null
          status:
            | "DRAFT"
            | "PENDING_ALLOCATION"
            | "APPROVED"
            | "PAID"
          tax_authority_ref: string | null
          totals: Json
          type: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
        }
        Insert: {
          allocation_number?: string | null
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: number
          items?: Json
          journal_entry_id?: string | null
          project_id?: string | null
          status?:
            | "DRAFT"
            | "PENDING_ALLOCATION"
            | "APPROVED"
            | "PAID"
          tax_authority_ref?: string | null
          totals?: Json
          type?: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
        }
        Update: {
          allocation_number?: string | null
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: number
          items?: Json
          journal_entry_id?: string | null
          project_id?: string | null
          status?:
            | "DRAFT"
            | "PENDING_ALLOCATION"
            | "APPROVED"
            | "PAID"
          tax_authority_ref?: string | null
          totals?: Json
          type?: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
        }
        Relationships: [
          {
            foreignKeyName: "finance_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "finance_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "mo_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          cost_category: string | null
          created_at: string | null
          description: string | null
          id: string
          partner_id: string | null
          project_id: string | null
          transaction_type: string | null
        }
        Insert: {
          amount: number
          cost_category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          partner_id?: string | null
          project_id?: string | null
          transaction_type?: string | null
        }
        Update: {
          amount?: number
          cost_category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          partner_id?: string | null
          project_id?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          delivery_note_image_url: string | null
          delivery_note_number: string | null
          id: string
          is_deleted: boolean | null
          po_id: string
          receipt_date: string
          received_by: string | null
          shortage_notes: string | null
        }
        Insert: {
          created_at?: string
          delivery_note_image_url?: string | null
          delivery_note_number?: string | null
          id?: string
          is_deleted?: boolean | null
          po_id: string
          receipt_date?: string
          received_by?: string | null
          shortage_notes?: string | null
        }
        Update: {
          created_at?: string
          delivery_note_image_url?: string | null
          delivery_note_number?: string | null
          id?: string
          is_deleted?: boolean | null
          po_id?: string
          receipt_date?: string
          received_by?: string | null
          shortage_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_items: {
        Row: {
          category: string | null
          created_at: string | null
          family: string | null
          id: string
          name: string
          sku: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          family?: string | null
          id?: string
          name: string
          sku: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          family?: string | null
          id?: string
          name?: string
          sku?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          action_by: string | null
          contract_item_id: string | null
          created_at: string | null
          id: string
          item_id: string | null
          project_id: string | null
          quantity: number
          transaction_type: string
        }
        Insert: {
          action_by?: string | null
          contract_item_id?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          project_id?: string | null
          quantity?: number
          transaction_type: string
        }
        Update: {
          action_by?: string | null
          contract_item_id?: string | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          project_id?: string | null
          quantity?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          date: string | null
          description: string
          due_date: string
          id: string
          paid_at: string | null
          project_id: string | null
          status: string | null
          supplier_id: string | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string | null
          description: string
          due_date: string
          id?: string
          paid_at?: string | null
          project_id?: string | null
          status?: string | null
          supplier_id?: string | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string | null
          description?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          project_id?: string | null
          status?: string | null
          supplier_id?: string | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_summaries"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          item_name: string
          sku: string | null
          unit_cost: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          item_name: string
          sku?: string | null
          unit_cost?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          sku?: string | null
          unit_cost?: number | null
        }
        Relationships: []
      }
      items_catalog: {
        Row: {
          category: string | null
          created_at: string
          default_price: number | null
          description: string
          id: string
          is_deleted: boolean | null
          is_inventory: boolean
          sku: string
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_price?: number | null
          description: string
          id?: string
          is_deleted?: boolean | null
          is_inventory?: boolean
          sku: string
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          default_price?: number | null
          description?: string
          id?: string
          is_deleted?: boolean | null
          is_inventory?: boolean
          sku?: string
          unit?: string | null
        }
        Relationships: []
      }
      mo_categories: {
        Row: {
          id: string
          name: string
          prefix: string
        }
        Insert: {
          id?: string
          name: string
          prefix: string
        }
        Update: {
          id?: string
          name?: string
          prefix?: string
        }
        Relationships: []
      }
      mo_finance_clients: {
        Row: {
          address: string | null
          company_profile_id: string | null
          created_at: string
          email: string | null
          entity_id: string | null
          id: string
          is_deleted: boolean
          name: string
          payment_terms: string | null
        }
        Insert: {
          address?: string | null
          company_profile_id?: string | null
          created_at?: string
          email?: string | null
          entity_id?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          payment_terms?: string | null
        }
        Update: {
          address?: string | null
          company_profile_id?: string | null
          created_at?: string
          email?: string | null
          entity_id?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          payment_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_finance_clients_company_profile_id_fkey"
            columns: ["company_profile_id"]
            isOneToOne: false
            referencedRelation: "company_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_finance_clients_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_invoices: {
        Row: {
          contract_id: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["mo_invoice_document_type"]
          due_date: string | null
          entity_id: string
          finance_client_id: string | null
          grand_total: number
          id: string
          invoice_number: number
          is_printed_original: boolean
          issue_date: string
          items_snapshot: unknown | null
          linked_partial_account_id: string | null
          project_id: string
          status: Database["public"]["Enums"]["mo_invoice_financial_status"]
          subtotal: number
          vat_amount: number
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          document_type: Database["public"]["Enums"]["mo_invoice_document_type"]
          entity_id: string
          grand_total: number
          id?: string
          invoice_number?: number
          is_printed_original?: boolean
          issue_date?: string
          linked_partial_account_id?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["mo_invoice_financial_status"]
          subtotal: number
          vat_amount: number
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["mo_invoice_document_type"]
          entity_id?: string
          grand_total?: number
          id?: string
          invoice_number?: number
          is_printed_original?: boolean
          issue_date?: string
          linked_partial_account_id?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["mo_invoice_financial_status"]
          subtotal?: number
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "mo_invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_invoices_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_invoices_finance_client_id_fkey"
            columns: ["finance_client_id"]
            isOneToOne: false
            referencedRelation: "mo_finance_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_invoices_linked_partial_account_id_fkey"
            columns: ["linked_partial_account_id"]
            isOneToOne: false
            referencedRelation: "partial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_master_catalog: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          makat_ofek: string
          normalized_name: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          makat_ofek: string
          normalized_name: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          makat_ofek?: string
          normalized_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mo_master_catalog_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mo_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_receipt_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["mo_receipt_payment_method"]
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          payment_date?: string
          payment_method: Database["public"]["Enums"]["mo_receipt_payment_method"]
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["mo_receipt_payment_method"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_receipt_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "mo_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_supplier_catalog: {
        Row: {
          id: string
          master_item_id: string | null
          supplier_makat: string
          supplier_name: string
        }
        Insert: {
          id?: string
          master_item_id?: string | null
          supplier_makat: string
          supplier_name: string
        }
        Update: {
          id?: string
          master_item_id?: string | null
          supplier_makat?: string
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mo_supplier_catalog_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "mo_master_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_supplier_invoice_import_lines: {
        Row: {
          additional_attributes: Json | null
          category_name: string | null
          created_at: string
          id: string
          import_id: string | null
          makat: string | null
          master_item_id: string | null
          name: string | null
          normalized_name: string | null
          original_name: string | null
          price: number | null
          quantity: number | null
          total_line_price: number | null
          unit_of_measure: string | null
          unit_price: number | null
        }
        Insert: {
          additional_attributes?: Json | null
          category_name?: string | null
          created_at?: string
          id?: string
          import_id?: string | null
          makat?: string | null
          master_item_id?: string | null
          name?: string | null
          normalized_name?: string | null
          original_name?: string | null
          price?: number | null
          quantity?: number | null
          total_line_price?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Update: {
          additional_attributes?: Json | null
          category_name?: string | null
          created_at?: string
          id?: string
          import_id?: string | null
          makat?: string | null
          master_item_id?: string | null
          name?: string | null
          normalized_name?: string | null
          original_name?: string | null
          price?: number | null
          quantity?: number | null
          total_line_price?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mo_supplier_invoice_import_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "mo_supplier_invoice_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mo_supplier_invoice_import_lines_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "mo_master_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      mo_supplier_invoice_imports: {
        Row: {
          created_at: string
          created_by: string | null
          document_date: string | null
          document_title: string | null
          document_type: string | null
          file_name: string | null
          id: string
          project_name: string | null
          status: string | null
          supplier_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_date?: string | null
          document_title?: string | null
          document_type?: string | null
          file_name?: string | null
          id?: string
          project_name?: string | null
          status?: string | null
          supplier_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_date?: string | null
          document_title?: string | null
          document_type?: string | null
          file_name?: string | null
          id?: string
          project_name?: string | null
          status?: string | null
          supplier_name?: string | null
        }
        Relationships: []
      }
      partial_account_line_items: {
        Row: {
          approved_amount: number | null
          approved_percentage: number | null
          contract_line_item_id: string
          created_at: string
          cumulative_amount: number
          execution_percentage: number
          id: string
          is_deleted: boolean | null
          partial_account_id: string
          submitted_amount: number | null
          submitted_percentage: number | null
        }
        Insert: {
          approved_amount?: number | null
          approved_percentage?: number | null
          contract_line_item_id: string
          created_at?: string
          cumulative_amount: number
          execution_percentage: number
          id?: string
          is_deleted?: boolean | null
          partial_account_id: string
          submitted_amount?: number | null
          submitted_percentage?: number | null
        }
        Update: {
          approved_amount?: number | null
          approved_percentage?: number | null
          contract_line_item_id?: string
          created_at?: string
          cumulative_amount?: number
          execution_percentage?: number
          id?: string
          is_deleted?: boolean | null
          partial_account_id?: string
          submitted_amount?: number | null
          submitted_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partial_account_line_items_partial_account_id_fkey"
            columns: ["partial_account_id"]
            isOneToOne: false
            referencedRelation: "partial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      partial_account_deduction_lines: {
        Row: {
          amount: number
          created_at: string
          deduction_kind: string
          id: string
          label: string
          partial_account_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          created_at?: string
          deduction_kind: string
          id?: string
          label?: string
          partial_account_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          created_at?: string
          deduction_kind?: string
          id?: string
          label?: string
          partial_account_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "partial_account_deduction_lines_partial_account_id_fkey"
            columns: ["partial_account_id"]
            isOneToOne: false
            referencedRelation: "partial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      partial_accounts: {
        Row: {
          account_number: number
          account_period: string | null
          contract_id: string
          counterparty_entity_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          insurance_deduction: number
          is_deleted: boolean
          lab_fees_deduction: number | null
          payment_due: number
          period_work_indexed: number | null
          project_id: string | null
          retention_deduction: number
          status: Database["public"]["Enums"]["mo_partial_account_status"]
          total_cumulative_amount: number
        }
        Insert: {
          account_number: number
          account_period?: string | null
          contract_id: string
          counterparty_entity_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          insurance_deduction?: number
          is_deleted?: boolean
          lab_fees_deduction?: number | null
          payment_due?: number
          period_work_indexed?: number | null
          project_id?: string | null
          retention_deduction?: number
          status?: Database["public"]["Enums"]["mo_partial_account_status"]
          total_cumulative_amount?: number
        }
        Update: {
          account_number?: number
          account_period?: string | null
          contract_id?: string
          counterparty_entity_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          insurance_deduction?: number
          is_deleted?: boolean
          lab_fees_deduction?: number | null
          payment_due?: number
          period_work_indexed?: number | null
          project_id?: string | null
          retention_deduction?: number
          status?: Database["public"]["Enums"]["mo_partial_account_status"]
          total_cumulative_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_pa_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partial_accounts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partial_accounts_counterparty_entity_id_fkey"
            columns: ["counterparty_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          is_deleted: boolean | null
          item_id: string | null
          po_id: string
          quantity: number
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_deleted?: boolean | null
          item_id?: string | null
          po_id: string
          quantity: number
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_deleted?: boolean | null
          item_id?: string | null
          po_id?: string
          quantity?: number
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      preventive_tasks: {
        Row: {
          created_at: string
          frequency: string
          id: string
          next_due_date: string
          status: string | null
          system_type: string
          title: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          next_due_date: string
          status?: string | null
          system_type: string
          title: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          next_due_date?: string
          status?: string | null
          system_type?: string
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preventive_tasks_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_catalog: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
          sku: string
          target_price: number | null
          unit_type: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
          sku: string
          target_price?: number | null
          unit_type?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sku?: string
          target_price?: number | null
          unit_type?: string | null
        }
        Relationships: []
      }
      proc_orders: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          order_number: number
          project_id: string | null
          status: string | null
          supplier_id: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          project_id?: string | null
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          project_id?: string | null
          status?: string | null
          supplier_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "proc_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_suppliers: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          phone: string | null
          tax_id: string | null
          terms_of_payment: string | null
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          tax_id?: string | null
          terms_of_payment?: string | null
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          tax_id?: string | null
          terms_of_payment?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          apartment_number: string | null
          building_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          apartment_number?: string | null
          building_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          apartment_number?: string | null
          building_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      project_boq: {
        Row: {
          created_at: string
          description: string
          id: string
          item_code: string
          planned_quantity: number
          project_id: string
          rate: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_code: string
          planned_quantity?: number
          project_id: string
          rate?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_code?: string
          planned_quantity?: number
          project_id?: string
          rate?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_boq_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comments: {
        Row: {
          context_id: string | null
          context_type: string | null
          created_at: string | null
          id: string
          message: string | null
          project_id: string | null
        }
        Insert: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          project_id?: string | null
        }
        Update: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          document_type: string
          file_name: string
          file_url: string
          id: string
          project_id: string | null
          uploaded_at: string | null
        }
        Insert: {
          document_type: string
          file_name: string
          file_url: string
          id?: string
          project_id?: string | null
          uploaded_at?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string
          file_url?: string
          id?: string
          project_id?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_progress_items: {
        Row: {
          boq_item_id: string | null
          cumulative_quantity: number | null
          executed_quantity: number | null
          id: string
          previous_cumulative: number | null
          report_id: string | null
        }
        Insert: {
          boq_item_id?: string | null
          cumulative_quantity?: number | null
          executed_quantity?: number | null
          id?: string
          previous_cumulative?: number | null
          report_id?: string | null
        }
        Update: {
          boq_item_id?: string | null
          cumulative_quantity?: number | null
          executed_quantity?: number | null
          id?: string
          previous_cumulative?: number | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_progress_items_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "tender_boq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_progress_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "project_progress_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      project_progress_reports: {
        Row: {
          base_index: number | null
          bill_month_label: string | null
          bill_number: number | null
          contract_id: string | null
          created_at: string | null
          gl_account_code: string | null
          cumulative_billed: number | null
          cumulative_works_total: number | null
          current_index: number | null
          current_works_total: number | null
          deductions_amount: number | null
          discount_percent: number | null
          id: string
          indexation_amount: number | null
          insurance_amount: number | null
          insurance_percent: number | null
          linkage_amount: number | null
          previous_works_total: number | null
          project_id: string | null
          report_date: string | null
          report_month: string
          retention_amount: number | null
          retention_percent: number | null
          status: string | null
          sub_contractor_deductions: number | null
          tax_amount: number | null
          testing_amount: number | null
          testing_percent: number | null
          total_after_tax: number | null
          total_before_tax: number | null
          total_payable: number | null
        }
        Insert: {
          base_index?: number | null
          bill_month_label?: string | null
          bill_number?: number | null
          contract_id?: string | null
          created_at?: string | null
          gl_account_code?: string | null
          cumulative_billed?: number | null
          cumulative_works_total?: number | null
          current_index?: number | null
          current_works_total?: number | null
          deductions_amount?: number | null
          discount_percent?: number | null
          id?: string
          indexation_amount?: number | null
          insurance_amount?: number | null
          insurance_percent?: number | null
          linkage_amount?: number | null
          previous_works_total?: number | null
          project_id?: string | null
          report_date?: string | null
          report_month: string
          retention_amount?: number | null
          retention_percent?: number | null
          status?: string | null
          sub_contractor_deductions?: number | null
          tax_amount?: number | null
          testing_amount?: number | null
          testing_percent?: number | null
          total_after_tax?: number | null
          total_before_tax?: number | null
          total_payable?: number | null
        }
        Update: {
          base_index?: number | null
          bill_month_label?: string | null
          bill_number?: number | null
          contract_id?: string | null
          created_at?: string | null
          gl_account_code?: string | null
          cumulative_billed?: number | null
          cumulative_works_total?: number | null
          current_index?: number | null
          current_works_total?: number | null
          deductions_amount?: number | null
          discount_percent?: number | null
          id?: string
          indexation_amount?: number | null
          insurance_amount?: number | null
          insurance_percent?: number | null
          linkage_amount?: number | null
          previous_works_total?: number | null
          project_id?: string | null
          report_date?: string | null
          report_month?: string
          retention_amount?: number | null
          retention_percent?: number | null
          status?: string | null
          sub_contractor_deductions?: number | null
          tax_amount?: number | null
          testing_amount?: number | null
          testing_percent?: number | null
          total_after_tax?: number | null
          total_before_tax?: number | null
          total_payable?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_progress_reports_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_progress_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_resource_vacations: {
        Row: {
          created_at: string
          end_date: string
          id: string
          notes: string | null
          resource_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          resource_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          resource_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_resource_vacations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      project_resources: {
        Row: {
          created_at: string
          full_name: string
          hourly_cost: number
          id: string
          is_active: boolean
          profession: string
          project_id: string
          updated_at: string
          work_days: number[]
        }
        Insert: {
          created_at?: string
          full_name: string
          hourly_cost?: number
          id?: string
          is_active?: boolean
          profession?: string
          project_id: string
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          created_at?: string
          full_name?: string
          hourly_cost?: number
          id?: string
          is_active?: boolean
          profession?: string
          project_id?: string
          updated_at?: string
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "project_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_wall_posts: {
        Row: {
          ai_category: Database["public"]["Enums"]["project_wall_ai_category"]
          author_id: string
          body: string | null
          created_at: string
          id: string
          image_storage_bucket: string | null
          image_storage_path: string | null
          post_kind: Database["public"]["Enums"]["project_wall_post_kind"]
          project_id: string
          tag_slugs: string[]
        }
        Insert: {
          ai_category: Database["public"]["Enums"]["project_wall_ai_category"]
          author_id: string
          body?: string | null
          created_at?: string
          id?: string
          image_storage_bucket?: string | null
          image_storage_path?: string | null
          post_kind: Database["public"]["Enums"]["project_wall_post_kind"]
          project_id: string
          tag_slugs?: string[]
        }
        Update: {
          ai_category?: Database["public"]["Enums"]["project_wall_ai_category"]
          author_id?: string
          body?: string | null
          created_at?: string
          id?: string
          image_storage_bucket?: string | null
          image_storage_path?: string | null
          post_kind?: Database["public"]["Enums"]["project_wall_post_kind"]
          project_id?: string
          tag_slugs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "project_wall_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_wall_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          client_name: string | null
          created_at: string
          deleted_at: string | null
          id: string
          internal_project_code: string
          is_deleted: boolean
          managing_partner_email: string | null
          managing_partner_id: string | null
          name: string
          status: Database["public"]["Enums"]["mo_project_status"]
          tender_id: string | null
        }
        Insert: {
          address?: string | null
          client_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          internal_project_code: string
          is_deleted?: boolean
          managing_partner_email?: string | null
          managing_partner_id?: string | null
          name: string
          status?: Database["public"]["Enums"]["mo_project_status"]
          tender_id?: string | null
        }
        Update: {
          address?: string | null
          client_name?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          internal_project_code?: string
          is_deleted?: boolean
          managing_partner_email?: string | null
          managing_partner_id?: string | null
          name?: string
          status?: Database["public"]["Enums"]["mo_project_status"]
          tender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          ceo_approval_required: boolean | null
          ceo_signature: string | null
          created_at: string
          deleted_at: string | null
          expected_delivery_date: string | null
          id: string
          internal_notes: string | null
          is_deleted: boolean
          order_date: string
          po_number: string
          price_deviation_percent: number | null
          project_id: string | null
          status: Database["public"]["Enums"]["mo_po_status"]
          supplier_id: string
          tender_id: string | null
          total_amount: number
          wh_status: Database["public"]["Enums"]["holden_wh_po_status"] | null
        }
        Insert: {
          ceo_approval_required?: boolean | null
          ceo_signature?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          order_date?: string
          po_number?: string | null
          price_deviation_percent?: number | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["mo_po_status"]
          supplier_id: string
          tender_id?: string | null
          total_amount?: number
          wh_status?: Database["public"]["Enums"]["holden_wh_po_status"] | null
        }
        Update: {
          ceo_approval_required?: boolean | null
          ceo_signature?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          is_deleted?: boolean
          order_date?: string
          po_number?: string
          price_deviation_percent?: number | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["mo_po_status"]
          supplier_id?: string
          tender_id?: string | null
          total_amount?: number
          wh_status?: Database["public"]["Enums"]["holden_wh_po_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          part_id: string
          quantity: number
          unit_price: number
          uom_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          order_id: string
          part_id: string
          quantity: number
          unit_price?: number
          uom_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          part_id?: string
          quantity?: number
          unit_price?: number
          uom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "supplier_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_receipts: {
        Row: {
          created_at: string
          id: string
          po_id: string
          receipt_date: string
          warehouse_location: string
        }
        Insert: {
          created_at?: string
          id?: string
          po_id: string
          receipt_date?: string
          warehouse_location?: string
        }
        Update: {
          created_at?: string
          id?: string
          po_id?: string
          receipt_date?: string
          warehouse_location?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_receipt_lines: {
        Row: {
          id: string
          purchase_order_line_id: string
          quantity_received: number
          receipt_id: string
        }
        Insert: {
          id?: string
          purchase_order_line_id: string
          quantity_received: number
          receipt_id: string
        }
        Update: {
          id?: string
          purchase_order_line_id?: string
          quantity_received?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_receipt_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "warehouse_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_payments: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string
          invoice_id: string | null
          is_deleted: boolean | null
          payment_date: string | null
          payment_method: string | null
          reference_number: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          is_deleted?: boolean | null
          payment_date?: string | null
          payment_method?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "mo_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          availability_status: string | null
          cost_per_day: number | null
          created_at: string | null
          id: string
          name: string
          profession: string | null
          updated_at: string | null
        }
        Insert: {
          availability_status?: string | null
          cost_per_day?: number | null
          created_at?: string | null
          id?: string
          name: string
          profession?: string | null
          updated_at?: string | null
        }
        Update: {
          availability_status?: string | null
          cost_per_day?: number | null
          created_at?: string | null
          id?: string
          name?: string
          profession?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_invoice_items: {
        Row: {
          description: string | null
          id: string
          invoice_id: string | null
          quantity: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          po_id: string | null
          source_file_name: string | null
          source_file_path: string | null
          source_file_size: number | null
          source_mime_type: string | null
          source_storage_bucket: string | null
          status: string | null
          supplier_name: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_file_size?: number | null
          source_mime_type?: string | null
          source_storage_bucket?: string | null
          status?: string | null
          supplier_name?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_id?: string | null
          source_file_name?: string | null
          source_file_path?: string | null
          source_file_size?: number | null
          source_mime_type?: string | null
          source_storage_bucket?: string | null
          status?: string | null
          supplier_name?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_items: {
        Row: {
          current_price: number
          id: string
          internal_item_id: string | null
          is_preferred: boolean | null
          last_updated: string | null
          supplier_id: string | null
          supplier_item_name: string
          supplier_sku: string
        }
        Insert: {
          current_price: number
          id?: string
          internal_item_id?: string | null
          is_preferred?: boolean | null
          last_updated?: string | null
          supplier_id?: string | null
          supplier_item_name: string
          supplier_sku: string
        }
        Update: {
          current_price?: number
          id?: string
          internal_item_id?: string | null
          is_preferred?: boolean | null
          last_updated?: string | null
          supplier_id?: string | null
          supplier_item_name?: string
          supplier_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_items_internal_item_id_fkey"
            columns: ["internal_item_id"]
            isOneToOne: false
            referencedRelation: "internal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_summaries"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          entity_id: string | null
          id: string
          name: string
          payment_terms: string | null
          phone: string | null
          rating: number | null
          whatsapp_number: string | null
        }
        Insert: {
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          entity_id?: string | null
          id?: string
          name: string
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          entity_id?: string | null
          id?: string
          name?: string
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      task_boq_links: {
        Row: {
          boq_item_id: string
          created_at: string
          id: string
          linked_quantity: number | null
          task_id: string
        }
        Insert: {
          boq_item_id: string
          created_at?: string
          id?: string
          linked_quantity?: number | null
          task_id: string
        }
        Update: {
          boq_item_id?: string
          created_at?: string
          id?: string
          linked_quantity?: number | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_boq_links_boq_item_id_fkey"
            columns: ["boq_item_id"]
            isOneToOne: false
            referencedRelation: "project_boq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_boq_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_resource_assignments: {
        Row: {
          created_at: string | null
          project_id: string | null
          resource_id: string
          task_id: string
          units: number | null
        }
        Insert: {
          created_at?: string | null
          project_id?: string | null
          resource_id: string
          task_id: string
          units?: number | null
        }
        Update: {
          created_at?: string | null
          project_id?: string | null
          resource_id?: string
          task_id?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_resource_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_resource_assignments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_resource_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_resources: {
        Row: {
          created_at: string
          item_id: string
          quantity_actual: number
          quantity_estimated: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          item_id: string
          quantity_actual?: number
          quantity_estimated?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          item_id?: string
          quantity_actual?: number
          quantity_estimated?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_resources_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_resources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_cost: number
          actual_end_date: string | null
          actual_start_date: string | null
          created_at: string
          dependency_ids: string[]
          dependency_lags: Json
          description: string | null
          duration_days: number | null
          end_date: string | null
          estimated_cost: number
          id: string
          is_derivative: boolean | null
          level: number
          name: string
          parent_id: string | null
          parent_task_id: string | null
          predecessor_index: number | null
          predecessor_task_id: string | null
          progress: number
          project_id: string
          start_date: string | null
          subcontractor_id: string | null
          updated_at: string
          wbs_code: string | null
          wbs_order: number
        }
        Insert: {
          actual_cost?: number
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          dependency_ids?: string[]
          dependency_lags?: Json
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          estimated_cost?: number
          id?: string
          is_derivative?: boolean | null
          level?: number
          name: string
          parent_id?: string | null
          parent_task_id?: string | null
          predecessor_index?: number | null
          predecessor_task_id?: string | null
          progress?: number
          project_id: string
          start_date?: string | null
          subcontractor_id?: string | null
          updated_at?: string
          wbs_code?: string | null
          wbs_order?: number
        }
        Update: {
          actual_cost?: number
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          dependency_ids?: string[]
          dependency_lags?: Json
          description?: string | null
          duration_days?: number | null
          end_date?: string | null
          estimated_cost?: number
          id?: string
          is_derivative?: boolean | null
          level?: number
          name?: string
          parent_id?: string | null
          parent_task_id?: string | null
          predecessor_index?: number | null
          predecessor_task_id?: string | null
          progress?: number
          project_id?: string
          start_date?: string | null
          subcontractor_id?: string | null
          updated_at?: string
          wbs_code?: string | null
          wbs_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_boq_items: {
        Row: {
          created_at: string | null
          description: string
          estimated_cost: number | null
          final_price: number | null
          id: string
          item_number: string | null
          quantity: number | null
          section: string | null
          tender_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          estimated_cost?: number | null
          final_price?: number | null
          id?: string
          item_number?: string | null
          quantity?: number | null
          section?: string | null
          tender_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          estimated_cost?: number | null
          final_price?: number | null
          id?: string
          item_number?: string | null
          quantity?: number | null
          section?: string | null
          tender_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_boq_items_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_documents: {
        Row: {
          ai_inferred_date: string | null
          ai_inferred_name: string | null
          created_at: string | null
          document_type: string | null
          file_name: string
          file_path: string | null
          floors_data: Json | null
          id: string
          status: string | null
          tags: string[] | null
          tender_id: string | null
        }
        Insert: {
          ai_inferred_date?: string | null
          ai_inferred_name?: string | null
          created_at?: string | null
          document_type?: string | null
          file_name: string
          file_path?: string | null
          floors_data?: Json | null
          id?: string
          status?: string | null
          tags?: string[] | null
          tender_id?: string | null
        }
        Update: {
          ai_inferred_date?: string | null
          ai_inferred_name?: string | null
          created_at?: string | null
          document_type?: string | null
          file_name?: string
          file_path?: string | null
          floors_data?: Json | null
          id?: string
          status?: string | null
          tags?: string[] | null
          tender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tender_documents_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tenders: {
        Row: {
          building_structure_raw_data: Json | null
          consultant_name_from_ai: string | null
          created_at: string | null
          id: string
          project_name_from_ai: string | null
          tender_date_target: string | null
          updated_at: string | null
        }
        Insert: {
          building_structure_raw_data?: Json | null
          consultant_name_from_ai?: string | null
          created_at?: string | null
          id?: string
          project_name_from_ai?: string | null
          tender_date_target?: string | null
          updated_at?: string | null
        }
        Update: {
          building_structure_raw_data?: Json | null
          consultant_name_from_ai?: string | null
          created_at?: string | null
          id?: string
          project_name_from_ai?: string | null
          tender_date_target?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string | null
          id: string
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workspace_settings: {
        Row: {
          active_tabs: Json
          assistant_split_docked: boolean
          browser_bookmarks: Json
          browser_panel_enabled: boolean
          default_browser_homepage: string
          default_project_id: string | null
          diamond_workspace_layout: Json
          email_bridge_sso: string | null
          open_tabs: Json
          pinned_widgets: Json
          secondary_tab_href: string | null
          settings: Json
          side_panel_open: boolean
          split_primary_pinned_href: string | null
          split_view: boolean
          updated_at: string
          user_id: string
          workspace_activity_log: Json
          workspace_persona: string
          workspace_scenarios: Json
        }
        Insert: {
          active_tabs?: Json
          assistant_split_docked?: boolean
          browser_bookmarks?: Json
          browser_panel_enabled?: boolean
          default_browser_homepage?: string
          default_project_id?: string | null
          diamond_workspace_layout?: Json
          email_bridge_sso?: string | null
          open_tabs?: Json
          pinned_widgets?: Json
          secondary_tab_href?: string | null
          settings?: Json
          side_panel_open?: boolean
          split_primary_pinned_href?: string | null
          split_view?: boolean
          updated_at?: string
          user_id: string
          workspace_activity_log?: Json
          workspace_persona?: string
          workspace_scenarios?: Json
        }
        Update: {
          active_tabs?: Json
          assistant_split_docked?: boolean
          browser_bookmarks?: Json
          browser_panel_enabled?: boolean
          default_browser_homepage?: string
          default_project_id?: string | null
          diamond_workspace_layout?: Json
          email_bridge_sso?: string | null
          open_tabs?: Json
          pinned_widgets?: Json
          secondary_tab_href?: string | null
          settings?: Json
          side_panel_open?: boolean
          split_primary_pinned_href?: string | null
          split_view?: boolean
          updated_at?: string
          user_id?: string
          workspace_activity_log?: Json
          workspace_persona?: string
          workspace_scenarios?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_workspace_settings_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          profession: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          profession: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          profession?: string
        }
        Relationships: []
      }
    }
    Views: {
      contract_items: {
        Row: {
          contract_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          sort_order: number | null
          total_amount: number | null
          wbs_weight_percent: number | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          sort_order?: number | null
          total_amount?: number | null
          wbs_weight_percent?: number | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          sort_order?: number | null
          total_amount?: number | null
          wbs_weight_percent?: number | null
        }
        Relationships: []
      }
      supplier_summaries: {
        Row: {
          active_pos_count: number | null
          current_debt: number | null
          name: string | null
          rating: number | null
          supplier_id: string | null
          total_spent_2025: number | null
        }
        Relationships: []
      }
      user_workspace_state: {
        Row: {
          active_tabs: Json | null
          assistant_split_docked: boolean | null
          browser_bookmarks: Json | null
          browser_panel_enabled: boolean | null
          default_browser_homepage: string | null
          default_project_id: string | null
          diamond_workspace_layout: Json | null
          email_bridge_sso: string | null
          open_tabs: Json | null
          pinned_widgets: Json | null
          secondary_tab_href: string | null
          side_panel_open: boolean | null
          split_primary_pinned_href: string | null
          split_view: boolean | null
          updated_at: string | null
          user_id: string | null
          workspace_persona: string | null
        }
        Insert: {
          active_tabs?: Json | null
          assistant_split_docked?: boolean | null
          browser_bookmarks?: Json | null
          browser_panel_enabled?: boolean | null
          default_browser_homepage?: string | null
          default_project_id?: string | null
          diamond_workspace_layout?: Json | null
          email_bridge_sso?: string | null
          open_tabs?: Json | null
          pinned_widgets?: Json | null
          secondary_tab_href?: string | null
          side_panel_open?: boolean | null
          split_primary_pinned_href?: string | null
          split_view?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          workspace_persona?: string | null
        }
        Update: {
          active_tabs?: Json | null
          assistant_split_docked?: boolean | null
          browser_bookmarks?: Json | null
          browser_panel_enabled?: boolean | null
          default_browser_homepage?: string | null
          default_project_id?: string | null
          diamond_workspace_layout?: Json | null
          email_bridge_sso?: string | null
          open_tabs?: Json | null
          pinned_widgets?: Json | null
          secondary_tab_href?: string | null
          side_panel_open?: boolean | null
          split_primary_pinned_href?: string | null
          split_view?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          workspace_persona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_workspace_settings_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      dashboard_stats: { Args: never; Returns: Json }
      mo_user_can_post_project_wall: {
        Args: { p_project_id: string }
        Returns: boolean
      }
    }
    Enums: {
      amenity_type: "gym" | "clubhouse"
      finance_invoice_status:
        | "DRAFT"
        | "PENDING_ALLOCATION"
        | "APPROVED"
        | "PAID"
      finance_invoice_type: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
      holden_wh_po_status: "open" | "partially_received" | "closed"
      mo_contract_status: "draft" | "active" | "closed" | "terminated"
      mo_contract_type: "main_contract" | "sub_contract"
      mo_entity_type: "client" | "subcontractor" | "supplier"
      mo_invoice_document_type:
        | "tax_invoice"
        | "receipt"
        | "tax_invoice_receipt"
      mo_invoice_financial_status: "issued" | "paid" | "cancelled"
      mo_partial_account_status:
        | "draft"
        | "submitted"
        | "approved"
        | "sent"
        | "paid"
      mo_po_status: "draft" | "approved" | "sent" | "partial_receipt" | "closed"
      mo_project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      project_wall_ai_category: "technical" | "safety" | "delay" | "finance"
      project_wall_post_kind: "text" | "photo" | "tags"
      mo_receipt_payment_method:
        | "bank_transfer"
        | "check"
        | "credit_card"
        | "cash"
      mo_tender_document_status:
        | "to_execution"
        | "for_review"
        | "for_tender"
        | "ai_failed"
      mo_tender_document_type:
        | "boq"
        | "tech_spec"
        | "sale_spec"
        | "drawing_electrical"
        | "drawing_general"
      ticket_priority: "P1" | "P2" | "P3" | "P4"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      user_role: "admin" | "property_manager" | "tenant" | "contractor"
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
      amenity_type: ["gym", "clubhouse"],
      holden_wh_po_status: ["open", "partially_received", "closed"],
      mo_contract_status: ["draft", "active", "closed", "terminated"],
      mo_contract_type: ["main_contract", "sub_contract"],
      mo_entity_type: ["client", "subcontractor", "supplier"],
      mo_invoice_document_type: [
        "tax_invoice",
        "receipt",
        "tax_invoice_receipt",
      ],
      mo_invoice_financial_status: ["issued", "paid", "cancelled"],
      mo_partial_account_status: [
        "draft",
        "submitted",
        "approved",
        "sent",
        "paid",
      ],
      mo_po_status: ["draft", "approved", "sent", "partial_receipt", "closed"],
      mo_project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      project_wall_ai_category: ["technical", "safety", "delay", "finance"],
      project_wall_post_kind: ["text", "photo", "tags"],
      mo_receipt_payment_method: [
        "bank_transfer",
        "check",
        "credit_card",
        "cash",
      ],
      mo_tender_document_status: [
        "to_execution",
        "for_review",
        "for_tender",
        "ai_failed",
      ],
      mo_tender_document_type: [
        "boq",
        "tech_spec",
        "sale_spec",
        "drawing_electrical",
        "drawing_general",
      ],
      ticket_priority: ["P1", "P2", "P3", "P4"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      user_role: ["admin", "property_manager", "tenant", "contractor"],
    },
  },
} as const
