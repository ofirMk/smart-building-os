"use client"

/**
 * Phase C → D — AI Copilot for Autonomous Procurement
 *
 * עמוד זה מכיל שני tabs:
 *   1) **מהנדס רכש AI** (ברירת מחדל) — צ'אט בעברית עם LLM שמפעיל את ה-RPC
 *      הדטרמיניסטי `erp_generate_draft_po_from_bom` כ-tool.
 *      Phase D מוסיף העלאת תמונות (שרטוטי חשמל) + "כרטיס הכנת
 *      הזמנה" אינטראקטיבי לאישור מדידה ויזואלית לפני יצירת PO.
 *   2) **טופס ידני** (Phase B baseline) — הטופס הדטרמיניסטי לבדיקה ישירה
 *      של המנוע, ללא LLM.
 *
 * שני המסלולים קוראים לאותו RPC. ה-LLM הוא "שפתיים ואוזניים", המתמטיקה
 * רצה ב-DB. אין דרך ל-LLM להמציא מחיר/כמות/יחס. גם בזרימת ראייה
 * מדידה ויזואלית עוברת דרך אישור משתמש מפורש בכרטיס.
 *
 * Mic button — Web Speech API (he-IL). זמין רק בדפדפנים מבוססי Chromium/Edge.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Cog,
  ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Paperclip,
  Ruler,
  SendHorizontal,
  ShoppingCart,
  Sparkles,
  User2,
  Wrench,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { getSpeechRecognitionConstructor } from "@/lib/speech-recognition"
import { cn } from "@/lib/utils"

// ============================================================================
// Shared types — match GET /api/procurement/autonomous-po DTOs
// ============================================================================

type ProjectOption = {
  id: string
  projectNumber: string
  name: string
  status: string
}
type AssemblyOption = {
  id: string
  code: string
  name: string
  category: string
  unitOfMeasure: string
}
type LocationOption = {
  id: string
  projectId: string
  code: string
  name: string
  levelType: string
  lengthM: number | null
  areaSqm: number | null
}
type OptionsDto = {
  projects: ProjectOption[]
  assemblies: AssemblyOption[]
  locations: LocationOption[]
}

const NONE_VALUE = "__none__"
const SPEECH_LANG = "he-IL"
/** מגבלת גודל קובץ למניעת העמסת API מיותרת (זהה ל-AiAssistant.tsx). */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
const ATTACHMENT_SIZE_ERROR_HE =
  "הקובץ גדול מדי (מעל 4MB). לחץ אותו או השתמש בצילום מסך באיכות נמוכה יותר."

function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer()
  for (const file of files) dt.items.add(file)
  return dt.files
}

// ============================================================================
// Phase D — vision-po-draft tool output type (מוחזר מה-API route)
// ============================================================================

type VisionPoDraftToolOutput = {
  ok: true
  status: "pending_user_confirmation"
  assembly: { id: string; code: string; name: string; unitOfMeasure: string }
  project: { id: string; projectNumber: string; name: string }
  location: { id: string; code: string; name: string } | null
  supplier: { id: string; supplierNumber: string; name: string }
  estimatedQuantity: number
  marginOfErrorPct: number
  reasoning: string
  message: string
}

// ============================================================================
// Page (root)
// ============================================================================

