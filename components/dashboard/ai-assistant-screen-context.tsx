"use client"

import * as React from "react"

type AiAssistantScreenContextValue = {
  /** טקסט קצר שמסכם את המסך הנוכחי — נשלח לעוזר AI עם כל הודעה */
  digest: string | null
  setDigest: React.Dispatch<React.SetStateAction<string | null>>
}

const AiAssistantScreenContext =
  React.createContext<AiAssistantScreenContextValue | null>(null)

export function AiAssistantScreenProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [digest, setDigest] = React.useState<string | null>(null)
  const value = React.useMemo(
    () => ({ digest, setDigest }),
    [digest]
  )
  return (
    <AiAssistantScreenContext.Provider value={value}>
      {children}
    </AiAssistantScreenContext.Provider>
  )
}

export function useAiAssistantScreenContext(): AiAssistantScreenContextValue | null {
  return React.useContext(AiAssistantScreenContext)
}
