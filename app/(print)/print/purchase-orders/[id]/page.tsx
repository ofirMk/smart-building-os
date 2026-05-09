"use client";

/**
 * Purchase Order — A4 Print Template
 * ----------------------------------------------------------------------------
 * Pixel-perfect reproduction of the client's hard-copy "הזמנת רכש" form,
 * rendered as RTL HTML and printable via `window.print()` to A4.
 *
 * השלישייה של מחזור הרכש (חוזה → PO → חשבון חלקי) — החלק האחרון.
 *
 * הזרימה:
 *   1. שולף `id` מ-`useParams`.
 *   2. שולף header + lines + supplier + project + company + optional linked
 *      subcontractor contract במקביל.
 *   3. מחשב net / vat / gross אם חסרים (fallback אם total_amount_net == 0).
 *   4. מציג:
 *        • header — מזמין (החברה) | כותרת "הזמנת רכש" | פרטי ספק.
 *        • קוביות פרטי PO (מספר/תאריך הזמנה/תאריך אספקה/תנאי תשלום/חוזה-מקור).
 *        • טבלת שורות עם break-inside avoid.
 *        • בלוק סיכום (Net → Discount → Net — VAT 17% → Gross).
 *        • בלוק הוראות אספקה (shipping_addr + special_instructions).
 *        • חתימות: מזמין | ספק.
 */

import { useParams } from "next/navigation";
import * as React from "react";
import { Loader2, Printer } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatError } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type POStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "CLOSED"
  | "CANCELLED";

