export type InvoiceItem = {
  id: number;
  number: string;
  provider: string;
  providerId?: number | null;
  date: string;
  dueDate?: string | null;
  dueStatus?: "SIN_FECHA" | "AL_DIA" | "PROXIMA" | "HOY" | "VENCIDA" | "PAGADA";
  deletedAt?: string | null;
  deletedBy?: string | null;
  amount: number;
  paidAmount: number;
  balance: number;
  status: "PENDIENTE" | "PAGADA";
  paymentCount: number;
  version: number;
};

export type InvoiceProvider = { id: number; name: string; version: number; active: boolean };

export type InvoicePayment = {
  id: number | string;
  date: string;
  amount: number;
  reference: string | null;
  createdBy: string;
  createdAt: string;
};

export type InvoiceDetail = InvoiceItem & { payments: InvoicePayment[] };

export type InvoicePage = {
  items: InvoiceItem[];
  page: number;
  pageSize: 10;
  total: number;
  pages: number;
};

export type InvoiceReport = {
  month: string;
  pendingScope: "ALL_MONTHS";
  paidMonth: string;
  today: string;
  summary: {
    invoiceCount: number;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    pendingCount: number;
    paidCount: number;
    overdueCount?: number;
    dueSoonCount?: number;
  };
  pending: InvoicePage;
  paid: InvoicePage;
};
