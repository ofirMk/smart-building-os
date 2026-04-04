-- חשבוניות מס (mo_invoices) + תשלומים — RLS תואם חוזים/פרויקט (אחרי mo_user_can_*).
-- בטוח כשהטבלאות עדיין לא קיימות בסביבה מסוימת.

do $$
begin
  if to_regclass('public.mo_invoices') is not null then
    execute 'drop policy if exists mo_invoices_admin_all on public.mo_invoices';
    execute 'drop policy if exists mo_invoices_financial_select on public.mo_invoices';
    execute 'drop policy if exists mo_invoices_financial_insert on public.mo_invoices';
    execute 'drop policy if exists mo_invoices_financial_update on public.mo_invoices';
    execute 'drop policy if exists mo_invoices_financial_delete on public.mo_invoices';

    execute $pol$
    create policy mo_invoices_financial_select
      on public.mo_invoices
      for select
      to authenticated
      using (public.mo_user_can_access_project(project_id))
    $pol$;

    execute $pol$
    create policy mo_invoices_financial_insert
      on public.mo_invoices
      for insert
      to authenticated
      with check (public.mo_user_can_edit_project_financials(project_id))
    $pol$;

    execute $pol$
    create policy mo_invoices_financial_update
      on public.mo_invoices
      for update
      to authenticated
      using (public.mo_user_can_edit_project_financials(project_id))
      with check (public.mo_user_can_edit_project_financials(project_id))
    $pol$;

    execute $pol$
    create policy mo_invoices_financial_delete
      on public.mo_invoices
      for delete
      to authenticated
      using (public.mo_user_can_edit_project_financials(project_id))
    $pol$;
  end if;

  if to_regclass('public.mo_receipt_payments') is not null then
    execute 'drop policy if exists mo_receipt_payments_admin_all on public.mo_receipt_payments';
    execute 'drop policy if exists mo_receipt_payments_financial_select on public.mo_receipt_payments';
    execute 'drop policy if exists mo_receipt_payments_financial_insert on public.mo_receipt_payments';
    execute 'drop policy if exists mo_receipt_payments_financial_update on public.mo_receipt_payments';
    execute 'drop policy if exists mo_receipt_payments_financial_delete on public.mo_receipt_payments';

    execute $pol$
    create policy mo_receipt_payments_financial_select
      on public.mo_receipt_payments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = mo_receipt_payments.invoice_id
            and public.mo_user_can_access_project(inv.project_id)
        )
      )
    $pol$;

    execute $pol$
    create policy mo_receipt_payments_financial_insert
      on public.mo_receipt_payments
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = mo_receipt_payments.invoice_id
            and public.mo_user_can_edit_project_financials(inv.project_id)
        )
      )
    $pol$;

    execute $pol$
    create policy mo_receipt_payments_financial_update
      on public.mo_receipt_payments
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = mo_receipt_payments.invoice_id
            and public.mo_user_can_edit_project_financials(inv.project_id)
        )
      )
      with check (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = mo_receipt_payments.invoice_id
            and public.mo_user_can_edit_project_financials(inv.project_id)
        )
      )
    $pol$;

    execute $pol$
    create policy mo_receipt_payments_financial_delete
      on public.mo_receipt_payments
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = mo_receipt_payments.invoice_id
            and public.mo_user_can_edit_project_financials(inv.project_id)
        )
      )
    $pol$;
  end if;
end
$$;
