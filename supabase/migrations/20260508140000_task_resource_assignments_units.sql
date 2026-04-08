-- Optional units per task–resource assignment (e.g. daily manpower cap)

alter table if exists public.task_resource_assignments
  add column if not exists units numeric null;
