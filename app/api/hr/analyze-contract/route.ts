import { PDFParse } from "pdf-parse"
import { NextRequest, NextResponse } from "next/server"

import type { AppUserRole } from "@/lib/auth/user-role"
import { geminiHR } from "@/lib/agents/hr/gemini-hr-service"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const maxDuration = 120

export const runtime = "nodejs"

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const textResult = await parser.getText()
    return textResult.text
  } finally {
    await parser.destroy()
  }
}

function isPdfFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  const nameLower = file.name.toLowerCase()
  return mime === "application/pdf" || nameLower.endsWith(".pdf")
}

function collectUploadFiles(formData: FormData): File[] {
  const fromFiles = formData
    .getAll("files")
    .filter((x): x is File => x instanceof File)
  if (fromFiles.length > 0) return fromFiles
  const one = formData.get("file")
  return one instanceof File ? [one] : []
}

export async function POST(req: NextRequest) {
  try {
    const auth = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await auth
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    const role = (profile as { role?: AppUserRole } | null)?.role ?? "tenant"
    const allowed =
      role === "admin" || isPartnerDashboardSuperAdmin(user.email ?? null)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await req.formData()
    const questionRaw = formData.get("question")
    const question =
      typeof questionRaw === "string" && questionRaw.trim()
        ? questionRaw.trim()
        : "בצע ניתוח מקיף של כל מסמכי החוזה"

    const contextTypeRaw = formData.get("contextType")
    const contextType =
      typeof contextTypeRaw === "string" ? contextTypeRaw.trim() : ""
    const extraContextRaw = formData.get("extraContext")
    const extraContext =
      typeof extraContextRaw === "string" ? extraContextRaw.trim() : ""

    const files = collectUploadFiles(formData)
    if (files.length === 0) {
      return NextResponse.json(
        { error: "לא נמצאו קבצים בבקשה" },
        { status: 400 }
      )
    }

    for (const file of files) {
      if (!isPdfFile(file)) {
        return NextResponse.json(
          { error: `נדרש קובץ PDF — "${file.name}" אינו PDF` },
          { status: 400 }
        )
      }
    }

    let combinedText = ""
    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const text = await extractPdfText(buffer)
      combinedText += `\n\n--- תחילת קובץ: ${file.name} ---\n`
      combinedText += text
      combinedText += `\n--- סיום קובץ: ${file.name} ---\n`
    }

    if (combinedText.trim().length === 0) {
      return NextResponse.json(
        { error: "לא הצלחתי לחלץ טקסט מהקבצים" },
        { status: 422 }
      )
    }

    const fileNames = files.map(f => f.name)
    const analysis = await geminiHR.askAgent(question, combinedText, fileNames, {
      ...(contextType ? { contextType } : {}),
      ...(extraContext ? { extraContext } : {}),
    })

    return NextResponse.json({
      success: true,
      analysis,
      filesCount: files.length,
      fileNames,
    })
  } catch (error) {
    console.error("HR Agent Multi-File Error:", error)
    return NextResponse.json(
      {
        error: "שגיאה בעיבוד מסמכי החוזה",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
