const SESSION_STORAGE_KEY = 'jarvis_client_session_token';

let memorySessionToken: string | null = null;
let transportInstalled = false;

export function getClientSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // Storage may be unavailable inside restricted iframes; rely on memory token.
  }
  return null;
}

export function setClientSessionToken(token: string | null | undefined): void {
  const clean = (token || '').trim();
  memorySessionToken = clean || null;
  try {
    if (clean) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction in cross-origin iframe.
  }
}

export function clearClientSessionToken(): void {
  setClientSessionToken(null);
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  try {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (rawUrl.startsWith('/api/')) return true;
    const parsed = new URL(rawUrl, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function withSessionHeaders(
  nativeFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isSameOriginApiRequest(input)) {
    return nativeFetch(input, init);
  }

  const token = getClientSessionToken();
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (token && !headers.has('X-Jarvis-Session')) {
    headers.set('X-Jarvis-Session', token);
  }

  const nextInit: RequestInit = {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  };

  return nativeFetch(input, nextInit);
}

const rawNativeFetch: typeof window.fetch | null =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : null;

/**
 * Direct fetch helper that attaches the session header and credentials
 * without relying on mutating window.fetch.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const baseFetch = rawNativeFetch ?? window.fetch.bind(window);
  return withSessionHeaders(baseFetch, input, init);
}

/**
 * Safely wraps window.fetch when the host environment allows redefining it.
 * Never throws when window.fetch is getter-only or non-configurable.
 */
export function installSessionTransport(): void {
  if (transportInstalled || typeof window === 'undefined' || !rawNativeFetch) {
    return;
  }
  transportInstalled = true;

  const wrappedFetch: typeof window.fetch = (input, init) =>
    withSessionHeaders(rawNativeFetch, input, init);

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
        enumerable: descriptor ? descriptor.enumerable : true,
      });
    } else if (descriptor.writable) {
      window.fetch = wrappedFetch;
    }
  } catch {
    // Host runtime prevents overriding window.fetch; Partitioned HttpOnly cookies
    // and direct apiFetch calls continue working without interruption.
  }
}
