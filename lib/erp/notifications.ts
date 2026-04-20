export type PriceOverrideVarianceAlertPayload = {
  projectName: string
  item: string
  managerName: string
  varianceRatio: number
  variancePct: string
  entity: string
  entityId: string
}

export type HighVarianceWhatsAppPayload = {
  ProjectName: string
  ItemName: string
  Subcontractor: string
  VariancePercentage: string
  ManagerNote: string
}

export type ExecutiveVarianceWhatsAppPayload = {
  Project: string
  Item: string
  Manager: string
  "Variance%": number
  TotalImpact: number
}

export type WeeklyPulsePayload = {
  companyId: string
  healthyProjects: number
  attentionProjects: number
  totalOffsetRecoveryNis: number
}

export function formatPricingDeltaPercent(varianceRatio: number): string {
  const pct = Number(varianceRatio) * 100
  const formatted = Math.abs(pct).toFixed(1)
  return `${pct >= 0 ? "+" : "-"}${formatted}%`
}

export async function sendPriceOverrideVarianceAlert(
  payload: Omit<PriceOverrideVarianceAlertPayload, "variancePct">
): Promise<{ sent: boolean; reason?: string }> {
  const webhookUrl = process.env.PRICE_OVERRIDE_ALERT_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return { sent: false, reason: "PRICE_OVERRIDE_ALERT_WEBHOOK_URL is not configured" }
  }

  const body: PriceOverrideVarianceAlertPayload = {
    ...payload,
    variancePct: formatPricingDeltaPercent(payload.varianceRatio),
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alert-channel": "WHATSAPP",
      "x-alert-provider": "TWILIO_OR_CLOUD_API",
    },
    body: JSON.stringify({
      type: "HIGH_VARIANCE_PRICE_OVERRIDE",
      channel: "whatsapp",
      severity: "high",
      data: body,
    }),
  }).catch(() => null)

  if (!response) {
    return { sent: false, reason: "Webhook request failed" }
  }
  if (!response.ok) {
    return { sent: false, reason: `Webhook returned HTTP ${response.status}` }
  }
  return { sent: true }
}

export async function sendHighVarianceWhatsAppAlert(
  payload: HighVarianceWhatsAppPayload
): Promise<{ sent: boolean; reason?: string }> {
  const webhookUrl =
    process.env.PRICE_OVERRIDE_ALERT_WEBHOOK_URL?.trim() ||
    process.env.ERP_WHATSAPP_ALERT_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return { sent: false, reason: "No WhatsApp alert webhook is configured" }
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alert-channel": "WHATSAPP",
      "x-alert-provider": "TWILIO_OR_CLOUD_API",
    },
    body: JSON.stringify({
      type: "HIGH_VARIANCE_PRICE_OVERRIDE",
      channel: "whatsapp",
      severity: "high",
      data: payload,
    }),
  }).catch(() => null)

  if (!response) return { sent: false, reason: "Webhook request failed" }
  if (!response.ok) return { sent: false, reason: `Webhook returned HTTP ${response.status}` }
  return { sent: true }
}

export async function sendExecutiveVarianceWhatsAppAlert(
  payload: ExecutiveVarianceWhatsAppPayload
): Promise<{ sent: boolean; reason?: string }> {
  const webhookUrl =
    process.env.PRICE_OVERRIDE_ALERT_WEBHOOK_URL?.trim() ||
    process.env.ERP_WHATSAPP_ALERT_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return { sent: false, reason: "No WhatsApp alert webhook is configured" }
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alert-channel": "WHATSAPP",
      "x-alert-provider": "TWILIO_OR_CLOUD_API",
    },
    body: JSON.stringify({
      type: "HIGH_VARIANCE_PRICE_OVERRIDE",
      channel: "whatsapp",
      severity: "high",
      data: payload,
    }),
  }).catch(() => null)

  if (!response) return { sent: false, reason: "Webhook request failed" }
  if (!response.ok) return { sent: false, reason: `Webhook returned HTTP ${response.status}` }
  return { sent: true }
}

export function formatWeeklyPulseMessage(payload: WeeklyPulsePayload): string {
  const totalOffset = Number(payload.totalOffsetRecoveryNis || 0).toLocaleString("he-IL", {
    maximumFractionDigits: 0,
  })
  return `Weekly Pulse: ${payload.healthyProjects} Projects Healthy, ${payload.attentionProjects} Require Attention. Total Offset Recovery: ${totalOffset} NIS.`
}

export async function sendWeeklyPulseWhatsAppAlert(
  payload: WeeklyPulsePayload
): Promise<{ sent: boolean; reason?: string }> {
  const webhookUrl =
    process.env.PRICE_OVERRIDE_ALERT_WEBHOOK_URL?.trim() ||
    process.env.ERP_WHATSAPP_ALERT_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return { sent: false, reason: "No WhatsApp alert webhook is configured" }
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-alert-channel": "WHATSAPP",
      "x-alert-provider": "TWILIO_OR_CLOUD_API",
    },
    body: JSON.stringify({
      type: "ERP_WEEKLY_PULSE",
      channel: "whatsapp",
      severity: payload.attentionProjects > 0 ? "high" : "info",
      data: {
        ...payload,
        message: formatWeeklyPulseMessage(payload),
      },
    }),
  }).catch(() => null)

  if (!response) return { sent: false, reason: "Webhook request failed" }
  if (!response.ok) return { sent: false, reason: `Webhook returned HTTP ${response.status}` }
  return { sent: true }
}
