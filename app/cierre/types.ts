export type PeriodMode = "day" | "week" | "month" | "range";

export type CierreFilters = {
  mode: PeriodMode;
  date: string;
  month: string;
  from: string;
  to: string;
  sedeId: string;
};

export type CierreFinancier = {
  key: string;
  name: string;
  units: number | null;
  amount: number | null;
  complete: boolean;
  source: string;
  lastUpdatedAt: string | null;
};

export type CierreReport = {
  period: { label: string; from: string; to: string };
  scope: { sedeId: number | null; label: string };
  totals: { units: number | null; amount: number | null };
  financiers: CierreFinancier[];
  complete: boolean;
  lastUpdatedAt: string | null;
  localSync: { pending: number; complete: boolean; lastUpdatedAt: string | null };
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
