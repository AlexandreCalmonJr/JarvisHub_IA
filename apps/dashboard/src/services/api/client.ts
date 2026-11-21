export const API_BASE = '/api/v1';

/**
 * Same-origin transport for the FastAPI session cookie.
 * Browser sessions are carried only by the HttpOnly cookie; never copy session
 * identifiers into localStorage, sessionStorage, or custom request headers.
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers,
  });
}

export async function handleApiResponse<T>(res: Response, defaultErrorMsg: string): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: defaultErrorMsg }));
    throw new Error(errorData.detail || defaultErrorMsg);
  }
  return res.json();
}
