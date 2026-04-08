-- Holden ERP — קישור שורות יומן לפרויקט / WBS + מטא-דאטה ייבוא Priority

-- ---------------------------------------------------------------------------
-- gl_journal_lines — קישור לביצוע פרויקט ומסמך מקור Priority
-- ---------------------------------------------------------------------------
alter table public.gl_journal_lines
  add column if not exists project_id uuid null references public.projects (id) on delete set null;

alter table public.gl_journal_lines
  add column if not exists wbs_node_id uuid null references public.erp_project_wbs (id) on delete set null;

alter table public.gl_journal_lines
  add column if not exists legacy_journal_entry_number varchar(64) null;

alter table public.gl_journal_lines
  add column if not exists transaction_type varchar(128) null;

comment on column public.gl_journal_lines.project_id is
  'פרויקט בשורה (ייתכן שונה מכותרת הפקודה — דוחות לפי שורה)';

comment on column public.gl_journal_lines.wbs_node_id is
  'אבן דרך / פעילות WBS — FK ל-erp_project_wbs';

comment on column public.gl_journal_lines.legacy_journal_entry_number is
  'מספר תנועת יומן במערכת Priority (מפתח ביקורת)';

comment on column public.gl_journal_lines.transaction_type is
  'סוג תנועה מקורי — לדוגמה יתרת פתיחה, חשבונית';

create index if not exists gl_journal_lines_line_project_id_idx
  on public.gl_journal_lines (project_id)
  where project_id is not null;

create index if not exists gl_journal_lines_wbs_node_id_idx
  on public.gl_journal_lines (wbs_node_id)
  where wbs_node_id is not null;

create index if not exists gl_journal_lines_legacy_je_num_idx
  on public.gl_journal_lines (legacy_journal_entry_number)
  where legacy_journal_entry_number is not null;

-- ---------------------------------------------------------------------------
-- RLS — שורות יומן: גישה לפי project_id בכותרת או בשורה
-- ---------------------------------------------------------------------------
drop policy if exists gl_journal_lines_select_scope on public.gl_journal_lines;
create policy gl_journal_lines_select_scope
  on public.gl_journal_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_access_project(je.project_id)
          )
          or (
            gl_journal_lines.project_id is not null
            and public.mo_user_can_access_project(gl_journal_lines.project_id)
          )
          or (
            coalesce(je.project_id, gl_journal_lines.project_id) is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_insert_scope on public.gl_journal_lines;
create policy gl_journal_lines_insert_scope
  on public.gl_journal_lines
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            gl_journal_lines.project_id is not null
            and public.mo_user_can_edit_project_financials(gl_journal_lines.project_id)
          )
          or (
            coalesce(je.project_id, gl_journal_lines.project_id) is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_update_scope on public.gl_journal_lines;
create policy gl_journal_lines_update_scope
  on public.gl_journal_lines
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            gl_journal_lines.project_id is not null
            and public.mo_user_can_edit_project_financials(gl_journal_lines.project_id)
          )
          or (
            coalesce(je.project_id, gl_journal_lines.project_id) is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            gl_journal_lines.project_id is not null
            and public.mo_user_can_edit_project_financials(gl_journal_lines.project_id)
          )
          or (
            coalesce(je.project_id, gl_journal_lines.project_id) is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );

drop policy if exists gl_journal_lines_delete_scope on public.gl_journal_lines;
create policy gl_journal_lines_delete_scope
  on public.gl_journal_lines
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.gl_journal_entries je
      where je.id = gl_journal_lines.journal_entry_id
        and (
          (
            je.project_id is not null
            and public.mo_user_can_edit_project_financials(je.project_id)
          )
          or (
            gl_journal_lines.project_id is not null
            and public.mo_user_can_edit_project_financials(gl_journal_lines.project_id)
          )
          or (
            coalesce(je.project_id, gl_journal_lines.project_id) is null
            and exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and (
                  p.role = 'admin'::public.user_role
                  or coalesce(p.marker_ofek_full_project_access, false) = true
                )
            )
          )
        )
    )
  );
