-- ============================================================
-- Phase 1: Tenant RLS Hardening
-- Replaces all permissive `using(true)` policies on business
-- tables with strict `user_has_company_access(company_id)` policies.
-- Prerequisite: public.user_has_company_access() exists (migration 20260703110000).
-- Safe to run multiple times (idempotent via drop-if-exists + create).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION A: Add company_id to tables that lack it
-- ────────────────────────────────────────────────────────────

-- tasks: the WBS / Gantt legacy table (project_id → projects).
-- Default 'marker_ofek' covers all pre-existing rows (single-tenant history).
alter table public.tasks
  add column if not exists company_id text not null default 'marker_ofek';

create index if not exists tasks_company_id_idx on public.tasks (company_id);

-- ────────────────────────────────────────────────────────────
-- SECTION B: Harden tasks table RLS
-- ────────────────────────────────────────────────────────────

drop policy if exists "Allow all for authenticated users" on public.tasks;
drop policy if exists tasks_tenant_isolation on public.tasks;
create policy tasks_tenant_isolation
  on public.tasks
  for all
  to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ────────────────────────────────────────────────────────────
-- SECTION C: ERP core tables (erp_*)
-- ────────────────────────────────────────────────────────────

drop policy if exists erp_blanket_purchase_order_lines_all_authenticated on public.erp_blanket_purchase_order_lines;
drop policy if exists erp_blanket_purchase_order_lines_tenant_isolation on public.erp_blanket_purchase_order_lines;
create policy erp_blanket_purchase_order_lines_tenant_isolation
  on public.erp_blanket_purchase_order_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_blanket_purchase_orders_all_authenticated on public.erp_blanket_purchase_orders;
drop policy if exists erp_blanket_purchase_orders_tenant_isolation on public.erp_blanket_purchase_orders;
create policy erp_blanket_purchase_orders_tenant_isolation
  on public.erp_blanket_purchase_orders for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_change_orders_all_authenticated on public.erp_change_orders;
drop policy if exists erp_change_orders_tenant_isolation on public.erp_change_orders;
create policy erp_change_orders_tenant_isolation
  on public.erp_change_orders for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_client_contract_lines_all_authenticated on public.erp_client_contract_lines;
drop policy if exists erp_client_contract_lines_tenant_isolation on public.erp_client_contract_lines;
create policy erp_client_contract_lines_tenant_isolation
  on public.erp_client_contract_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_client_contracts_all_authenticated on public.erp_client_contracts;
drop policy if exists erp_client_contracts_tenant_isolation on public.erp_client_contracts;
create policy erp_client_contracts_tenant_isolation
  on public.erp_client_contracts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_client_progress_bill_lines_all_authenticated on public.erp_client_progress_bill_lines;
drop policy if exists erp_client_progress_bill_lines_tenant_isolation on public.erp_client_progress_bill_lines;
create policy erp_client_progress_bill_lines_tenant_isolation
  on public.erp_client_progress_bill_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_client_progress_bills_all_authenticated on public.erp_client_progress_bills;
drop policy if exists erp_client_progress_bills_tenant_isolation on public.erp_client_progress_bills;
create policy erp_client_progress_bills_tenant_isolation
  on public.erp_client_progress_bills for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_contract_lines_all_authenticated on public.erp_contract_lines;
drop policy if exists erp_contract_lines_tenant_isolation on public.erp_contract_lines;
create policy erp_contract_lines_tenant_isolation
  on public.erp_contract_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_contract_status_events_all_authenticated on public.erp_contract_status_events;
drop policy if exists erp_contract_status_events_tenant_isolation on public.erp_contract_status_events;
create policy erp_contract_status_events_tenant_isolation
  on public.erp_contract_status_events for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_contracts_all_authenticated on public.erp_contracts;
drop policy if exists erp_contracts_tenant_isolation on public.erp_contracts;
create policy erp_contracts_tenant_isolation
  on public.erp_contracts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_field_material_receipts_all_authenticated on public.erp_field_material_receipts;
drop policy if exists erp_field_material_receipts_tenant_isolation on public.erp_field_material_receipts;
create policy erp_field_material_receipts_tenant_isolation
  on public.erp_field_material_receipts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_field_work_logs_all_authenticated on public.erp_field_work_logs;
drop policy if exists erp_field_work_logs_tenant_isolation on public.erp_field_work_logs;
create policy erp_field_work_logs_tenant_isolation
  on public.erp_field_work_logs for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_goods_receipt_lines_all_authenticated on public.erp_goods_receipt_lines;
drop policy if exists erp_goods_receipt_lines_tenant_isolation on public.erp_goods_receipt_lines;
create policy erp_goods_receipt_lines_tenant_isolation
  on public.erp_goods_receipt_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_goods_receipts_all_authenticated on public.erp_goods_receipts;
drop policy if exists erp_goods_receipts_tenant_isolation on public.erp_goods_receipts;
create policy erp_goods_receipts_tenant_isolation
  on public.erp_goods_receipts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_inventory_movements_all_authenticated on public.erp_inventory_movements;
