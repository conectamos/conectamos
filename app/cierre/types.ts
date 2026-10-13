export type PeriodMode = "day" | "week" | "month" | "range";

export type CierreFilters = {
  mode: PeriodMode;
  date: string;
  month: string;
  from: string;
  to: string;
  sedeId: string;
};

export type CierreProviderSync = {
  enabled: boolean;
  workerEnabled?: boolean;
  workerActive?: boolean;
  status: "DESACTIVADA" | "EN_COLA" | "CONSULTANDO" | "PAUSADA" | "DETENIDA" | "REVISADA_LIMITADA" | "ERROR" | "SIN_REFERENCIA";
  total: number;
  queued: number;
  reviewed: number;
  consulted?: number;
  linked?: number;
  unconfirmed?: number;
  errors: number;
  withoutReference: number;
  lastSuccessAt: string | null;
  lastActivityAt?: string | null;
  resumeAt?: string | null;
  active?: { financial: string; day: string | null } | null;
  priority?: { from: string; to: string; applies: boolean } | null;
  reasons?: string[];
  limitation: string;
};

export type CierreFinancier = {
  key: string;
  name: string;
  units: number | null;
  amount: number | null;
  complete: boolean;
  source: string;
  lastUpdatedAt: string | null;
  providerSync?: CierreProviderSync | null;
  coverageLabel?: string;
  limitation?: string;
};

export type CierreReport = {
  period: { label: string; from: string; to: string };
  scope: { sedeId: number | null; label: string };
  totals: { units: number | null; amount: number | null };
  financiers: CierreFinancier[];
  complete: boolean;
  lastUpdatedAt: string | null;
  localSync: { pending: number; complete: boolean; lastUpdatedAt: string | null };
  providerSync?: CierreProviderSync | null;
  coverageLabel?: string;
  options: { sedes: { id: number; nombre: string }[]; canSelectSede: boolean };
};

export type CierreDetail = {
  items: {
    id: string | number;
    date: string;
    creditNumber: string | null;
    customerName: string | null;
    customerDocument: string | null;
    sedeName: string;
    amount: number;
    status: string;
    source: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
  units: number | null;
  amount: number | null;
  complete: boolean;
};
