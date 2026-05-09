"use client";

/**
 * Subcontractor Contract — A4 Print Template
 * ----------------------------------------------------------------------------
 * Pixel-perfect reproduction of the client's hard-copy "חוזה לקבלן משנה" form,
 * rendered as RTL HTML and printable via `window.print()` to A4.
 *
 * הזרימה:
 *   1. שולף `id` מ-`useParams`.
 *   2. שולף 3 שאילתות במקביל מ-Supabase: header + boq lines + general terms.
 *      בנוסף — supplier + project + company display info.
 *   3. מציג שני "עמודים" לוגיים:
 *        עמוד 1 — header + פרטי חוזה + טבלת BOQ + סיכום + חתימות.
 *        עמוד 2 — הערות לחוזה קבלן ממוספרות (page-break-before).
 *   4. כפתור צף 🖨️ "הדפס / הפק PDF" שמוסתר ב-`@media print`.
 */

import { useParams } from "next/navigation";
import * as React from "react";
import { Loader2, Printer } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatError } from "@/lib/utils";

const VAT_PCT = 17;

// ---------------------------------------------------------------------------
// Types (mirror DB schema, snake_case as returned by PostgREST)
// ---------------------------------------------------------------------------

type ContractType = "PAUSHALI" | "MEASURED";
type ContractStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

type ContractRow = {
  id: string;
  company_id: string;
  project_id: string;
  subcontractor_id: string;
  contract_number: string;
  contract_type: ContractType;
  total_amount: number;
  insurance_pct: number;
  retention_pct: number;
  payment_terms: string | null;
  escalation_included: boolean;
  status: ContractStatus;
  signed_at: string | null;
};

type BoqLineRow = {
  line_no: number;
  section_code: string;
  description: string;
  uom: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total_line_price: number;
  escalation_included: boolean;
};

type GeneralTermRow = {
  term_index: number;
  term_text: string;
};

type SupplierRow = {
  name: string;
  tax_vat_id: string | null;
  payment_terms: string | null;
};

type ProjectRow = {
  name: string;
  project_number: string;
};

type CompanyRow = {
  id: string;
  name_he: string;
  name_en: string;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
});

const num3 = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" });

