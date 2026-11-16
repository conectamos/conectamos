export type InvoiceItem = {
  id: number;
  number: string;
  provider: string;
  date: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: "PENDIENTE" | "PAGADA";
  paymentCount: number;
  version: number;
};

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
  today: string;
  summary: {
    invoiceCount: number;
    totalAmount: number;
    paidAmount: number;
    balance: number;
    pendingCount: number;
    paidCount: number;
  };
  pending: InvoicePage;
  paid: InvoicePage;
};
