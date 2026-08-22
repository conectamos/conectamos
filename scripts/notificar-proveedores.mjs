const appUrlValue = String(process.env.APP_URL || "").trim();
const cronSecret = String(process.env.CRON_SECRET || "").trim();

if (!appUrlValue) {
  throw new Error("APP_URL es obligatoria para ejecutar el cron");
}

if (!cronSecret) {
  throw new Error("CRON_SECRET es obligatorio para ejecutar el cron");
}

let appUrl;
try {
  appUrl = new URL(appUrlValue);
} catch {
  throw new Error("APP_URL no es una URL valida");
}

if (!["http:", "https:"].includes(appUrl.protocol)) {
  throw new Error("APP_URL debe usar http o https");
}

const endpoint = new URL(
  "/api/proveedores/notificaciones",
  appUrl
);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000);

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: controller.signal,
  });
  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  console.log(
    JSON.stringify(
      {
        status: response.status,
        resultado: data,
      },
      null,
      2
    )
  );

  if (!response.ok || data?.ok === false) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? `Error ejecutando notificaciones: ${error.message}`
      : "Error ejecutando notificaciones"
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
