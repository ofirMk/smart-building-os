import { GoogleGenerativeAI } from "@google/generative-ai"

import { HR_AGENT_SYSTEM_PROMPT } from "@/lib/agents/hr/prompt"

const GEMINI_MODEL = "gemini-1.5-flash"

export type HRAskAgentOptions = {
  contextType?: string
  extraContext?: string
}

export const geminiHR = {
  async askAgent(
    issue: string,
    contractText: string,
    fileNames: string[],
    options?: HRAskAgentOptions
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error(
        "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות."
      )
    }

    const trimmedIssue = issue.trim() || "נתח את תנאי החוזה העיקריים"
    const body = contractText.trim()
    if (!body) {
      throw new Error("טקסט החוזה ריק")
    }

    const namesLine =
      fileNames.length > 0
        ? fileNames.join(", ")
        : "(לא הועברו שמות קבצים מפורשים)"

    const ctxType = options?.contextType?.trim()
    const extra = options?.extraContext?.trim()
    const formContextBlock = [
      ctxType && `סוג הקשר (ממשק): ${ctxType}`,
      extra && `פרטים מהטופס:\n${extra}`,
    ]
      .filter(Boolean)
      .join("\n\n")

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: HR_AGENT_SYSTEM_PROMPT,
    })

    const prompt = [
      `רשימת הקבצים שהועלו על ידי אופיר: ${namesLine}`,
      "",
      ...(formContextBlock
        ? ["הקשר מהממשק:", formContextBlock, ""]
        : []),
      "טקסט החוזים המלא:",
      "---",
      body,
      "---",
      "",
      "משימה:",
      "1. בצע את ה-Flow הניהולי: זהה נספחים חסרים מול הרשימה שהועלתה.",
      `2. ענה על השאלה: ${trimmedIssue}`,
    ].join("\n")

    try {
      const result = await model.generateContent(prompt)
      const text = result.response.text()?.trim()
      if (!text) {
        throw new Error("תשובה ריקה מ-Gemini")
      }
      return text
    } catch (error) {
      console.error("Gemini HR askAgent error:", error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  },
}
