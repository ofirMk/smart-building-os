/**
 * Web Speech API — זמין בכרומיום/אדג' (לא בכל הדפדפנים).
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
 */
export function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === "undefined") return null
  const w = window as Window &
    typeof globalThis & {
      webkitSpeechRecognition?: new () => SpeechRecognition
    }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
