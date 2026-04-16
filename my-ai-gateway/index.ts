import dotenv from "dotenv"
import path from "node:path"

import { streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

dotenv.config({
  path: path.resolve(process.cwd(), "..", ".env.local"),
  override: true,
})

const gateway = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
})

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Missing AI_GATEWAY_API_KEY or OPENAI_API_KEY in .env.local")
  }

  console.log("...מייצר תשובה\n")

  try {
    const result = streamText({
      model: gateway("gpt-4o"),
      prompt: "כתוב פסקה קצרה ומרתקת על העתיד של הבינה המלאכותית.",
    })

    process.stdout.write("תשובה: ")
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart)
    }

    const tokenUsage = await result.usage

    console.log("\n\n--- צריכת טוקנים ---")
    console.log(`טוקנים של הבקשה (Prompt):     ${tokenUsage.inputTokens ?? 0}`)
    console.log(`טוקנים של התשובה (Completion): ${tokenUsage.outputTokens ?? 0}`)
    console.log(`סך הכל טוקנים:                 ${tokenUsage.totalTokens ?? 0}`)
  } catch (error) {
    console.error("\nשגיאה במהלך יצירת הטקסט:", error)
    process.exitCode = 1
  }
}

void main()

