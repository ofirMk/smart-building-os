import re, os

IMPORT_LINE = 'import type { Formatter } from "recharts"'
LABEL_OLD = 'as unknown as (l: string) => string}'
LABEL_NEW = 'as unknown as (label: unknown, payload: unknown[]) => string}'

files = [
    'app/(dashboard)/marker-ofek/procurement/reports/spend/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/kpi/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/aging/page.tsx',
    'app/(dashboard)/marker-ofek/procurement/reports/variance/page.tsx',
]
for f in files:
    txt = open(f, encoding='utf-8').read()
    if IMPORT_LINE not in txt:
        txt = re.sub(r'(from "recharts")', r'\1\n' + IMPORT_LINE, txt, count=1)
    txt = txt.replace(LABEL_OLD, LABEL_NEW)
    open(f, 'w', encoding='utf-8').write(txt)
    print('Fixed:', f)
