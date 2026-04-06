/**
 * עקרונות ברירת מחדל לכלי ה-AI בסביבת Diamond (חוזים, ניתוח מסמכים וכו׳).
 */
export const DIAMOND_AI_CONFIG = {
  defaultLanguage: "Hebrew",
  /** חובת אישור אנושי לכל נתון */
  verificationRequired: true,
  /** תמיד להביא הוכחה מה-PDF */
  citationModel: "Direct Quotes Only",
  riskLevels: ["קריטי", "בינוני", "נמוך"],
} as const

export type DiamondAiConfig = typeof DIAMOND_AI_CONFIG

export type DiamondAiRiskLevel = (typeof DIAMOND_AI_CONFIG.riskLevels)[number]
