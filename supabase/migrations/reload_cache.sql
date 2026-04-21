-- Quick maintenance script for PostgREST schema cache refresh.
-- Run this in Supabase SQL Editor when UI shows:
-- "Could not find the table ... in the schema cache"

NOTIFY pgrst, 'reload schema';
