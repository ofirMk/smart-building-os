"use client";

/**
 * Subcontractor Partial Bill — A4 Print Template (Cumulative + Waterfall)
 * ----------------------------------------------------------------------------
 * Pixel-perfect reproduction of the client's hard-copy "חשבון חלקי קבלן משנה",
 * rendered as RTL HTML and printable via `window.print()` to A4.
 *
 * הזרימה:
 *   1. שולף `id` מ-`useParams`.
 *   2. שולף בקריאה ראשונה את ה-bill, ואז בקריאות מקבילות:
 *      bill-lines + boq lines של החוזה + contract + supplier + project + company.
 *   3. מציג עמוד אחד הכולל:
 *        • header — לוגו, פרטי המבצע (subcontractor), פרטי המזמין (company),
 *          פרויקט, מספר חוזה, "חשבון חלקי למזמין מס׳ X לחודש Y".
 *        • טבלת שורות מצטברות:
 *          סעיף · תאור · כמות חוזה · מחיר ליחידה · כמות מדווחת מצטברת ·
 *          % מול חוזה · סה"כ מצטבר עכשיו.
 *        • בלוק סיכום מפל מים פיננסי (Waterfall) — מיושר לימין למספרים.
 *   4. כפתור צף 🖨️ "הדפס / הפק PDF" שמוסתר ב-`@media print`.
 */

import { useParams } from "next/navigation";
import * as React from "react";
import { Loader2, Printer } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatError } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirror DB schema, snake_case as returned by PostgREST)
// ---------------------------------------------------------------------------

type BillStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";

type BillRow = {
  id: string;
  company_id: string;
  project_id: string;
  contract_id: string;
  bill_number: number;
  execution_month: string;
  bill_date: string;
  cumulative_executed_amount: number;
  retention_deduction_amount: number;
  insurance_deduction_amount: number;
  cumulative_net_amount: number;
  previous_billed_amount: number;
  amount_to_pay: number;
  vat_pct: number;
  vat_amount: number;
  grand_total_amount: number;
  status: BillStatus;
  notes: string | null;
};

type BillLineRow = {
  boq_line_id: string;
  cumulative_qty: number;
  cumulative_pct: number;
  cumulative_amount: number;
};

type BoqLineRow = {
  id: string;
  line_no: number;
  section_code: string;
  description: string;
  uom: string;
  quantity: number;
  unit_price: number;
  total_line_price: number;
};

type ContractRow = {
  id: string;
  contract_number: string;
  total_amount: number;
  insurance_pct: number;
  retention_pct: number;
  subcontractor_id: string;
  project_id: string;
};

