import type { PayJoyExtensionOption, PayJoyExtensionResult } from "@/lib/payjoy-extensions-provider";

export type PayJoyExtensionOperationView = {
  id: string;
  status: string;
  deviceTag: string | null;
  imei: string | null;
  clienteDocumentoUltimos4: string | null;
  asesorNombre: string;
  createdAt: string;
  expiresAt: string | null;
  currentValidThrough: string | null;
  options: PayJoyExtensionOption[];
  selectedOption: PayJoyExtensionOption | null;
  result: PayJoyExtensionResult | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PayJoyLocalDevice = {
  registroId: number;
  clienteNombre: string;
  documentoUltimos4: string;
  imei: string;
  modelo: string | null;
};
