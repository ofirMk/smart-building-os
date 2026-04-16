const { streamText } = require("ai")
const { createOpenAI } = require("@ai-sdk/openai")
const path = require("node:path")
require("dotenv").config({
  path: path.resolve(process.cwd(), "..", ".env.local")
})

// ספק OpenAI תואם Gateway (OpenAI-compatible endpoint)
const gateway = createOpenAI({
  // לדוגמה:
  // baseURL: "https://gateway.ai.cloudflare.com/v1/MY_ACCOUNT/MY_GATEWAY/openai",
  apiKey: process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY
})

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Missing AI_GATEWAY_API_KEY or OPENAI_API_KEY in root .env.local")
  }

  console.log("...מייצר תשובה\n")

  try {
    const result = streamText({
      model: gateway("gpt-4o"),
      prompt: "כתוב פסקה קצרה ומרתקת על העתיד של הבינה המלאכותית."
    })

    process.stdout.write("תשובה: ")
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart)
    }

    const tokenUsage = await result.usage

    console.log("\n\n--- צריכת טוקנים ---")
    console.log(`טוקנים של הבקשה (Prompt):     ${tokenUsage.promptTokens}`)
    console.log(`טוקנים של התשובה (Completion): ${tokenUsage.completionTokens}`)
    console.log(`סך הכל טוקנים:                 ${tokenUsage.totalTokens}`)
  } catch (error) {
    console.error("\nשגיאה במהלך יצירת הטקסט:", error)
    process.exitCode = 1
  }
}

main()