type SupplierRow = {
  name: string;
  tax_vat_id: string | null;
  address: string | null;
  phone: string | null;
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

const STATUS_HE: Record<BillStatus, string> = {
  DRAFT: "טיוטא",
  SUBMITTED: "הוגש לאישור",
  APPROVED: "אושר לתשלום",
  PAID: "שולם",
  REJECTED: "נדחה",
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

const pct = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" });

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SubcontractorPartialBillPrintPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bill, setBill] = React.useState<BillRow | null>(null);
  const [billLines, setBillLines] = React.useState<BillLineRow[]>([]);
  const [boq, setBoq] = React.useState<Map<string, BoqLineRow>>(new Map());
  const [contract, setContract] = React.useState<ContractRow | null>(null);
  const [supplier, setSupplier] = React.useState<SupplierRow | null>(null);
  const [project, setProject] = React.useState<ProjectRow | null>(null);
  const [company, setCompany] = React.useState<CompanyRow | null>(null);

  React.useEffect(() => {
    if (!id) {
      setError("מזהה חשבון חסר");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const supabase = createSupabaseBrowserClient();

        const bRes = await supabase
          .from("erp_subcontractor_bills")
          .select(
            "id, company_id, project_id, contract_id, bill_number, execution_month, bill_date, cumulative_executed_amount, retention_deduction_amount, insurance_deduction_amount, cumulative_net_amount, previous_billed_amount, amount_to_pay, vat_pct, vat_amount, grand_total_amount, status, notes"
          )
          .eq("id", id)
          .maybeSingle();

        if (bRes.error) throw bRes.error;
        if (!bRes.data) {
          if (!cancelled) setError("החשבון לא נמצא");
          return;
        }

        const b = bRes.data as BillRow;
        if (!cancelled) setBill(b);

        const cRes = await supabase
          .from("erp_subcontractor_contracts")
          .select(
            "id, contract_number, total_amount, insurance_pct, retention_pct, subcontractor_id, project_id"
          )
          .eq("id", b.contract_id)
          .maybeSingle();

        if (cRes.error) throw cRes.error;
        const c = (cRes.data ?? null) as ContractRow | null;
        if (!cancelled) setContract(c);

        const [linesRes, boqRes, suppRes, projRes, compRes] = await Promise.all([
          supabase
            .from("erp_subcontractor_bill_lines")
            .select(
              "boq_line_id, cumulative_qty, cumulative_pct, cumulative_amount"
            )
            .eq("bill_id", b.id),
          supabase
            .from("erp_contract_boq_lines")
            .select(
              "id, line_no, section_code, description, uom, quantity, unit_price, total_line_price"
            )
            .eq("contract_id", b.contract_id)
            .order("line_no", { ascending: true }),
          c
            ? supabase
                .from("erp_md_suppliers")
                .select("name, tax_vat_id, address, phone")
                .eq("id", c.subcontractor_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          supabase
            .from("erp_proj_projects")
            .select("name, project_number")
            .eq("id", b.project_id)
            .maybeSingle(),
          supabase
            .from("erp_companies")
            .select("id, name_he, name_en")
            .eq("id", b.company_id)
            .maybeSingle(),
        ]);

        if (linesRes.error) throw linesRes.error;
        if (boqRes.error) throw boqRes.error;
        if (suppRes.error) throw suppRes.error;
        if (projRes.error) throw projRes.error;
        if (compRes.error) throw compRes.error;

        if (!cancelled) {
          setBillLines((linesRes.data ?? []) as BillLineRow[]);
          const m = new Map<string, BoqLineRow>();
          for (const r of (boqRes.data ?? []) as BoqLineRow[]) m.set(r.id, r);
          setBoq(m);
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
        <p className="text-sm">טוען חשבון…</p>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-slate-700">
        <p className="text-base font-semibold text-red-700">
          {error ?? "שגיאה בטעינת החשבון"}
        </p>
      </div>
    );
  }

  // ---- Sorted joined rows ----
  const rows = billLines
    .map((bl) => ({ bl, boq: boq.get(bl.boq_line_id) ?? null }))
    .filter((r): r is { bl: BillLineRow; boq: BoqLineRow } => r.boq != null)
    .sort((a, b) => a.boq.line_no - b.boq.line_no);

  const billDate = bill.bill_date
    ? dateFmt.format(new Date(bill.bill_date))
    : dateFmt.format(new Date());
  const printDate = dateFmt.format(new Date());

  // For waterfall percentage labels (e.g. "פחות עכבון (5%)")
  const retentionPctLabel =
    contract && contract.retention_pct
      ? pct.format(Number(contract.retention_pct))
      : "—";
  const insurancePctLabel =
    contract && contract.insurance_pct
      ? pct.format(Number(contract.insurance_pct))
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

      <article
        dir="rtl"
        lang="he"
        className="text-[12px] leading-[1.5] text-black"
        aria-label="חשבון חלקי קבלן משנה"
      >
        {/* ============================ Header ============================ */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-6">
            {/* פרטי המבצע (subcontractor / "לייטמן" במסמך המקור) */}
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-bold tracking-wider text-black"
              >
                לוגו
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                  המבצע (קבלן המשנה)
                </p>
                <p className="text-[14px] font-bold leading-tight">
                  {supplier?.name ?? "—"}
                </p>
                {supplier?.tax_vat_id ? (
                  <p className="text-[11px]">
                    ח.פ <span className="font-mono">{supplier.tax_vat_id}</span>
                  </p>
                ) : null}
                {supplier?.address ? (
                  <p className="text-[11px]">{supplier.address}</p>
                ) : null}
                {supplier?.phone ? (
                  <p className="text-[11px]">טל׳ {supplier.phone}</p>
                ) : null}
              </div>
            </div>

            {/* כותרת המסמך */}
            <div className="text-end">
              <h1 className="border-2 border-black px-5 py-2 text-[18px] font-black tracking-tight">
                חשבון חלקי קבלן משנה
              </h1>
              <p className="mt-1 text-[11px] text-black">
                מסמך מקור · A4 · תאריך הדפסה{" "}
                <span className="font-mono">{printDate}</span>
              </p>
            </div>
          </div>

          {/* בלוק סיווג חשבון */}
          <div className="mt-3 grid grid-cols-4 gap-0 border-2 border-black">
            <DetailCell
              label="חשבון חלקי למזמין מס׳"
              value={
                <span className="font-mono text-[14px] font-bold">
                  {bill.bill_number}
                </span>
              }
            />
            <DetailCell
              label="לחודש"
              value={
                <span className="font-mono text-[14px] font-bold">
                  {bill.execution_month}
                </span>
              }
            />
            <DetailCell
              label="תאריך חשבון"
              value={<span className="font-mono">{billDate}</span>}
            />
            <DetailCell
              label="סטטוס"
              value={STATUS_HE[bill.status] ?? bill.status}
            />
          </div>

          {/* פרטי הלקוח (המזמין / חברה ראשית) + פרויקט + חוזה */}
          <div className="mt-2 grid grid-cols-3 gap-0 border-2 border-black">
            <DetailCell
              label="לכבוד המזמין"
              value={company?.name_he ?? "אופק מרקר יזמות בע״מ"}
            />
            <DetailCell label="פרויקט" value={project?.name ?? "—"} />
            <DetailCell
              label="מספר חוזה"
              value={
                <span className="font-mono">
                  {contract?.contract_number ?? "—"}
                </span>
              }
            />
          </div>
        </header>

        {/* ============================ טבלת שורות ============================ */}
        <section aria-label="שורות חשבון מצטברות" className="mt-4">
          <table className="w-full border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <Th className="w-[14%]">סעיף</Th>
                <Th className="w-[30%] text-start">תאור</Th>
                <Th className="w-[8%]">כמות חוזה</Th>
                <Th className="w-[10%]">מחיר ליחידה</Th>
                <Th className="w-[10%]">כמות מדווחת (מצטבר)</Th>
                <Th className="w-[8%]">% מול חוזה</Th>
                <Th className="w-[12%]">סה״כ מצטבר עכשיו</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border border-black px-3 py-3 text-center text-black/70"
                  >
                    לא הוזנו שורות לחשבון
                  </td>
                </tr>
              ) : (
                rows.map(({ bl, boq: line }) => (
                  <tr key={line.id} className="break-inside-avoid">
                    <Td className="font-mono">{line.section_code}</Td>
                    <Td className="text-start">{line.description}</Td>
                    <Td className="font-mono tabular-nums">
                      {num3.format(Number(line.quantity) || 0)} {line.uom}
                    </Td>
                    <Td className="font-mono tabular-nums">
                      {ils.format(Number(line.unit_price) || 0)}
                    </Td>
                    <Td className="font-mono tabular-nums">
                      {num3.format(Number(bl.cumulative_qty) || 0)}
                    </Td>
                    <Td className="font-mono tabular-nums">
                      {pct.format(Number(bl.cumulative_pct) || 0)}%
                    </Td>
                    <Td className="font-mono tabular-nums font-semibold">
                      {ils.format(Number(bl.cumulative_amount) || 0)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-slate-100 print:bg-white">
                <Th colSpan={6} className="text-end">
                  סך עבודות שבוצעו (מצטבר מתחילת הפרויקט)
                </Th>
                <Td className="font-mono tabular-nums font-black">
                  {ils.format(Number(bill.cumulative_executed_amount) || 0)}
                </Td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ====================== בלוק מפל מים פיננסי ====================== */}
        <section
          aria-label="סיכום פיננסי — מפל מים"
          className="mt-4 break-inside-avoid"
        >
          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 text-[12px] font-black print:bg-white">
              סיכום פיננסי לחשבון זה (מצטבר)
            </div>

            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <WaterfallRow
                  label="עבודות לפי חוזה (מצטבר)"
                  value={Number(bill.cumulative_executed_amount) || 0}
                  bold
                />
                <WaterfallRow
                  label={`פחות עכבון (${retentionPctLabel}%)`}
                  value={-(Number(bill.retention_deduction_amount) || 0)}
                  negative
                />
                <WaterfallRow
                  label={`פחות ביטוח (${insurancePctLabel}%)`}
                  value={-(Number(bill.insurance_deduction_amount) || 0)}
                  negative
                />
                <WaterfallRow
                  label="סה״כ חשבון זה (מצטבר נטו)"
                  value={Number(bill.cumulative_net_amount) || 0}
                  emphasized
                />
                <WaterfallRow
                  label="מצטבר מוגש בחשבון קודם"
                  value={-(Number(bill.previous_billed_amount) || 0)}
                  negative
                  highlight
                />
                <WaterfallRow
                  label="סה״כ לתשלום (לפני מע״מ)"
                  value={Number(bill.amount_to_pay) || 0}
                  emphasized
                />
                <WaterfallRow
                  label={`מע״מ (${pct.format(Number(bill.vat_pct) || 0)}%)`}
                  value={Number(bill.vat_amount) || 0}
                />
                <WaterfallRow
                  label="סה״כ לתשלום כולל מע״מ"
                  value={Number(bill.grand_total_amount) || 0}
                  grand
                />
              </tbody>
            </table>
          </div>

          {/* אזור חתימות */}
          <div className="mt-6 grid grid-cols-3 gap-6 print:mt-8">
            <SignatureBox
              label="הקבלן"
              subLabel={supplier?.name ?? ""}
            />
            <SignatureBox label="מפקח / מנהל הפרויקט" subLabel="" />
            <SignatureBox
              label="מטעם המזמין"
              subLabel={company?.name_he ?? ""}
            />
          </div>

          {bill.notes ? (
            <p className="mt-4 border-t border-black/30 pt-2 text-[10px] text-black/70">
              <span className="font-bold">הערות:</span> {bill.notes}
            </p>
          ) : null}
        </section>

        <footer className="mt-6 border-t border-black/30 pt-2 text-center text-[10px] text-black/60">
          חשבון חלקי מצטבר · נחתם ביום {billDate} · המסמך הופק על-ידי מערכת
          מרקר אופק
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

function WaterfallRow({
  label,
  value,
  bold = false,
  emphasized = false,
  negative = false,
  highlight = false,
  grand = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
  emphasized?: boolean;
  negative?: boolean;
  highlight?: boolean;
  grand?: boolean;
}) {
  // emphasized rows get a top border (sub-totals); grand row has a thick top + double bottom feel
  const rowClass = grand
    ? "border-t-[3px] border-black bg-slate-200 print:bg-white"
    : emphasized
      ? "border-t-2 border-black bg-slate-50 print:bg-white"
      : highlight
        ? "bg-amber-50/60 print:bg-white"
        : "";

  const labelClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[12px] font-medium";

  const valueClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[12px]";

  return (
    <tr className={`border-b border-black/30 ${rowClass}`}>
      <th
        scope="row"
        className={`px-3 py-1.5 text-end ${labelClass}`}
      >
        {label}
      </th>
      <td
        className={`w-[35%] px-3 py-1.5 text-end font-mono tabular-nums ${valueClass} ${
          negative ? "text-red-700 print:text-black" : ""
        }`}
      >
        {ils.format(value)}
      </td>
    </tr>
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
        className="h-16 border-b-2 border-black"
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
