-- Seed minimal chart for dev / demos — Asset, Liability, Equity, Income, Expense

insert into public.gl_accounts (
  account_code,
  account_name_he,
  account_name_en,
  trial_balance_group,
  financial_statement_category,
  is_active,
  account_class
)
values
  (
    '1100',
    'נכסים — מזומן ובנק',
    'Cash and bank',
    '1',
    'asset',
    true,
    'asset'
  ),
  (
    '2100',
    'התחייבויות — ספקים',
    'Trade payables',
    '2',
    'liability',
    true,
    'liability'
  ),
  (
    '3100',
    'הון — הון עצמי (דוגמה)',
    'Equity sample',
    '3',
    'equity',
    true,
    'equity'
  ),
  (
    '4100',
    'הכנסות — הכנסות ממכירות',
    'Sales revenue',
    '4',
    'income',
    true,
    'income'
  ),
  (
    '5100',
    'הוצאות — הוצאות הנהלה',
    'General expenses',
    '5',
    'expense',
    true,
    'expense'
  )
on conflict (account_code) do update set
  account_name_he = excluded.account_name_he,
  account_name_en = excluded.account_name_en,
  trial_balance_group = excluded.trial_balance_group,
  financial_statement_category = excluded.financial_statement_category,
  is_active = excluded.is_active,
  account_class = excluded.account_class