drop policy if exists erp_inventory_movements_tenant_isolation on public.erp_inventory_movements;
create policy erp_inventory_movements_tenant_isolation
  on public.erp_inventory_movements for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_item_families_select_authenticated on public.erp_item_families;
drop policy if exists erp_item_families_tenant_isolation on public.erp_item_families;
create policy erp_item_families_tenant_isolation
  on public.erp_item_families for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_item_family_types_all_authenticated on public.erp_item_family_types;
drop policy if exists erp_item_family_types_all_authenticated_v2 on public.erp_item_family_types;
drop policy if exists erp_item_family_types_tenant_isolation on public.erp_item_family_types;
create policy erp_item_family_types_tenant_isolation
  on public.erp_item_family_types for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_supplier_bank_accounts_all_authenticated on public.erp_md_supplier_bank_accounts;
drop policy if exists erp_md_supplier_bank_accounts_tenant_isolation on public.erp_md_supplier_bank_accounts;
create policy erp_md_supplier_bank_accounts_tenant_isolation
  on public.erp_md_supplier_bank_accounts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_supplier_contacts_all_authenticated on public.erp_md_supplier_contacts;
drop policy if exists erp_md_supplier_contacts_tenant_isolation on public.erp_md_supplier_contacts;
create policy erp_md_supplier_contacts_tenant_isolation
  on public.erp_md_supplier_contacts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_suppliers_all_authenticated on public.erp_md_suppliers;
drop policy if exists erp_md_suppliers_tenant_isolation on public.erp_md_suppliers;
create policy erp_md_suppliers_tenant_isolation
  on public.erp_md_suppliers for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_procurement_status_events_all_authenticated on public.erp_procurement_status_events;
drop policy if exists erp_procurement_status_events_tenant_isolation on public.erp_procurement_status_events;
create policy erp_procurement_status_events_tenant_isolation
  on public.erp_procurement_status_events for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_boq_lines_all_authenticated on public.erp_proj_boq_lines;
drop policy if exists erp_proj_boq_lines_tenant_isolation on public.erp_proj_boq_lines;
create policy erp_proj_boq_lines_tenant_isolation
  on public.erp_proj_boq_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_planning_versions_all_authenticated on public.erp_proj_planning_versions;
drop policy if exists erp_proj_planning_versions_tenant_isolation on public.erp_proj_planning_versions;
create policy erp_proj_planning_versions_tenant_isolation
  on public.erp_proj_planning_versions for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_projects_all_authenticated on public.erp_proj_projects;
drop policy if exists erp_proj_projects_tenant_isolation on public.erp_proj_projects;
create policy erp_proj_projects_tenant_isolation
  on public.erp_proj_projects for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_project_budget_lines_all_authenticated on public.erp_project_budget_lines;
drop policy if exists erp_project_budget_lines_tenant_isolation on public.erp_project_budget_lines;
create policy erp_project_budget_lines_tenant_isolation
  on public.erp_project_budget_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_purchase_order_lines_all_authenticated on public.erp_purchase_order_lines;
drop policy if exists erp_purchase_order_lines_tenant_isolation on public.erp_purchase_order_lines;
create policy erp_purchase_order_lines_tenant_isolation
  on public.erp_purchase_order_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_purchase_orders_all_authenticated on public.erp_purchase_orders;
drop policy if exists erp_purchase_orders_tenant_isolation on public.erp_purchase_orders;
create policy erp_purchase_orders_tenant_isolation
  on public.erp_purchase_orders for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_rfq_lines_all_authenticated on public.erp_rfq_lines;
drop policy if exists erp_rfq_lines_tenant_isolation on public.erp_rfq_lines;
create policy erp_rfq_lines_tenant_isolation
  on public.erp_rfq_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_rfqs_all_authenticated on public.erp_rfqs;
drop policy if exists erp_rfqs_tenant_isolation on public.erp_rfqs;
create policy erp_rfqs_tenant_isolation
  on public.erp_rfqs for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_supplier_bank_account_change_log_all_authenticated on public.erp_supplier_bank_account_change_log;
drop policy if exists erp_supplier_bank_account_change_log_tenant_isolation on public.erp_supplier_bank_account_change_log;
create policy erp_supplier_bank_account_change_log_tenant_isolation
  on public.erp_supplier_bank_account_change_log for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_supplier_bank_accounts_all_authenticated on public.erp_supplier_bank_accounts;
drop policy if exists erp_supplier_bank_accounts_tenant_isolation on public.erp_supplier_bank_accounts;
create policy erp_supplier_bank_accounts_tenant_isolation
  on public.erp_supplier_bank_accounts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_invoice_lines_all_authenticated on public.erp_vendor_invoice_lines;
drop policy if exists erp_vendor_invoice_lines_tenant_isolation on public.erp_vendor_invoice_lines;
create policy erp_vendor_invoice_lines_tenant_isolation
  on public.erp_vendor_invoice_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_invoice_receipts_all_authenticated on public.erp_vendor_invoice_receipts;
