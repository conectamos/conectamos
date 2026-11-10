import "server-only";

const PAYMENT_LINK_PLACEHOLDER = "{{paymentLink}}";

// Each batch persists this complete template, so future wording changes do not
// replace the text that was saved with an earlier draft.
export const PAYJOY_DAPTA_MESSAGE_TEMPLATE_V2 = "CONECTAMOS te contacta por tu crédito PayJoy. Revisa hoy el estado de tu crédito y el valor a pagar en el enlace oficial: {{paymentLink}}\n\nSi tienes un pago pendiente, realízalo hoy. Puedes pagar en Efecty, convenio 112090 — Adelantos Colombia, usando la cédula del titular como referencia. Si ya pagaste, omite este recordatorio.";

export function renderPayJoyDaptaMessage(template: string, deviceTag: string): string | null {
  // Historical templates without the supported placeholder remain verbatim.
  if (!template.includes(PAYMENT_LINK_PLACEHOLDER)) return template;
  if (deviceTag !== deviceTag.trim() || !/^D[A-Z0-9]{5,31}$/.test(deviceTag)) return null;
  const paymentLink = `https://pay.payjoy.com/p/device/${deviceTag}`;
  return template.replaceAll(PAYMENT_LINK_PLACEHOLDER, paymentLink);
}