const CONTRACT_TYPE_HE: Record<ContractType, string> = {
  PAUSHALI: "פאושלי",
  MEASURED: "מדידי",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SubcontractorContractPrintPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [contract, setContract] = React.useState<ContractRow | null>(null);
  const [boq, setBoq] = React.useState<BoqLineRow[]>([]);
  const [terms, setTerms] = React.useState<GeneralTermRow[]>([]);
  const [supplier, setSupplier] = React.useState<SupplierRow | null>(null);
  const [project, setProject] = React.useState<ProjectRow | null>(null);
  const [company, setCompany] = React.useState<CompanyRow | null>(null);

  React.useEffect(() => {
    if (!id) {
      setError("מזהה חוזה חסר");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const supabase = createSupabaseBrowserClient();

        const cRes = await supabase
          .from("erp_subcontractor_contracts")
          .select(
            "id, company_id, project_id, subcontractor_id, contract_number, contract_type, total_amount, insurance_pct, retention_pct, payment_terms, escalation_included, status, signed_at"
          )
          .eq("id", id)
          .maybeSingle();

        if (cRes.error) throw cRes.error;
        if (!cRes.data) {
          if (!cancelled) setError("החוזה לא נמצא");
          return;
        }

        const c = cRes.data as ContractRow;
        if (!cancelled) setContract(c);

        const [boqRes, termsRes, suppRes, projRes, compRes] = await Promise.all([
          supabase
            .from("erp_contract_boq_lines")
            .select(
              "line_no, section_code, description, uom, quantity, unit_price, discount_amount, total_line_price, escalation_included"
            )
            .eq("contract_id", c.id)
            .order("line_no", { ascending: true }),
          supabase
            .from("erp_contract_general_terms")
            .select("term_index, term_text")
            .eq("contract_id", c.id)
            .order("term_index", { ascending: true }),
          supabase
            .from("erp_md_suppliers")
            .select("name, tax_vat_id, payment_terms")
            .eq("id", c.subcontractor_id)
            .maybeSingle(),
          supabase
            .from("erp_proj_projects")
            .select("name, project_number")
            .eq("id", c.project_id)
            .maybeSingle(),
          supabase
            .from("erp_companies")
            .select("id, name_he, name_en")
            .eq("id", c.company_id)
            .maybeSingle(),
        ]);

        if (boqRes.error) throw boqRes.error;
        if (termsRes.error) throw termsRes.error;
        if (suppRes.error) throw suppRes.error;
        if (projRes.error) throw projRes.error;
        if (compRes.error) throw compRes.error;

        if (!cancelled) {
          setBoq((boqRes.data ?? []) as BoqLineRow[]);
          setTerms((termsRes.data ?? []) as GeneralTermRow[]);
          setSupplier((suppRes.data ?? null) as SupplierRow | null);
          setProject((projRes.data ?? null) as ProjectRow | null);
          setCompany((compRes.data ?? null) as CompanyRow | null);
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-slate-600">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען חוזה…</p>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-slate-700">
        <p className="text-base font-semibold text-red-700">
          {error ?? "שגיאה בטעינת החוזה"}
        </p>
      </div>
    );
  }

  // ---- Computations ----
  const subtotal = Number(contract.total_amount) || 0;
  const vat = subtotal * (VAT_PCT / 100);
  const grand = subtotal + vat;

  const printDate = dateFmt.format(new Date());
  const signedDate = contract.signed_at
    ? dateFmt.format(new Date(contract.signed_at))
    : "—";

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black print:px-0 print:py-0">
      {/* כפתור צף — מוסתר בהדפסה */}
      <div
        data-print-control="1"
        className="fixed bottom-6 left-6 z-50 print:hidden"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-slate-900/20 transition hover:bg-slate-800 hover:shadow-xl active:scale-[0.98]"
          aria-label="הדפס / הפק PDF"
        >
          <Printer className="size-4" aria-hidden />
          <span>הדפס / הפק PDF</span>
        </button>
      </div>

      {/* ============================ עמוד 1 ============================ */}
      <article
        dir="rtl"
        lang="he"
        className="text-[12px] leading-[1.5] text-black"
        aria-label="חוזה לקבלן משנה"
      >
        {/* Header — לוגו + פרטי חברה (ימין) | כותרת חוזה (שמאל) */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          {/* פרטי חברה (RTL → ימין) */}
          <div className="flex items-start gap-3">
            <div
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-bold tracking-wider text-black"
            >
              לוגו
            </div>
            <div className="space-y-0.5">
              <p className="text-[14px] font-bold leading-tight">
                {company?.name_he ?? "אופק מרקר יזמות בע״מ"}
              </p>
              <p className="text-[11px] text-black">
                רחוב הרצל 100, תל-אביב · טל׳ 03-1234567
              </p>
              <p className="text-[11px] text-black">
                ח.פ <span className="font-mono">514029384</span>
              </p>
              <p className="text-[10px] text-black/70">
                תאריך הדפסה: <span className="font-mono">{printDate}</span>
              </p>
            </div>
          </div>

          {/* כותרת מסמך (LTR side of header for visual symmetry) */}
          <div className="text-end">
            <h1 className="border-2 border-black px-5 py-2 text-[20px] font-black tracking-tight">
              חוזה לקבלן משנה
            </h1>
            <p className="mt-1 text-[11px] text-black">
              מסמך מקור · A4
            </p>
          </div>
        </header>

        {/* קוביית פרטי חוזה */}
        <section
          aria-label="פרטי חוזה"
          className="mt-4 grid grid-cols-3 gap-0 border-2 border-black"
        >
          <DetailCell label="פרויקט" value={project?.name ?? "—"} />
          <DetailCell
            label="מספר חוזה"
            value={<span className="font-mono">{contract.contract_number}</span>}
          />
          <DetailCell label="שם קבלן" value={supplier?.name ?? "—"} />

          <DetailCell
            label="ח.פ קבלן"
            value={
              <span className="font-mono">{supplier?.tax_vat_id ?? "—"}</span>
            }
          />
          <DetailCell
            label="סוג הסכם"
            value={CONTRACT_TYPE_HE[contract.contract_type]}
          />
          <DetailCell
            label="התייקרות"
            value={contract.escalation_included ? "כן" : "לא"}
          />

          <DetailCell
            label="ביטוח (%)"
            value={
              <span className="font-mono">
                {contract.insurance_pct.toFixed(2)}%
              </span>
            }
          />
          <DetailCell
            label="עיכבון (%)"
            value={
              <span className="font-mono">
                {contract.retention_pct.toFixed(2)}%
              </span>
            }
          />
          <DetailCell
            label="תנאי תשלום"
            value={contract.payment_terms ?? supplier?.payment_terms ?? "—"}
          />
        </section>

        {/* טבלת BOQ */}
        <section aria-label="כתב כמויות" className="mt-4">
          <table className="w-full border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <Th className="w-[14%]">סעיף</Th>
                <Th className="w-[34%] text-start">תאור</Th>
                <Th className="w-[8%]">יח׳</Th>
                <Th className="w-[8%]">כמות</Th>
                <Th className="w-[10%]">מחיר ליחידה</Th>
                <Th className="w-[10%]">מחיר לאחר הנחה</Th>
                <Th className="w-[6%]">התייקרות?</Th>
                <Th className="w-[10%]">סכום</Th>
              </tr>
            </thead>
            <tbody>
              {boq.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-black px-3 py-3 text-center text-black/70"
                  >
                    לא הוזנו שורות BOQ
                  </td>
                </tr>
              ) : (
                boq.map((line) => {
                  const unitAfterDiscount =
                    line.quantity > 0
                      ? line.total_line_price / line.quantity
                      : Number(line.unit_price) || 0;
                  return (
                    <tr key={line.line_no} className="break-inside-avoid">
                      <Td className="font-mono">{line.section_code}</Td>
                      <Td className="text-start">{line.description}</Td>
                      <Td>{line.uom}</Td>
                      <Td className="font-mono tabular-nums">
                        {num3.format(Number(line.quantity) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {ils.format(Number(line.unit_price) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {ils.format(unitAfterDiscount)}
                      </Td>
                      <Td>{line.escalation_included ? "כן" : "לא"}</Td>
                      <Td className="font-mono tabular-nums font-semibold">
                        {ils.format(Number(line.total_line_price) || 0)}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* סיכום (קומת הטבלה) */}
            <tfoot>
              <tr className="border-t-2 border-black">
                <Th colSpan={7} className="text-end">
                  סה״כ מחיר (לפני מע״מ)
                </Th>
                <Td className="font-mono tabular-nums font-bold">
                  {ils.format(subtotal)}
                </Td>
              </tr>
              <tr>
                <Th colSpan={7} className="text-end">
                  מע״מ ({VAT_PCT}%)
                </Th>
                <Td className="font-mono tabular-nums">{ils.format(vat)}</Td>
              </tr>
              <tr className="bg-slate-200 print:bg-white">
                <Th colSpan={7} className="text-end text-[13px]">
                  סה״כ לתשלום (כולל מע״מ)
                </Th>
                <Td className="font-mono tabular-nums text-[13px] font-black">
                  {ils.format(grand)}
                </Td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* אזור חתימות */}
        <section
          aria-label="חתימות"
          className="mt-8 grid grid-cols-2 gap-8 print:mt-10"
        >
          <SignatureBox label="חתימת הקבלן" subLabel={supplier?.name ?? ""} />
          <SignatureBox
            label="חתימה מטעם החברה"
            subLabel={company?.name_he ?? ""}
          />
        </section>

        <p className="mt-3 text-center text-[10px] text-black/60">
          חתימה על מסמך זה מהווה אישור הסכמה מלאה לכל סעיפי החוזה, כולל ההערות
          המופיעות בעמוד הבא · נחתם ביום {signedDate}
        </p>
      </article>

      {/* ============================ עמוד 2 ============================ */}
      <article
        dir="rtl"
        lang="he"
        className="print-break-before-page mt-12 break-before-page text-[12px] leading-[1.6] text-black print:mt-0"
        aria-label="הערות לחוזה קבלן"
      >
        <header className="border-b-2 border-black pb-2">
          <h2 className="text-[18px] font-black">הערות לחוזה קבלן</h2>
          <p className="mt-1 text-[11px] text-black/70">
            חוזה <span className="font-mono">{contract.contract_number}</span>{" "}
            · {supplier?.name ?? "—"} · פרויקט: {project?.name ?? "—"}
          </p>
        </header>

        {terms.length === 0 ? (
          <p className="mt-6 text-center text-[12px] text-black/70">
            לא הוזנו סעיפי הערות לחוזה זה.
          </p>
        ) : (
          <ol className="mt-4 space-y-3 ps-6">
            {terms.map((t) => (
              <li
                key={t.term_index}
                className="break-inside-avoid"
                value={t.term_index}
              >
                <span className="font-bold">{t.term_index}.</span>{" "}
                <span className="text-justify">{t.term_text}</span>
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-10 border-t border-black/30 pt-3 text-[10px] text-black/60">
          עמוד 2 מתוך 2 · חוזה {contract.contract_number} ·{" "}
          {company?.name_he ?? "אופק מרקר יזמות בע״מ"}
        </footer>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col border border-black px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
        {label}
      </span>
      <span className="mt-0.5 text-[12px] font-medium text-black">{value}</span>
    </div>
  );
}

function Th({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`border border-black bg-slate-100 px-2 py-1.5 text-center text-[11px] font-bold print:bg-white ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`border border-black px-2 py-1.5 text-center ${className}`}>
      {children}
    </td>
  );
}

function SignatureBox({
  label,
  subLabel,
}: {
  label: string;
  subLabel: string;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="h-20 border-b-2 border-black"
        aria-label={`אזור חתימה — ${label}`}
      />
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-black">{label}</span>
        {subLabel ? (
          <span className="text-[10px] text-black/70">{subLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