type ShippingAddress = {
  name?: string;
  contact?: string;
  phone?: string;
  fax?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

type POHeader = {
  id: string;
  company_id: string;
  project_id: string;
  supplier_id: string;
  po_number: string;
  title: string;
  status: POStatus;
  currency: string | null;
  total_amount: number;
  total_amount_net: number;
  vat_amount: number;
  total_amount_gross: number;
  issued_at: string | null;
  order_date: string | null;
  notes: string | null;
  special_instructions: string | null;
  shipping_addr_he: ShippingAddress | null;
  payment_terms_code: string | null;
  source_subcontractor_contract_id: string | null;
  signed_by_buyer_at: string | null;
  signed_by_supplier_at: string | null;
};

type POLine = {
  line_number: number | null;
  description: string;
  supplier_sku: string | null;
  supplier_sku_description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  uom: string | null;
  discount_pct: number | null;
  supply_date: string | null;
  line_notes: string | null;
};

type SupplierRow = {
  name: string;
  tax_vat_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
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

type ContractMiniRow = {
  contract_number: string;
};

const STATUS_HE: Record<POStatus, string> = {
  DRAFT: "טיוטא",
  PENDING_APPROVAL: "ממתינה לאישור",
  APPROVED: "מאושרת",
  SENT: "נשלחה לספק",
  CLOSED: "סגורה",
  CANCELLED: "בוטלה",
};

const VAT_PCT_DEFAULT = 17;

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

function fmtCurrency(v: number, currency: string | null) {
  if (!currency || currency === "ILS") return ils.format(v);
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(v);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PurchaseOrderPrintPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [po, setPo] = React.useState<POHeader | null>(null);
  const [lines, setLines] = React.useState<POLine[]>([]);
  const [supplier, setSupplier] = React.useState<SupplierRow | null>(null);
  const [project, setProject] = React.useState<ProjectRow | null>(null);
  const [company, setCompany] = React.useState<CompanyRow | null>(null);
  const [sourceContract, setSourceContract] =
    React.useState<ContractMiniRow | null>(null);

  React.useEffect(() => {
    if (!id) {
      setError("מזהה הזמנה חסר");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const supabase = createSupabaseBrowserClient();

        const poRes = await supabase
          .from("erp_purchase_orders")
          .select(
            "id, company_id, project_id, supplier_id, po_number, title, status, currency, total_amount, total_amount_net, vat_amount, total_amount_gross, issued_at, order_date, notes, special_instructions, shipping_addr_he, payment_terms_code, source_subcontractor_contract_id, signed_by_buyer_at, signed_by_supplier_at"
          )
          .eq("id", id)
          .maybeSingle();

        if (poRes.error) throw poRes.error;
        if (!poRes.data) {
          if (!cancelled) setError("ההזמנה לא נמצאה");
          return;
        }

        const header = poRes.data as POHeader;
        if (!cancelled) setPo(header);

        const [linesRes, suppRes, projRes, compRes, contractRes] =
          await Promise.all([
            supabase
              .from("erp_purchase_order_lines")
              .select(
                "line_number, description, supplier_sku, supplier_sku_description, quantity, unit_price, total_price, uom, discount_pct, supply_date, line_notes"
              )
              .eq("purchase_order_id", header.id)
              .order("line_number", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: true }),
            supabase
              .from("erp_md_suppliers")
              .select("name, tax_vat_id, address, phone, email")
              .eq("id", header.supplier_id)
              .maybeSingle(),
            supabase
              .from("erp_proj_projects")
              .select("name, project_number")
              .eq("id", header.project_id)
              .maybeSingle(),
            supabase
              .from("erp_companies")
              .select("id, name_he, name_en")
              .eq("id", header.company_id)
              .maybeSingle(),
            header.source_subcontractor_contract_id
              ? supabase
                  .from("erp_subcontractor_contracts")
                  .select("contract_number")
                  .eq("id", header.source_subcontractor_contract_id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null } as const),
          ]);

        if (linesRes.error) throw linesRes.error;
        if (suppRes.error) throw suppRes.error;
        if (projRes.error) throw projRes.error;
        if (compRes.error) throw compRes.error;
        if (contractRes.error) throw contractRes.error;

        if (!cancelled) {
          setLines((linesRes.data ?? []) as POLine[]);
          setSupplier((suppRes.data ?? null) as SupplierRow | null);
          setProject((projRes.data ?? null) as ProjectRow | null);
          setCompany((compRes.data ?? null) as CompanyRow | null);
          setSourceContract(
            (contractRes.data ?? null) as ContractMiniRow | null
          );
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
        <p className="text-sm">טוען הזמנת רכש…</p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-slate-700">
        <p className="text-base font-semibold text-red-700">
          {error ?? "שגיאה בטעינת ההזמנה"}
        </p>
      </div>
    );
  }

  // ---- Computations (fallback to per-line totals if header fields are zero) ----
  const linesNet = lines.reduce(
    (acc, l) => acc + (Number(l.total_price) || 0),
    0
  );
  const net =
    Number(po.total_amount_net) > 0 ? Number(po.total_amount_net) : linesNet;
  const vat =
    Number(po.vat_amount) > 0
      ? Number(po.vat_amount)
      : +(net * (VAT_PCT_DEFAULT / 100)).toFixed(2);
  const gross =
    Number(po.total_amount_gross) > 0
      ? Number(po.total_amount_gross)
      : +(net + vat).toFixed(2);
  const currency = po.currency ?? "ILS";

  const orderDate = po.order_date
    ? dateFmt.format(new Date(po.order_date))
    : po.issued_at
      ? dateFmt.format(new Date(po.issued_at))
      : dateFmt.format(new Date());

  const earliestSupply = lines
    .map((l) => l.supply_date)
    .filter((d): d is string => !!d)
    .sort()[0];
  const supplyDateLabel = earliestSupply
    ? dateFmt.format(new Date(earliestSupply))
    : "על-פי תיאום";

  const printDate = dateFmt.format(new Date());
  const ship = po.shipping_addr_he ?? null;

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
        aria-label="הזמנת רכש"
      >
        {/* ============================ Header ============================ */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-6">
            {/* המזמין (החברה) */}
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-bold tracking-wider text-black"
              >
                לוגו
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                  המזמין
                </p>
                <p className="text-[14px] font-bold leading-tight">
                  {company?.name_he ?? "אופק מרקר יזמות בע״מ"}
                </p>
                <p className="text-[11px]">
                  ח.פ <span className="font-mono">514029384</span>
                </p>
                <p className="text-[11px]">רחוב הרצל 100, תל-אביב</p>
                <p className="text-[11px]">טל׳ 03-1234567</p>
              </div>
            </div>

            {/* כותרת מסמך */}
            <div className="text-end">
              <h1 className="border-2 border-black px-5 py-2 text-[20px] font-black tracking-tight">
                הזמנת רכש
              </h1>
              <p className="mt-1 text-[11px] text-black">
                מסמך מקור · A4 · תאריך הדפסה{" "}
                <span className="font-mono">{printDate}</span>
              </p>
            </div>
          </div>

          {/* פרטי הספק */}
          <div className="mt-3 grid grid-cols-3 gap-0 border-2 border-black">
            <DetailCell
              label="לכבוד הספק"
              value={supplier?.name ?? "—"}
              span={2}
            />
            <DetailCell
              label="ח.פ ספק"
              value={
                <span className="font-mono">
                  {supplier?.tax_vat_id ?? "—"}
                </span>
              }
            />

            <DetailCell
              label="כתובת ספק"
              value={supplier?.address ?? "—"}
              span={2}
            />
            <DetailCell
              label="טל׳ ספק"
              value={
                <span className="font-mono">{supplier?.phone ?? "—"}</span>
              }
            />
          </div>

          {/* קוביית פרטי הזמנה */}
          <div className="mt-2 grid grid-cols-4 gap-0 border-2 border-black">
            <DetailCell
              label="מספר הזמנה"
              value={
                <span className="font-mono text-[14px] font-bold">
                  {po.po_number}
                </span>
              }
            />
            <DetailCell
              label="תאריך הזמנה"
              value={<span className="font-mono">{orderDate}</span>}
            />
            <DetailCell
              label="תאריך אספקה"
              value={<span className="font-mono">{supplyDateLabel}</span>}
            />
            <DetailCell
              label="סטטוס"
              value={STATUS_HE[po.status] ?? po.status}
            />

            <DetailCell
              label="פרויקט"
              value={project?.name ?? "—"}
              span={2}
            />
            <DetailCell
              label="תנאי תשלום"
              value={po.payment_terms_code ?? "שוטף 30"}
            />
            <DetailCell
              label="חוזה מקור"
              value={
                sourceContract ? (
                  <span className="font-mono">
                    {sourceContract.contract_number}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>

          {/* שורת כותרת */}
          <p className="mt-3 text-[12px] font-semibold">
            נושא ההזמנה: <span className="font-normal">{po.title}</span>
          </p>
        </header>

        {/* ============================ טבלת שורות ============================ */}
        <section aria-label="שורות ההזמנה" className="mt-4">
          <table className="w-full border-collapse border-2 border-black text-[11px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <Th className="w-[5%]">#</Th>
                <Th className="w-[14%]">מק״ט ספק</Th>
                <Th className="w-[34%] text-start">תאור</Th>
                <Th className="w-[6%]">יח׳</Th>
                <Th className="w-[8%]">כמות</Th>
                <Th className="w-[11%]">מחיר ליחידה</Th>
                <Th className="w-[8%]">הנחה</Th>
                <Th className="w-[14%]">סה״כ שורה</Th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-black px-3 py-3 text-center text-black/70"
                  >
                    לא הוזנו שורות להזמנה
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const no = line.line_number ?? idx + 1;
                  const discount = Number(line.discount_pct) || 0;
                  return (
                    <tr key={`${no}-${idx}`} className="break-inside-avoid">
                      <Td className="font-mono">{no}</Td>
                      <Td className="font-mono">
                        {line.supplier_sku ?? "—"}
                      </Td>
                      <Td className="text-start">
                        <div className="font-medium">{line.description}</div>
                        {line.supplier_sku_description ? (
                          <div className="text-[10px] text-black/60">
                            {line.supplier_sku_description}
                          </div>
                        ) : null}
                        {line.line_notes ? (
                          <div className="text-[10px] italic text-black/70">
                            {line.line_notes}
                          </div>
                        ) : null}
                      </Td>
                      <Td>{line.uom ?? "—"}</Td>
                      <Td className="font-mono tabular-nums">
                        {num3.format(Number(line.quantity) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {fmtCurrency(Number(line.unit_price) || 0, currency)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {discount > 0 ? `${discount.toFixed(1)}%` : "—"}
                      </Td>
                      <Td className="font-mono tabular-nums font-semibold">
                        {fmtCurrency(Number(line.total_price) || 0, currency)}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* סיכום */}
            <tfoot>
              <tr className="border-t-2 border-black">
                <Th colSpan={7} className="text-end">
                  סה״כ לפני מע״מ
                </Th>
                <Td className="font-mono tabular-nums font-bold">
                  {fmtCurrency(net, currency)}
                </Td>
              </tr>
              <tr>
                <Th colSpan={7} className="text-end">
                  מע״מ ({VAT_PCT_DEFAULT}%)
                </Th>
                <Td className="font-mono tabular-nums">
                  {fmtCurrency(vat, currency)}
                </Td>
              </tr>
              <tr className="bg-slate-200 print:bg-white">
                <Th colSpan={7} className="text-end text-[13px]">
                  סה״כ לתשלום (כולל מע״מ)
                </Th>
                <Td className="font-mono tabular-nums text-[13px] font-black">
                  {fmtCurrency(gross, currency)}
                </Td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ============================ הוראות אספקה ============================ */}
        <section
          aria-label="הוראות אספקה"
          className="mt-5 grid grid-cols-2 gap-4 break-inside-avoid"
        >
          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-1.5 text-[11px] font-black print:bg-white">
              כתובת משלוח / אספקה
            </div>
            <div className="space-y-0.5 px-3 py-2 text-[11px]">
              {ship ? (
                <>
                  {ship.name ? (
                    <p className="font-semibold">{ship.name}</p>
                  ) : null}
                  {ship.contact ? <p>{ship.contact}</p> : null}
                  {ship.line1 ? <p>{ship.line1}</p> : null}
                  {ship.line2 ? <p>{ship.line2}</p> : null}
                  {ship.city || ship.zip ? (
                    <p>
                      {ship.city ?? ""} {ship.zip ?? ""}
                    </p>
                  ) : null}
                  {ship.phone ? (
                    <p>
                      טל׳ <span className="font-mono">{ship.phone}</span>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-black/60">על-פי תיאום עם מחלקת הרכש</p>
              )}
            </div>
          </div>

          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-1.5 text-[11px] font-black print:bg-white">
              הוראות מיוחדות
            </div>
            <div className="px-3 py-2 text-[11px] leading-[1.55]">
              {po.special_instructions ? (
                <p className="whitespace-pre-wrap">
                  {po.special_instructions}
                </p>
              ) : (
                <p className="text-black/60">אין הוראות מיוחדות</p>
              )}
            </div>
          </div>
        </section>

        {/* ============================ תנאים כלליים ============================ */}
        {po.notes ? (
          <section className="mt-4 border-2 border-black break-inside-avoid">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-1.5 text-[11px] font-black print:bg-white">
              הערות ותנאים
            </div>
            <div className="px-3 py-2 text-[11px] leading-[1.55]">
              <p className="whitespace-pre-wrap">{po.notes}</p>
            </div>
          </section>
        ) : null}

        {/* ============================ חתימות ============================ */}
        <section
          aria-label="חתימות"
          className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid print:mt-10"
        >
          <SignatureBox
            label="חתימת המזמין"
            subLabel={company?.name_he ?? ""}
          />
          <SignatureBox
            label="אישור קבלת ההזמנה — הספק"
            subLabel={supplier?.name ?? ""}
          />
        </section>

        <footer className="mt-6 border-t border-black/30 pt-2 text-center text-[10px] text-black/60">
          הזמנה זו תקפה כנגד קבלת סחורה חתומה וחשבונית תואמת (3-Way Match).
          כפוף לתנאי המסגרת שבחוזה בין הצדדים.
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
  span = 1,
}: {
  label: string;
  value: React.ReactNode;
  span?: 1 | 2 | 3 | 4;
}) {
  const spanClass =
    span === 2
      ? "col-span-2"
      : span === 3
        ? "col-span-3"
        : span === 4
          ? "col-span-4"
          : "";
  return (
    <div className={`flex flex-col border border-black px-3 py-2 ${spanClass}`}>
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