export default function AutonomousPoNewPage() {
  const [activeCompanyId, setActiveCompanyId] = React.useState<string | null>(null)
  const [options, setOptions] = React.useState<OptionsDto | null>(null)
  const [loadingOptions, setLoadingOptions] = React.useState(true)

  React.useEffect(() => {
    setActiveCompanyId(readActiveCompanyIdFromCookie())
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    masterDataFetch<OptionsDto>("/api/procurement/autonomous-po")
      .then((data) => {
        if (cancelled) return
        setOptions(data)
      })
      .catch((err: Error) => {
        toast.error(`טעינת אפשרויות נכשלה: ${err.message}`)
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 p-3 text-violet-600 dark:text-violet-400">
          <Bot className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            מהנדס רכש AI
            <Badge variant="secondary" className="text-xs">
              Phase C
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            צ'אט חופשי בעברית.{" "}
            <span className="font-medium">ה-LLM הוא רק מתורגמן</span> — כל
            החישובים, חוקי התקן והמחירים רצים ב-RPC הדטרמיניסטי שבנינו ב-Phase B.
          </p>
        </div>
      </div>

      {activeCompanyId ? (
        <p className="mb-4 text-xs text-muted-foreground">
          חברה פעילה: <code>{activeCompanyId}</code>
        </p>
      ) : null}

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Copilot AI
          </TabsTrigger>
          <TabsTrigger value="form" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> טופס ידני
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <AiCopilotPane />
        </TabsContent>

        <TabsContent value="form" className="mt-4">
          <ManualFormPane options={options} loading={loadingOptions} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// AI Copilot tab
// ============================================================================

const COPILOT_INTRO_MESSAGE: UIMessage = {
  id: "copilot-intro",
  role: "assistant",
  parts: [
    {
      type: "text",
      text:
        "שלום, אני מהנדס הרכש האוטונומי 🤖\n\n" +
        "ספרו לי בעברית חופשית מה אתם רוצים להזמין. " +
        'לדוגמה: "צריך 100 מטר תעלת חשמל למפלס -1 בגינדי סביון".\n\n' +
        "אני אאתר את הפרויקט, המיקום וה-Assembly המתאימים, " +
        "ואפעיל את המנוע ההנדסי הדטרמיניסטי שייצר את הזמנת הרכש.",
    },
  ],
}

function AiCopilotPane() {
  const transport = React.useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/procurement/autonomous-po/chat",
      // x-active-company-id מועבר כ-cookie אוטומטית; ה-helper של חברת
      // master-data קורא ממנו. ה-API route מחזיר 401 אם חסר.
      headers: () => {
        const cid = readActiveCompanyIdFromCookie()
        const out: Record<string, string> = {}
        if (cid) {
          out["x-company-id"] = cid
          out["x-active-company-id"] = cid
        }
        return out
      },
    })
  }, [])

  const { messages, sendMessage, status, error, clearError, setMessages, stop } =
    useChat({
      transport,
      messages: [COPILOT_INTRO_MESSAGE],
    })

  const busy = status === "submitted" || status === "streaming"

  const [input, setInput] = React.useState("")
  const [attachments, setAttachments] = React.useState<File[]>([])
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null)
  const [listening, setListening] = React.useState(false)
  const [speechSupported, setSpeechSupported] = React.useState(false)
  const [confirmedDraftIds, setConfirmedDraftIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const recognitionRef = React.useRef<SpeechRecognition | null>(null)
  const speechPrefixRef = React.useRef("")
  const speechFinalsRef = React.useRef("")
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const previewUrls = React.useMemo(
    () =>
      attachments.map((file) =>
        file.type.startsWith("image/") ? URL.createObjectURL(file) : null
      ),
    [attachments]
  )
  React.useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [previewUrls])

  React.useEffect(() => {
    setSpeechSupported(getSpeechRecognitionConstructor() !== null)
  }, [])

  React.useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* ignore */
      }
      recognitionRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!error) return
    toast.error(error.message ?? "שגיאת צ'אט")
  }, [error])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  function stopSpeechRecognition() {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    recognitionRef.current = null
    setListening(false)
  }

  function startSpeechRecognition() {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor || busy) return

    if (listening) {
      stopSpeechRecognition()
      return
    }

    speechPrefixRef.current = input
    speechFinalsRef.current = ""

    const recognition = new Ctor()
    recognition.lang = SPEECH_LANG
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const piece = r[0]?.transcript ?? ""
        if (r.isFinal) {
          speechFinalsRef.current += piece
        } else {
          interim += piece
        }
      }
      const prefix = speechPrefixRef.current
      const finals = speechFinalsRef.current
      setInput(prefix + finals + interim)
    }

    recognition.onerror = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      recognitionRef.current = null
      setListening(false)
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    setAttachmentError(null)
    const valid: File[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(ATTACHMENT_SIZE_ERROR_HE)
        continue
      }
      valid.push(file)
    }
    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid])
    }
    e.target.value = ""
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if ((!text && attachments.length === 0) || busy) return
    if (listening) stopSpeechRecognition()
    setAttachmentError(null)
    const files = attachments.length > 0 ? filesToFileList(attachments) : undefined
    void sendMessage({ text: text || "נא לנתח את התמונה המצורפת.", files })
    setInput("")
    setAttachments([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    textareaRef.current?.focus()
  }

  function clearChat() {
    stop()
    clearError()
    setMessages([COPILOT_INTRO_MESSAGE])
    setAttachments([])
    setAttachmentError(null)
    setConfirmedDraftIds(new Set())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter שולח, Shift+Enter שורה חדשה
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden">
      <CardHeader className="border-b py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-500" />
              שיחה עם מהנדס הרכש האוטונומי
            </CardTitle>
            <CardDescription className="text-xs">
              המודל יבחר את ה-IDs הנכונים מהקונטקסט וייצר הזמנה דרך
              <code className="mx-1">erp_generate_draft_po_from_bom</code>
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={clearChat} disabled={busy}>
            ניקוי שיחה
          </Button>
        </div>
      </CardHeader>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              onConfirmVisionDraft={(toolCallId, output, confirmedQty) => {
                if (confirmedDraftIds.has(toolCallId)) return
                setConfirmedDraftIds((prev) => {
                  const next = new Set(prev)
                  next.add(toolCallId)
                  return next
                })
                const locPart = output.location
                  ? ` locationId=${output.location.id}`
                  : ""
                void sendMessage({
                  text:
                    `אני מאשר את הכמות: ${confirmedQty} ${output.assembly.unitOfMeasure}. ` +
                    `הפעל עכשיו את generate_engineering_po עם: ` +
                    `projectId=${output.project.id}` +
                    ` assemblyId=${output.assembly.id}` +
                    ` supplierId=${output.supplier.id}` +
                    locPart +
                    ` requestedQty=${confirmedQty}.`,
                })
              }}
              isDraftConfirmed={(toolCallId) => confirmedDraftIds.has(toolCallId)}
            />
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              חושב ופועל...
            </div>
          ) : null}
        </div>
      </div>

      <CardFooter className="border-t bg-muted/30 p-3">
        <form onSubmit={handleSubmit} className="w-full space-y-2">
          {/* Attachment previews */}
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => {
                const url = previewUrls[idx]
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-card"
                    title={file.name}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={file.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      aria-label={`הסר ${file.name}`}
                      className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              placeholder="לדוגמה: צריך 100 מטר תעלת חשמל במפלס -1 בגינדי סביון  —  או צרף תמונת תוכנית וציין קנה מידה + ספק"
              className="min-h-[60px] flex-1 resize-none"
              dir="auto"
            />
            <div className="flex flex-col gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={handleFilePicked}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="צירוף תמונה (שרטוט חשמל)"
                title="צירוף תמונה (PNG/JPG/WebP עד 4MB)"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {speechSupported ? (
                <Button
                  type="button"
                  variant={listening ? "destructive" : "outline"}
                  size="icon"
                  onClick={startSpeechRecognition}
                  disabled={busy}
                  aria-pressed={listening}
                  aria-label={listening ? "עצירת הקלטה" : "הקלטה קולית בעברית"}
                  className={cn(listening && "animate-pulse")}
                  title={listening ? "עצירת הקלטה" : "הקלטה קולית (he-IL)"}
                >
                  {listening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && attachments.length === 0) || busy}
                aria-label="שליחה"
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {attachmentError ? (
            <p className="text-[11px] text-destructive">{attachmentError}</p>
          ) : null}
          {!speechSupported ? (
            <p className="text-[11px] text-muted-foreground">
              הקלטה קולית בעברית זמינה ב-Chrome/Edge בלבד.
            </p>
          ) : null}
        </form>
      </CardFooter>
    </Card>
  )
}

// ============================================================================
// Chat message bubble — renders text parts with inline markdown links
// ============================================================================

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g

/** ממיר רק `[text](url)` של markdown ל-anchor בטוח. שאר התוכן נשאר כטקסט. */
function renderTextWithLinks(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  const regex = new RegExp(MARKDOWN_LINK_REGEX)
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const label = match[1]
    const href = match[2]
    const isInternal = href.startsWith("/")
    nodes.push(
      <a
        key={`link-${key++}`}
        href={href}
        className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-700 dark:text-violet-400"
        target={isInternal ? undefined : "_blank"}
        rel={isInternal ? undefined : "noopener noreferrer"}
      >
        {label}
      </a>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function ChatMessageBubble({
  message,
  onConfirmVisionDraft,
  isDraftConfirmed,
}: {
  message: UIMessage
  onConfirmVisionDraft: (
    toolCallId: string,
    output: VisionPoDraftToolOutput,
    confirmedQty: number
  ) => void
  isDraftConfirmed: (toolCallId: string) => boolean
}) {
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"

  // ה-AI SDK v5 משתמש ב-parts: text/tool-<name>/file/step-start/...
  const textParts: string[] = []
  const imageParts: Array<{ url: string; alt?: string }> = []
  const toolCalls: Array<{
    name: string
    state: string
    toolCallId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input?: any
  }> = []
  for (const part of message.parts ?? []) {
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
    } else if (part.type === "file") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any
      const mediaType: string = p.mediaType ?? p.mimeType ?? ""
      const url: string | undefined = p.url ?? (p.data ? `data:${mediaType};base64,${p.data}` : undefined)
      if (url && mediaType.startsWith("image/")) {
        imageParts.push({ url, alt: p.filename ?? "attachment" })
      }
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any
      toolCalls.push({
        name: part.type.replace(/^tool-/, ""),
        state: p.state ?? "unknown",
        toolCallId: p.toolCallId ?? "",
        output: p.output,
        input: p.input,
      })
    }
  }
  const fullText = textParts.join("")

  // זיהוי prepare_vision_po_draft שהסתיים בהצלחה — ירונדרו כה-VisionPoDraftCard.
  const visionDrafts = toolCalls.filter(
    (tc) =>
      tc.name === "prepare_vision_po_draft" &&
      (tc.state === "output-available" || tc.state === "result") &&
      tc.output?.ok === true
  )

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {isAssistant ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-[80%] space-y-1.5 rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-violet-600 text-white"
            : "border bg-card text-card-foreground"
        )}
        dir="auto"
      >
        {imageParts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {imageParts.map((img, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={img.url}
                alt={img.alt ?? "attached"}
                className="max-h-48 max-w-full rounded border border-white/30 object-contain"
              />
            ))}
          </div>
        ) : null}

        {fullText ? (
          <p className="whitespace-pre-wrap leading-relaxed">
            {renderTextWithLinks(fullText)}
          </p>
        ) : null}

        {/* Phase D — כרטיס אישור PO מלא (מחליף את ToolCallChip הרגיל) */}
        {visionDrafts.map((tc) => (
          <VisionPoDraftCard
            key={tc.toolCallId || tc.name}
            toolCallId={tc.toolCallId}
            output={tc.output as VisionPoDraftToolOutput}
            confirmed={isDraftConfirmed(tc.toolCallId)}
            onConfirm={(qty) =>
              onConfirmVisionDraft(tc.toolCallId, tc.output as VisionPoDraftToolOutput, qty)
            }
          />
        ))}

        {toolCalls.length > 0 ? (
          <div className="space-y-1 pt-1">
            {toolCalls
              .filter((tc) => tc.name !== "prepare_vision_po_draft")
              .map((tc, idx) => (
                <ToolCallChip key={idx} toolCall={tc} />
              ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-white">
          <User2 className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  )
}

function ToolCallChip({
  toolCall,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolCall: { name: string; state: string; output?: any; input?: any }
}) {
  const isPending =
    toolCall.state === "input-streaming" ||
    toolCall.state === "input-available" ||
    toolCall.state === "calling"
  const isDone =
    toolCall.state === "output-available" || toolCall.state === "result"
  const ok = toolCall.output?.ok === true
  const blocked = toolCall.output?.blocked === true

  const variant: "default" | "secondary" | "destructive" = blocked
    ? "destructive"
    : ok
      ? "default"
      : "secondary"

  return (
    <Badge variant={variant} className="gap-1 font-mono text-[10px]">
      {isPending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : isDone && ok ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : isDone && blocked ? (
        <AlertTriangle className="h-2.5 w-2.5" />
      ) : null}
      {toolCall.name}
      {isDone && ok && toolCall.output?.poNumber ? (
        <span className="font-normal opacity-90">
          {" "}
          · {toolCall.output.poNumber}
        </span>
      ) : null}
    </Badge>
  )
}

// ============================================================================
// Phase D — VisionPoDraftCard
// ============================================================================
//
// מוצג כתגובה ל-tool `prepare_vision_po_draft`. מציג למשתמש הערכה מה-AI,
// מאפשר לערוך את הכמות (להוסיף פחת/מרגן), ועם לחיצה על "אשר והפקת PO"
// שולח הודעה אוטומטית ל-LLM שמזמינה את generate_engineering_po.
//
// לאחר אישור הכרטיס נעשה read-only כדי למנוע לחיצה כפולה (למנוע PO כפול).
// ============================================================================

function VisionPoDraftCard({
  toolCallId,
  output,
  confirmed,
  onConfirm,
}: {
  toolCallId: string
  output: VisionPoDraftToolOutput
  confirmed: boolean
  onConfirm: (qty: number) => void
}) {
  const [qty, setQty] = React.useState(String(output.estimatedQuantity))
  const numericQty = Number(qty)
  const valid = Number.isFinite(numericQty) && numericQty > 0
  const margin = output.marginOfErrorPct
  const lower = (output.estimatedQuantity * (1 - margin / 100)).toFixed(1)
  const upper = (output.estimatedQuantity * (1 + margin / 100)).toFixed(1)

  return (
    <div
      className="my-2 space-y-3 rounded-lg border-2 border-violet-300 bg-violet-50/70 p-3 text-card-foreground dark:border-violet-700/60 dark:bg-violet-950/40"
      data-tool-call-id={toolCallId}
    >
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        <h4 className="text-sm font-semibold">
          🛒 הכנת הזמנת רכש (סריקת שרטוט AI)
        </h4>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">ספק</dt>
        <dd className="font-medium">
          {output.supplier.name}{" "}
          <span className="font-mono text-[10px] text-muted-foreground">
            ({output.supplier.supplierNumber})
          </span>
        </dd>

        <dt className="text-muted-foreground">פרויקט</dt>
        <dd className="font-medium">{output.project.name}</dd>

        <dt className="text-muted-foreground">Assembly</dt>
        <dd className="font-medium">
          {output.assembly.name}{" "}
          <span className="font-mono text-[10px] text-muted-foreground">
            ({output.assembly.code})
          </span>
        </dd>

        {output.location ? (
          <>
            <dt className="text-muted-foreground">מיקום</dt>
            <dd className="font-medium">{output.location.name}</dd>
          </>
        ) : null}
      </dl>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <strong>מדידה אופטית.</strong> הכמות המוערכת:{" "}
            <strong>
              {output.estimatedQuantity} {output.assembly.unitOfMeasure}
            </strong>
            . ייתכן פחת/סטיית סריקה של כ-{margin}% (טווח: {lower}–{upper}).
          </div>
        </div>
      </div>

      <div className="rounded-md bg-card/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <Ruler className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="whitespace-pre-wrap">{output.reasoning}</div>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`qty-${toolCallId}`} className="text-xs font-medium">
          כמות סופית ({output.assembly.unitOfMeasure}) — ניתן לעריכה
        </Label>
        <Input
          id={`qty-${toolCallId}`}
          type="number"
          min={0.01}
          step={0.01}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          disabled={confirmed}
          className="h-8 text-sm"
        />
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full bg-violet-600 text-white hover:bg-violet-700"
        disabled={!valid || confirmed}
        onClick={() => valid && onConfirm(numericQty)}
      >
        {confirmed ? (
          <>
            <CheckCircle2 className="me-2 h-4 w-4" /> אושר — ה-AI מפיק הזמנה...
          </>
        ) : (
          <>
            <CheckCircle2 className="me-2 h-4 w-4" /> אשר והפק הזמנת רכש רשמית
          </>
        )}
      </Button>
    </div>
  )
}

// ============================================================================
// Manual Form tab (Phase B baseline)
// ============================================================================

function ManualFormPane({
  options,
  loading,
}: {
  options: OptionsDto | null
  loading: boolean
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = React.useState(false)
  const [projectId, setProjectId] = React.useState("")
  const [locationId, setLocationId] = React.useState(NONE_VALUE)
  const [assemblyId, setAssemblyId] = React.useState("")
  const [requestedQty, setRequestedQty] = React.useState("100")

  React.useEffect(() => {
    if (!options) return
    if (options.projects.length === 1 && !projectId) {
      setProjectId(options.projects[0].id)
    }
    if (options.assemblies.length === 1 && !assemblyId) {
      setAssemblyId(options.assemblies[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  const filteredLocations = React.useMemo(
    () => (options && projectId ? options.locations.filter((l) => l.projectId === projectId) : []),
    [options, projectId]
  )

  React.useEffect(() => {
    if (locationId === NONE_VALUE) return
    if (!filteredLocations.some((l) => l.id === locationId)) {
      setLocationId(NONE_VALUE)
    }
  }, [filteredLocations, locationId])

  const selectedAssembly = React.useMemo(
    () => options?.assemblies.find((a) => a.id === assemblyId) ?? null,
    [options, assemblyId]
  )

  const canSubmit =
    !!projectId && !!assemblyId && !!requestedQty && Number(requestedQty) > 0 && !submitting

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const cid = readActiveCompanyIdFromCookie()
      const res = await fetch("/api/procurement/autonomous-po", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          ...(cid ? { "x-company-id": cid, "x-active-company-id": cid } : {}),
        },
        body: JSON.stringify({
          projectId,
          assemblyId,
          requestedQty: Number(requestedQty),
          locationId: locationId === NONE_VALUE ? null : locationId,
        }),
      })
      if (res.status === 201) {
        const json = await res.json()
        const data = json.data
        toast.success(
          `נוצרה ${data.poNumber} בסטטוס ${data.status} (${data.linesCount} שורות)`
        )
        router.push(`/marker-ofek/procurement/orders/${data.purchaseOrderId}`)
        return
      }
      if (res.status === 409) {
        const json = await res.json()
        const lines = (json.violations ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((v: any) => `• ${v.rule_code} (${v.rule_type}): ${v.message ?? ""}`)
          .join("\n")
        toast.error(`חריגה הנדסית — ${lines || json.message}`, { duration: 12000 })
        return
      }
      const json = await res.json().catch(() => null)
      toast.error(json?.error ?? `שגיאה ${res.status}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cog className="h-4 w-4" /> טופס דטרמיניסטי (Phase B)
          </CardTitle>
          <CardDescription>
            הפעלה ישירה של ה-RPC ללא LLM. שימושי ל-debugging וכ-fallback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> טוען אפשרויות...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="project" className="font-medium">
                  פרויקט <span className="text-red-500">*</span>
                </Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                  <SelectTrigger id="project">
                    <SelectValue placeholder="בחרי פרויקט..." />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.projectNumber}
                        </span>{" "}
                        — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="location"
                  className="flex items-center gap-1.5 font-medium"
                >
                  <MapPin className="h-3.5 w-3.5" /> מיקום (אופציונלי)
                </Label>
                <Select
                  value={locationId}
                  onValueChange={(v) => setLocationId(v ?? NONE_VALUE)}
                  disabled={!projectId}
                >
                  <SelectTrigger id="location">
                    <SelectValue placeholder="בחרי מיקום..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— ללא מיקום ספציפי —</SelectItem>
                    {filteredLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <span className="font-mono text-xs text-muted-foreground">
                          {l.code}
                        </span>{" "}
                        — {l.name}
                        {l.lengthM !== null ? (
                          <span className="ms-2 text-xs text-muted-foreground">
                            ({l.lengthM} מ׳)
                          </span>
                        ) : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="assembly"
                  className="flex items-center gap-1.5 font-medium"
                >
                  <Layers className="h-3.5 w-3.5" /> Assembly{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Select value={assemblyId} onValueChange={(v) => setAssemblyId(v ?? "")}>
                  <SelectTrigger id="assembly">
                    <SelectValue placeholder="בחרי קיט..." />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.assemblies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-xs text-muted-foreground">
                          {a.code}
                        </span>{" "}
                        — {a.name} ({a.unitOfMeasure})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qty" className="font-medium">
                  כמות בסיס{" "}
                  {selectedAssembly ? (
                    <span className="font-normal text-muted-foreground">
                      (ביחידות {selectedAssembly.unitOfMeasure})
                    </span>
                  ) : null}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="qty"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={requestedQty}
                  onChange={(e) => setRequestedQty(e.target.value)}
                  placeholder="100"
                />
              </div>

              <Separator />
            </>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!canSubmit || loading}>
            {submitting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" /> מחולל...
              </>
            ) : (
              <>
                <CheckCircle2 className="me-2 h-4 w-4" /> חולל הזמנה הנדסית
                <ArrowRight className="ms-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
