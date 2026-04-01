-- =============================================================================
-- Smart Building OS — ערכי דמה (עברית) לבדיקות UI
-- =============================================================================
-- הרצה: Supabase SQL Editor (מומלץ חיבור postgres / service role) או psql
-- דרישה: המיגרציה 20250322000000_initial_schema.sql הוחלה מראש.
--
-- משתמשי בדיקה (אימייל / סיסמה):
--   seed.admin@smartbuilding.local    | SeedPass123!
--   seed.tenant1@smartbuilding.local  | SeedPass123!
--   seed.tenant2@smartbuilding.local  | SeedPass123!
--
-- הערה: אם יש שגיאה בעמודות auth (גרסת Supabase שונה), צור שלושה משתמשים
-- ידנית ב-Dashboard והחלף את ה-UUIDים בקטע profiles למטה.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- מזהים קבועים
-- ---------------------------------------------------------------------------
-- admin:     a1111111-1111-4111-8111-111111111101
-- tenant 1:  a1111111-1111-4111-8111-111111111102
-- tenant 2:  a1111111-1111-4111-8111-111111111103
-- building:  b1111111-1111-4111-8111-111111111111
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- auth.users (דרוש ל-public.profiles)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    coalesce(
      (select id from auth.instances limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    'a1111111-1111-4111-8111-111111111101'::uuid,
    'authenticated',
    'authenticated',
    'seed.admin@smartbuilding.local',
    crypt('SeedPass123!', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    coalesce(
      (select id from auth.instances limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    'a1111111-1111-4111-8111-111111111102'::uuid,
    'authenticated',
    'authenticated',
    'seed.tenant1@smartbuilding.local',
    crypt('SeedPass123!', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    coalesce(
      (select id from auth.instances limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    'a1111111-1111-4111-8111-111111111103'::uuid,
    'authenticated',
    'authenticated',
    'seed.tenant2@smartbuilding.local',
    crypt('SeedPass123!', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- auth.identities (התחברות אימייל)
-- ---------------------------------------------------------------------------
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    'a1111111-1111-4111-8111-111111111101',
    'a1111111-1111-4111-8111-111111111101'::uuid,
    jsonb_build_object(
      'sub',
      'a1111111-1111-4111-8111-111111111101',
      'email',
      'seed.admin@smartbuilding.local'
    ),
    'email',
    now(),
    now(),
    now()
  ),
  (
    'a1111111-1111-4111-8111-111111111102',
    'a1111111-1111-4111-8111-111111111102'::uuid,
    jsonb_build_object(
      'sub',
      'a1111111-1111-4111-8111-111111111102',
      'email',
      'seed.tenant1@smartbuilding.local'
    ),
    'email',
    now(),
    now(),
    now()
  ),
  (
    'a1111111-1111-4111-8111-111111111103',
    'a1111111-1111-4111-8111-111111111103'::uuid,
    jsonb_build_object(
      'sub',
      'a1111111-1111-4111-8111-111111111103',
      'email',
      'seed.tenant2@smartbuilding.local'
    ),
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do nothing;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, role, phone, email, is_active)
values
  (
    'a1111111-1111-4111-8111-111111111101'::uuid,
    'יוסי כהן — מנהל מערכת',
    'admin',
    '050-0000001',
    'seed.admin@smartbuilding.local',
    true
  ),
  (
    'a1111111-1111-4111-8111-111111111102'::uuid,
    'מיכל לוי',
    'tenant',
    '050-0000002',
    'seed.tenant1@smartbuilding.local',
    true
  ),
  (
    'a1111111-1111-4111-8111-111111111103'::uuid,
    'דני רוזן',
    'tenant',
    '050-0000003',
    'seed.tenant2@smartbuilding.local',
    true
  )
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  phone = excluded.phone,
  email = coalesce(excluded.email, public.profiles.email),
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- בניין אחד + 100 דירות
-- ---------------------------------------------------------------------------
insert into public.buildings (
  id,
  name,
  address_line1,
  address_line2,
  city,
  region,
  postal_code,
  country
)
values (
  'b1111111-1111-4111-8111-111111111111'::uuid,
  'מגדל עיר היין - שלב א',
  'רחוב היין 12',
  'כניסה א',
  'ראשון לציון',
  'השפלה',
  '7570700',
  'IL'
)
on conflict (id) do update
set
  name = excluded.name,
  address_line1 = excluded.address_line1,
  city = excluded.city;

insert into public.apartments (building_id, unit_number, floor, bedrooms)
select
  'b1111111-1111-4111-8111-111111111111'::uuid,
  lpad(g::text, 3, '0'),
  ((g - 1) / 10) + 1,
  case
    when g % 5 = 0 then 4
    when g % 3 = 0 then 2
    else 3
  end
from generate_series(1, 100) as g
on conflict (building_id, unit_number) do nothing;

-- שיוך דיירים לדירות (דמו ל־CRM)
update public.apartments
set tenant_id = 'a1111111-1111-4111-8111-111111111102'::uuid
where
  building_id = 'b1111111-1111-4111-8111-111111111111'::uuid
  and unit_number = '001';

update public.apartments
set tenant_id = 'a1111111-1111-4111-8111-111111111103'::uuid
where
  building_id = 'b1111111-1111-4111-8111-111111111111'::uuid
  and unit_number = '002';

-- ---------------------------------------------------------------------------
-- מקומות חניה לטעינה (כולל מקום 44 לפי הקריאה)
-- ---------------------------------------------------------------------------
insert into public.parking_spots (id, building_id, label, ev_ready, assigned_tenant_id)
values
  (
    'c1111111-1111-4111-8111-111111111101'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    '44',
    true,
    'a1111111-1111-4111-8111-111111111102'::uuid
  ),
  (
    'c1111111-1111-4111-8111-111111111102'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    '12',
    true,
    null
  ),
  (
    'c1111111-1111-4111-8111-111111111103'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    '07',
    true,
    'a1111111-1111-4111-8111-111111111103'::uuid
  ),
  (
    'c1111111-1111-4111-8111-111111111104'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    '05',
    true,
    null
  )
on conflict (building_id, label) do update
set
  ev_ready = excluded.ev_ready,
  assigned_tenant_id = excluded.assigned_tenant_id;

-- ---------------------------------------------------------------------------
-- ארבע קריאות שירות
-- ---------------------------------------------------------------------------
insert into public.tickets (
  id,
  building_id,
  apartment_id,
  title,
  description,
  priority,
  status,
  sla_due_at,
  created_by,
  assigned_to,
  resolved_at
)
values
  (
    'd1111111-1111-4111-8111-111111111101'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    (
      select id
      from public.apartments
      where
        building_id = 'b1111111-1111-4111-8111-111111111111'::uuid
        and unit_number = '001'
      limit 1
    ),
    'הצפה בחדר משאבות ראשי',
    'דליפת מים מהצינור הראשי; נדרש טיפול מיידי וצוות אחזקה.',
    'P1',
    'open',
    now() + interval '15 minutes',
    'a1111111-1111-4111-8111-111111111101'::uuid,
    'a1111111-1111-4111-8111-111111111101'::uuid,
    null
  ),
  (
    'd1111111-1111-4111-8111-111111111102'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    null,
    'עמדת טעינה רכב 44 לא משחררת כבל',
    'הדייר מדווח שהכבל נשאר נעול בעמדה לאחר סיום הטעינה.',
    'P2',
    'in_progress',
    now() + interval '1 hour',
    'a1111111-1111-4111-8111-111111111101'::uuid,
    'a1111111-1111-4111-8111-111111111101'::uuid,
    null
  ),
  (
    'd1111111-1111-4111-8111-111111111103'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    (
      select id
      from public.apartments
      where
        building_id = 'b1111111-1111-4111-8111-111111111111'::uuid
        and unit_number = '080'
      limit 1
    ),
    'נורה שרופה בלובי קומה 8',
    'החלפת גוף תאורה בלובי המזרחי.',
    'P3',
    'open',
    now() + interval '4 hours',
    'a1111111-1111-4111-8111-111111111101'::uuid,
    null,
    null
  ),
  (
    'd1111111-1111-4111-8111-111111111104'::uuid,
    'b1111111-1111-4111-8111-111111111111'::uuid,
    null,
    'בקשה לשלט חניה נוסף',
    'בקשת דייר לשלט חניה שני — בבדיקת ועד הבית.',
    'P4',
    'closed',
    null,
    'a1111111-1111-4111-8111-111111111101'::uuid,
    null,
    now() - interval '2 days'
  )
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  priority = excluded.priority,
  status = excluded.status,
  sla_due_at = excluded.sla_due_at,
  resolved_at = excluded.resolved_at;

-- ---------------------------------------------------------------------------
-- סשני טעינה (חודש נוכחי) — כמה מקומות
-- ---------------------------------------------------------------------------
insert into public.ev_charging_sessions (
  id,
  parking_spot_id,
  started_at,
  ended_at,
  kwh,
  meter_reading_start,
  meter_reading_end,
  recorded_by
)
values
  (
    'f1111111-1111-4111-8111-111111111101'::uuid,
    'c1111111-1111-4111-8111-111111111102'::uuid,
    date_trunc('month', now()) + interval '3 days' + interval '8 hours',
    date_trunc('month', now()) + interval '3 days' + interval '11 hours',
    42.3500,
    1200.0000,
    1242.3500,
    'a1111111-1111-4111-8111-111111111101'::uuid
  ),
  (
    'f1111111-1111-4111-8111-111111111102'::uuid,
    'c1111111-1111-4111-8111-111111111103'::uuid,
    date_trunc('month', now()) + interval '10 days' + interval '19 hours',
    date_trunc('month', now()) + interval '10 days' + interval '22 hours 30 minutes',
    28.1250,
    500.0000,
    528.1250,
    'a1111111-1111-4111-8111-111111111101'::uuid
  ),
  (
    'f1111111-1111-4111-8111-111111111103'::uuid,
    'c1111111-1111-4111-8111-111111111104'::uuid,
    date_trunc('month', now()) + interval '15 days' + interval '6 hours',
    date_trunc('month', now()) + interval '15 days' + interval '9 hours 15 minutes',
    55.8000,
    2100.5000,
    2156.3000,
    'a1111111-1111-4111-8111-111111111101'::uuid
  )
on conflict (id) do update
set
  kwh = excluded.kwh,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at;

-- ---------------------------------------------------------------------------
-- חשבונית חודשית לדוגמה (אותו חודש בלוח שנה ישראל)
-- ---------------------------------------------------------------------------
insert into public.ev_monthly_bills (
  parking_spot_id,
  period_start,
  period_end,
  kwh_total,
  electricity_rate_per_kwh,
  electricity_cost,
  management_fee,
  currency,
  total_amount,
  issued_at
)
values (
  'c1111111-1111-4111-8111-111111111102'::uuid,
  (date_trunc('month', (now() at time zone 'Asia/Jerusalem'))::date),
  (
    (date_trunc('month', (now() at time zone 'Asia/Jerusalem')) + interval '1 month - 1 day')::date
  ),
  126.2750,
  0.850000,
  107.33,
  45.00,
  'ILS',
  152.33,
  now()
)
on conflict (parking_spot_id, period_start, period_end) do update
set
  kwh_total = excluded.kwh_total,
  electricity_cost = excluded.electricity_cost,
  management_fee = excluded.management_fee,
  total_amount = excluded.total_amount;

-- ---------------------------------------------------------------------------
-- חדר כושר + שתי הזמנות להיום (Asia/Jerusalem)
-- ---------------------------------------------------------------------------
insert into public.amenities (
  id,
  building_id,
  name,
  type,
  capacity_per_slot,
  slot_minutes,
  is_active
)
values (
  'e1111111-1111-4111-8111-111111111101'::uuid,
  'b1111111-1111-4111-8111-111111111111'::uuid,
  'חדר כושר — מגדל עיר היין',
  'gym',
  6,
  60,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  capacity_per_slot = excluded.capacity_per_slot;

insert into public.amenity_bookings (
  id,
  amenity_id,
  tenant_id,
  starts_at,
  ends_at,
  party_size,
  health_declaration_version,
  health_declaration_payload,
  health_declaration_accepted_at,
  status
)
values
  (
    'f2111111-1111-4111-8111-111111111101'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    'a1111111-1111-4111-8111-111111111102'::uuid,
    (
      (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '9 hours')
      at time zone 'Asia/Jerusalem'
    ),
    (
      (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '10 hours')
      at time zone 'Asia/Jerusalem'
    ),
    2,
    'v1-2025',
    '{"no_fever": true, "no_symptoms": true}'::jsonb,
    now() - interval '1 hour',
    'confirmed'
  ),
  (
    'f2111111-1111-4111-8111-111111111102'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    'a1111111-1111-4111-8111-111111111103'::uuid,
    (
      (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '18 hours')
      at time zone 'Asia/Jerusalem'
    ),
    (
      (date_trunc('day', now() at time zone 'Asia/Jerusalem') + interval '19 hours')
      at time zone 'Asia/Jerusalem'
    ),
    1,
    'v1-2025',
    '{"no_fever": true, "no_symptoms": true}'::jsonb,
    now() - interval '30 minutes',
    'confirmed'
  )
on conflict (id) do update
set
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  party_size = excluded.party_size;

commit;