drop policy if exists erp_vendor_invoice_receipts_tenant_isolation on public.erp_vendor_invoice_receipts;
create policy erp_vendor_invoice_receipts_tenant_isolation
  on public.erp_vendor_invoice_receipts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_invoices_all_authenticated on public.erp_vendor_invoices;
drop policy if exists erp_vendor_invoices_tenant_isolation on public.erp_vendor_invoices;
create policy erp_vendor_invoices_tenant_isolation
  on public.erp_vendor_invoices for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_price_list_items_all_authenticated on public.erp_vendor_price_list_items;
drop policy if exists erp_vendor_price_list_items_tenant_isolation on public.erp_vendor_price_list_items;
create policy erp_vendor_price_list_items_tenant_isolation
  on public.erp_vendor_price_list_items for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_price_lists_all_authenticated on public.erp_vendor_price_lists;
drop policy if exists erp_vendor_price_lists_tenant_isolation on public.erp_vendor_price_lists;
create policy erp_vendor_price_lists_tenant_isolation
  on public.erp_vendor_price_lists for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_quote_lines_all_authenticated on public.erp_vendor_quote_lines;
drop policy if exists erp_vendor_quote_lines_tenant_isolation on public.erp_vendor_quote_lines;
create policy erp_vendor_quote_lines_tenant_isolation
  on public.erp_vendor_quote_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_vendor_quotes_all_authenticated on public.erp_vendor_quotes;
drop policy if exists erp_vendor_quotes_tenant_isolation on public.erp_vendor_quotes;
create policy erp_vendor_quotes_tenant_isolation
  on public.erp_vendor_quotes for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_workflow_notifications_all_authenticated on public.erp_workflow_notifications;
drop policy if exists erp_workflow_notifications_tenant_isolation on public.erp_workflow_notifications;
create policy erp_workflow_notifications_tenant_isolation
  on public.erp_workflow_notifications for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ────────────────────────────────────────────────────────────
-- SECTION D: Execution tables (exec_*)
-- ────────────────────────────────────────────────────────────

drop policy if exists exec_checklists_all_authenticated on public.exec_checklists;
drop policy if exists exec_checklists_tenant_isolation on public.exec_checklists;
create policy exec_checklists_tenant_isolation
  on public.exec_checklists for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists exec_daily_log_workforce_lines_all_authenticated on public.exec_daily_log_workforce_lines;
drop policy if exists exec_daily_log_workforce_lines_tenant_isolation on public.exec_daily_log_workforce_lines;
create policy exec_daily_log_workforce_lines_tenant_isolation
  on public.exec_daily_log_workforce_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists exec_daily_logs_all_authenticated on public.exec_daily_logs;
drop policy if exists exec_daily_logs_tenant_isolation on public.exec_daily_logs;
create policy exec_daily_logs_tenant_isolation
  on public.exec_daily_logs for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists exec_defect_activity_all_authenticated on public.exec_defect_activity;
drop policy if exists exec_defect_activity_tenant_isolation on public.exec_defect_activity;
create policy exec_defect_activity_tenant_isolation
  on public.exec_defect_activity for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists exec_defects_all_authenticated on public.exec_defects;
drop policy if exists exec_defects_tenant_isolation on public.exec_defects;
create policy exec_defects_tenant_isolation
  on public.exec_defects for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists exec_qa_safety_forms_all_authenticated on public.exec_qa_safety_forms;
drop policy if exists exec_qa_safety_forms_tenant_isolation on public.exec_qa_safety_forms;
create policy exec_qa_safety_forms_tenant_isolation
  on public.exec_qa_safety_forms for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ────────────────────────────────────────────────────────────
-- SECTION E: Finance tables (fin_*)
-- ────────────────────────────────────────────────────────────

drop policy if exists fin_actual_payments_all_authenticated on public.fin_actual_payments;
drop policy if exists fin_actual_payments_tenant_isolation on public.fin_actual_payments;
create policy fin_actual_payments_tenant_isolation
  on public.fin_actual_payments for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists fin_cash_flow_entries_all_authenticated on public.fin_cash_flow_entries;
drop policy if exists fin_cash_flow_entries_tenant_isolation on public.fin_cash_flow_entries;
create policy fin_cash_flow_entries_tenant_isolation
  on public.fin_cash_flow_entries for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists fin_client_billings_all_authenticated on public.fin_client_billings;
drop policy if exists fin_client_billings_tenant_isolation on public.fin_client_billings;
create policy fin_client_billings_tenant_isolation
  on public.fin_client_billings for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists fin_payment_demands_all_authenticated on public.fin_payment_demands;
drop policy if exists fin_payment_demands_tenant_isolation on public.fin_payment_demands;
create policy fin_payment_demands_tenant_isolation
  on public.fin_payment_demands for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ────────────────────────────────────────────────────────────
-- SECTION F: Legacy shared tables with company_id
-- ────────────────────────────────────────────────────────────

drop policy if exists suppliers_all_authenticated on public.suppliers;
drop policy if exists suppliers_tenant_isolation on public.suppliers;
create policy suppliers_tenant_isolation
  on public.suppliers for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
