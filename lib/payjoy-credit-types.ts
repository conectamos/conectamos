export type PayJoyCreditPayment = { amount: number; currency: string; paidAt: string };

// Allowlisted provider data only. Missing information is null, never zero.
export type PayJoyCreditSnapshot = {
  deviceTag: string | null;
  imei: string | null;
  model: string | null;
  financeOrderId: string | null;
  remainingBalance: number | null;
  currency: string | null;
  validThrough: string | null;
  paidInFull: boolean | null;
  financeAmount: number | null;
  downPayment: number | null;
  purchaseAmount: number | null;
  months: number | null;
  weeklyCost: number | null;
  fortnightlyCost: number | null;
  monthlyCost: number | null;
  lastSeen: string | null;
  secureStatus: string | null;
  payments: PayJoyCreditPayment[];
  paymentsAvailability: "INFORMADO" | "NO_DISPONIBLE";
  source: "RETAIL" | "PAYMENT" | "RETAIL_AND_PAYMENT";
  warnings: string[];
};

export type PayJoyCreditCheckView = {
  id: string;
  identifier: string;
  deviceTag: string | null;
  imei: string | null;
  asesorNombre: string;
  status: "CONSULTANDO" | "LISTA" | "ERROR";
  createdAt: string;
  completedAt: string | null;
  snapshot: PayJoyCreditSnapshot | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PayJoyExtensionFollowUp = {
  id: string;
  deviceTag: string | null;
  imei: string | null;
  asesorNombre: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  extensionHours: number | null;
  grantedValidThrough: string | null;
  followUp: {
    status: "SIN_COMPROBAR" | "CONSULTADO" | "ERROR_CONSULTA" | "NO_APLICA" | "REQUIERE_REVISION";
    checkId: string | null;
    checkedAt: string | null;
    message: string;
    currentValidThrough: string | null;
    remainingBalance: number | null;
    currency: string | null;
    paidInFull: boolean | null;
    // No payment in the returned history does not prove that no payment occurred.
    paymentAfterExtension: PayJoyCreditPayment | null;
  };
};

export type PayJoyCreditWorkspaceData = {
  checks: PayJoyCreditCheckView[];
  extensions: PayJoyExtensionFollowUp[];
  limit: number;
  serverTime: string;
};
