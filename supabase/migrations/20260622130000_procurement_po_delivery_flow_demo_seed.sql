-- Demo seed for /marker-ofek/procurement/purchase-order-delivery-flow
-- Electrical infrastructure: project, client + supplier entities, master supplier, מקט״י ספק, parallel erp_items catalog.
-- Idempotent: safe to re-run (skips existing rows keyed by codes / part numbers).

do $$
declare
  v_project_id uuid;
  v_client_entity_id uuid;
  v_supplier_entity_id uuid;
  v_supplier_master_id uuid;
  v_currency_ils uuid;
begin
  select c.id
  into v_currency_ils
  from public.currencies c
  where c.code = 'ILS'
  limit 1;

  select p.id
  into v_project_id
  from public.projects p
  where p.internal_project_code = 'MOF-DEMO-RAMAT-WINE'
  order by p.id asc
  limit 1;

  if v_project_id is null then
    insert into public.projects (
      internal_project_code,
      name,
      status,
      is_deleted
    )
    values (
      'MOF-DEMO-RAMAT-WINE',
      'רמת עיר היין',
      'active',
      false
    )
    returning id into v_project_id;
  else
    update public.projects p
    set
      name = 'רמת עיר היין',
      status = 'active',
      is_deleted = false
    where p.id = v_project_id;
  end if;

  select e.id
  into v_client_entity_id
  from public.entities e
  where e.type = 'client'
    and e.legal_id = '556666778'
    and coalesce(e.is_deleted, false) = false
  limit 1;

  if v_client_entity_id is null then
    insert into public.entities (
      name,
      type,
      legal_id,
      is_deleted,
      contact_info
    )
    values (
      'יזם אתר — רמת עיר היין (דמו)',
      'client',
      '556666778',
      false,
      '{}'::jsonb
    )
    returning id into v_client_entity_id;
  end if;

  update public.projects p
  set client_entity_id = v_client_entity_id
  where p.id = v_project_id
    and (
      p.client_entity_id is distinct from v_client_entity_id
    );

  select e.id
  into v_supplier_entity_id
  from public.entities e
  where e.type = 'supplier'
    and e.legal_id = '514987512'
    and coalesce(e.is_deleted, false) = false
  limit 1;

  if v_supplier_entity_id is null then
    insert into public.entities (
      name,
      type,
      legal_id,
      is_deleted,
      contact_info
    )
    values (
      'חשמל ישיר — ספק דמו',
      'supplier',
      '514987512',
      false,
      '{}'::jsonb
    )
    returning id into v_supplier_entity_id;
  end if;

  select s.id
  into v_supplier_master_id
  from public.suppliers s
  where s.entity_id = v_supplier_entity_id
  limit 1;

  if v_supplier_master_id is null then
    insert into public.suppliers (
      name,
      tax_id,
      entity_id,
      currency_id,
      payment_term_code
    )
    values (
      'חשמל ישיר',
      '514987512',
      v_supplier_entity_id,
      v_currency_ils,
      '11'
    )
    returning id into v_supplier_master_id;
  else
    update public.suppliers s
    set
      tax_id = coalesce(nullif(trim(s.tax_id), ''), '514987512'),
      entity_id = coalesce(s.entity_id, v_supplier_entity_id),
      currency_id = coalesce(s.currency_id, v_currency_ils),
      payment_term_code = coalesce(s.payment_term_code, '11')
    where s.id = v_supplier_master_id;
  end if;

  -- מקט״י ספק — what the PO form loads (supplier_parts.master)
  insert into public.supplier_parts (
    supplier_id,
    part_number_supplier,
    manufacturer,
    supplier_name_text,
    description_32_chars,
    description_48_chars,
    material_risk
  )
  select
    v_supplier_master_id,
    v.part_no,
    v.mfr,
    'חשמל ישיר',
    left(v.d32, 32),
    left(v.d48, 48),
    'standard'
  from (
    values
      (
        'MOF-DEMO-XLPE-3X25',
        'Nexans',
        'כבל XLPE 3x2.5 מ״מ',
        'כבל נחושת XLPE 3x2.5 — מתח נמוך'
      ),
      (
        'MOF-DEMO-XLPE-3X240',
        'Prysmian',
        'כבל XLPE 3x240',
        'כבל כוח XLPE 0.6/1kV — תשתית'
      ),
      (
        'MOF-DEMO-PVC-32',
        'גלגל',
        'צינור PVC 32 מ״מ',
        'צינור PVC קשיח לתשתית בניין'
      ),
      (
        'MOF-DEMO-MCB-C16',
        'Schneider',
        'מנתק C16 1P',
        'מנתק אוטומטי יחיד 16A — iC60'
      )
  ) as v(part_no, mfr, d32, d48)
  where not exists (
    select 1
    from public.supplier_parts sp
    where sp.supplier_id = v_supplier_master_id
      and sp.part_number_supplier = v.part_no
  );

  -- קטלוג ERP מקביל (erp_items) — לא נטען ישירות בטופס הזרימה, אך משלים מאגר פריטים
  insert into public.erp_items (
    sku,
    description,
    family_code,
    uom_code,
    base_price,
    currency_code,
    is_active
  )
  select
    v.sku,
    v.description,
    v.family_code,
    v.uom_code,
    v.base_price,
    v.currency_code,
    v.is_active
  from (
    values
      (
        'MOF-ELEC-XLPE-3X25'::varchar,
        'כבל נחושת XLPE 3x2.5 מ״מ — מתח נמוך'::varchar,
        'MAT'::varchar,
        'M'::varchar,
        14.5::numeric,
        'ILS'::varchar,
        true::boolean
      ),
      (
        'MOF-ELEC-XLPE-3X240',
        'כבל כוח XLPE 3x240 — 0.6/1kV',
        'MAT',
        'M',
        420,
        'ILS',
        true
      ),
      (
        'MOF-ELEC-PVC-32',
        'צינור PVC קשיח 32 מ״מ',
        'MAT',
        'M',
        8.2,
        'ILS',
        true
      ),
      (
        'MOF-ELEC-MCB-C16',
        'מנתק אוטומטי C16 1P',
        'EQP',
        'EA',
        68,
        'ILS',
        true
      )
  ) as v(
    sku,
    description,
    family_code,
    uom_code,
    base_price,
    currency_code,
    is_active
  )
  where not exists (
    select 1
    from public.erp_items ei
    where ei.sku = v.sku
  );
end;
$$;
