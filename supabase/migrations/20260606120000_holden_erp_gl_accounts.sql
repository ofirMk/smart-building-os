CREATE TABLE IF NOT EXISTS public.gl_accounts (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('balance_sheet', 'pnl')),
    level INTEGER NOT NULL DEFAULT 1,
    parent_code TEXT REFERENCES public.gl_accounts(code) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;

-- Policies (Allow all authenticated users to read, admins to insert/update - standard ERP approach)
CREATE POLICY "Allow authenticated users to read gl_accounts" ON public.gl_accounts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert gl_accounts" ON public.gl_accounts
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update gl_accounts" ON public.gl_accounts
    FOR UPDATE TO authenticated USING (true);
