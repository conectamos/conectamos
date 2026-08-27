type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  fetcher: FetchLike = fetch
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("El timeout debe ser mayor que cero");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(input, {
      ...init,
      signal: controller.signal,
    });
    const rawBody = await response.text();

    if (!rawBody.trim()) {
      if (response.ok) {
        throw new Error("El servidor devolvió una respuesta vacía");
      }

      return { response, data: {} as T };
    }

    try {
      return { response, data: JSON.parse(rawBody) as T };
    } catch {
      if (response.ok) {
        throw new Error("El servidor devolvió una respuesta inválida");
      }

      return { response, data: {} as T };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
