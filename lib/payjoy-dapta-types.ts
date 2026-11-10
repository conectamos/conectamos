export const PAYJOY_DAPTA_DEVICE_LIMIT = 25;
export const PAYJOY_DAPTA_AGREEMENT = "112090" as const;

export type PayJoyDaptaLookupStatus = "PENDING" | "CHECKING" | "FOUND" | "MISSING" | "ERROR";
export type PayJoyDaptaPhoneSource = "PAYJOY_NEQUI_PREFILL";
export type PayJoyDaptaItemView = {
  id: string;
  deviceTag: string;
  lookupStatus: PayJoyDaptaLookupStatus;
  phone: string | null;
  phoneMasked: string | null;
  phoneSource: PayJoyDaptaPhoneSource | null;
  ownershipStatus: "PENDING_REVIEW";
  consentStatus: "PENDING_REVIEW";
  reviewStatus: "PENDING_REVIEW" | "DUPLICATE_PHONE";
  duplicateOfId: string | null;
  messagePreview: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string | null;
};
export type PayJoyDaptaCounts = {
  total: number;
  pending: number;
  checking: number;
  found: number;
  missing: number;
  error: number;
  duplicatePhones: number;
};
export type PayJoyDaptaBatchSummary = {
  id: string;
  status: "DRAFT_ONLY";
  agreement: typeof PAYJOY_DAPTA_AGREEMENT;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  counts: PayJoyDaptaCounts;
};
export type PayJoyDaptaBatchView = PayJoyDaptaBatchSummary & { items: PayJoyDaptaItemView[] };
export type PayJoyDaptaBatchResponse = {
  batch: PayJoyDaptaBatchView;
  hasMore: boolean;
  processedCount: number;
  sendingEnabled: false;
};
export type PayJoyDaptaHistoryResponse = {
  batches: PayJoyDaptaBatchSummary[];
  limit: number;
  sendingEnabled: false;
};
