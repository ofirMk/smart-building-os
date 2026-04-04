-- Vault folder rows (no storage object): default taxonomy per project for WBS attach UX.

alter table public.project_documents
  alter column file_path drop not null;

alter table public.project_documents
  add column if not exists is_folder boolean not null default false;

alter table public.project_documents
  add column if not exists vault_folder_key text null;

alter table public.project_documents
  drop constraint if exists project_documents_folder_file_path_chk;

alter table public.project_documents
  add constraint project_documents_folder_file_path_chk
  check (
    (is_folder = true and file_path is null)
    or (is_folder = false and file_path is not null)
  );

create unique index if not exists project_documents_vault_folder_unique
  on public.project_documents (project_id, vault_folder_key)
  where vault_folder_key is not null;

comment on column public.project_documents.is_folder is 'Virtual folder row (no file in storage); children via parent_document_id.';
comment on column public.project_documents.vault_folder_key is 'Stable key for default folders: plans | supervision | testing | media';
