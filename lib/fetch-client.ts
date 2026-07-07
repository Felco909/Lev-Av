export class FetchClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FetchClientError';
    this.status = status;
  }
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 30000;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const externalSignal = init?.signal;
  const signal = externalSignal
    ? mergeSignals([externalSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const res = await fetch(url, { ...init, signal });
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (!res.ok) {
      const message =
        (payload && typeof payload.error === 'string' && payload.error) ||
        (res.status === 401 ? 'Сессия истекла. Войдите снова.' : 'Не удалось загрузить данные.');
      throw new FetchClientError(message, res.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof FetchClientError) throw error;
    if (timeoutController.signal.aborted) {
      throw new FetchClientError('Превышено время ожидания ответа сервера.');
    }
    throw new FetchClientError('Нет связи с сервером. Проверьте сеть и что TMS запущена.');
  } finally {
    clearTimeout(timer);
  }
}
