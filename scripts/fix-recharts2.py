import re

files = [
    'app/(dashboard)/marker-ofek/procurement/reports/spend/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/kpi/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/aging/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/variance/page.tsx',
]
for f in files:
    txt = open(f, encoding='utf-8').read()
    # Remove wrong import
    txt = re.sub(r'\nimport type \{ Formatter \} from "recharts"', '', txt)
    # Replace all: as unknown as Formatter<number, string>}  with  as never}
    txt = txt.replace('as unknown as Formatter<number, string>}', 'as never}')
    # Fix labelFormatter
    txt = txt.replace('as unknown as (label: unknown, payload: unknown[]) => string}', 'as never}')
    # Also fix any leftover ...rest: unknown[] pattern in formatter that still errors
    # i.e. formatter={(fn) as never}  means the cast is inside - swap to outside
    open(f, 'w', encoding='utf-8').write(txt)
    print('Fixed:', f)
