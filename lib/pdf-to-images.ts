/**
 * `lib/pdf-to-images.ts` — Phase D follow-up
 *
 * המרת PDF ל-PNG בצד הלקוח. נדרש כי gpt-4o vision לא מקבל PDF ישירות,
 * רק תמונות (PNG/JPG/WebP/GIF). שרטוטי חשמל מגיעים בד"כ כ-PDF, אז
 * במקום לחייב את המשתמש "ייצא ידנית", אנחנו מרנדרים בלקוח ומחליפים את
 * ה-File המקורי במערך של File-ים (אחד פר עמוד).
 *
 * אסטרטגיה:
 *   • dynamic import ל-pdfjs-dist כדי שלא ינפח את ה-bundle הראשי.
 *   • עבודה רק בדפדפן (typeof window !== "undefined" guard).
 *   • Worker נטען מ-CDN של jsDelivr (אותה גרסה כמו ה-package).
 *   • render scale=2 → איכות סבירה לזיהוי תוואי + טקסט מקרא בשרטוט,
 *     בלי לנפח את ה-payload מעבר למגבלת 10MB של הצ'אט.
 *   • החזרה כ-File[] עם MIME image/png ושם = "<original>-page-N.png".
 *
 * שימוש:
 *   const pages = await pdfFileToPngFiles(file)
 *   // pages.length = מספר העמודים; כל File הוא PNG מוכן ל-attach.
 */

const PDFJS_VERSION = "4.10.38" // sync ידני עם package.json
const PDFJS_WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

let workerInitialized = false

/**
 * מרנדר עמוד יחיד ל-canvas → Blob (PNG).
 *
 * eslint-disable-next-line @typescript-eslint/no-explicit-any —
 * pdfjs-dist לא חושף type מיוצא ל-PDFPageProxy בנקודה זו.
 */
async function renderPdfPageToPngBlob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  scale: number,
): Promise<Blob> {
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context not available")
  }

  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error("Canvas toBlob returned null"))
      },
      "image/png",
      0.95,
    )
  })

  return blob
}

/**
 * המרת קובץ PDF למערך File-ים של PNG (אחד פר עמוד).
 *
 * @param file       קובץ PDF מקורי (חייב להיות application/pdf)
 * @param maxPages   הגבלה אופציונלית למספר עמודים (default 5; מעבר לזה
 *                   מציגים אזהרה ב-UI לפני המרה — חוסך payload מנופח).
 * @param scale      רזולוציית רינדור (default 2.0 → ~150dpi)
 */
export async function pdfFileToPngFiles(
  file: File,
  options?: { maxPages?: number; scale?: number },
): Promise<File[]> {
  if (typeof window === "undefined") {
    throw new Error("pdfFileToPngFiles can only run in the browser")
  }
  if (file.type !== "application/pdf") {
    throw new Error(`Expected application/pdf, got ${file.type || "unknown"}`)
  }

  const maxPages = options?.maxPages ?? 5
  const scale = options?.scale ?? 2.0

  // dynamic import — pdfjs-dist heavy (≈1.5MB). אסור ב-SSR.
  const pdfjs = await import("pdfjs-dist")

  if (!workerInitialized) {
    // GlobalWorkerOptions היא singleton פר טאב; נכוון פעם אחת.
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC
    workerInitialized = true
  }

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdfDoc = await loadingTask.promise

  const pageCount = Math.min(pdfDoc.numPages, maxPages)
  const baseName = file.name.replace(/\.pdf$/i, "")
  const out: File[] = []

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum)
      try {
        const blob = await renderPdfPageToPngBlob(page, scale)
        const pageFile = new File(
          [blob],
          `${baseName}-page-${pageNum}.png`,
          { type: "image/png", lastModified: Date.now() },
        )
        out.push(pageFile)
      } finally {
        page.cleanup()
      }
    }
  } finally {
    // pdf.js ממליץ לנקות אחרי שימוש כדי לשחרר את ה-worker memory.
    await pdfDoc.cleanup()
    await pdfDoc.destroy()
  }

  return out
}

/**
 * Re-export של מספר העמודים של PDF — לשימוש פוטנציאלי לאזהרת UI לפני המרה.
 * נשאר לא בשימוש כרגע (העמוד מציג toast info על מספר עמודים שיווצרו).
 */
export async function readPdfPageCount(file: File): Promise<number> {
  if (typeof window === "undefined") return 0
  const pdfjs = await import("pdfjs-dist")
  if (!workerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC
    workerInitialized = true
  }
  const arrayBuffer = await file.arrayBuffer()
  const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  try {
    return pdfDoc.numPages
  } finally {
    await pdfDoc.cleanup()
    await pdfDoc.destroy()
  }
}
