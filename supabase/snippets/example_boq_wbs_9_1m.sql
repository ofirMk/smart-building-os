-- Example WBS / BOQ rows for a 9.1M NIS (excl. VAT) contract — run manually after picking :contract_id.
-- Weights: Basements 20%, Skeleton 14%, Floor electrical 66%.
-- Replace :contract_id with your uuid.

/*
insert into public.contract_line_items (
  contract_id,
  section_number,
  description,
  unit,
  quantity,
  unit_price,
  wbs_weight_percent,
  sort_order
) values
  (
    :contract_id,
    'WBS-1',
    'Basements',
    'מנה',
    1,
    1820000,
    20,
    1
  ),
  (
    :contract_id,
    'WBS-2',
    'Skeleton Support',
    'מנה',
    1,
    1274000,
    14,
    2
  ),
  (
    :contract_id,
    'WBS-3',
    'Floor Electrical Works',
    'מנה',
    1,
    6006000,
    66,
    3
  );

update public.contracts
set
  total_amount = 9100000,
  retention_pct = 5,
  insurance_pct = 0.8,
  lab_fees_pct = 0.5,
  index_linkage_base_date = date '2024-01-01',
  index_coefficient = 1
where id = :contract_id;

-- Deduction rules mirror (optional if backfill already ran):
insert into public.contract_deduction_rules (contract_id, deduction_kind, percent) values
  (:contract_id, 'retention', 5),
  (:contract_id, 'insurance', 0.8),
  (:contract_id, 'lab_fees', 0.5)
on conflict (contract_id, deduction_kind) do update set percent = excluded.percent;
*/
