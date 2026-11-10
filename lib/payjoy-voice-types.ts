export const PAYJOY_VOICE_SCHEDULED_AT = "2026-11-10T15:00:00.000Z";
export const PAYJOY_VOICE_EXPIRES_AT = "2026-11-10T15:30:00.000Z";
export const PAYJOY_VOICE_TIMEZONE = "America/Bogota";
export const PAYJOY_VOICE_MAX_CALLS = 7;

export type PayJoyVoiceCallStatus = "PENDING" | "CHECKING" | "DISPATCHING" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "HELD" | "UNKNOWN" | "CANCELLED";
export type PayJoyVoiceOutcome = "PAID_REPORTED" | "PAYMENT_INTENT" | "WRONG_NUMBER" | "THIRD_PARTY" | "NO_CONTACT" | "DECLINED" | "OTHER";
export type PayJoyVoiceCallView = {
  id: string; deviceTag: string; phoneMasked: string; status: PayJoyVoiceCallStatus;
  reasonCode: string | null; latestOutcome: string | null; identityConfirmedAt: string | null;
  acceptedAt: string | null; completedAt: string | null;
};
export type PayJoyVoiceBatchView = {
  id: string; status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
  scheduledAt: string; expiresAt: string; canCancel: boolean; createdBy: string; authorizedAt: string;
  calls: PayJoyVoiceCallView[];
};
export type PayJoyVoiceViewResponse = {
  sourceBatchId: string;
  configuration: { ready: boolean; reasonCode: "CONFIGURATION_PENDING" | null };
  scheduledAt: string; expiresAt: string; timezone: typeof PAYJOY_VOICE_TIMEZONE; maxCalls: 7;
  batch: PayJoyVoiceBatchView | null; eligibleCount: number; blockers: string[];
};
