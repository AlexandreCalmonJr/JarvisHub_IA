export const API_BASE = '/api/v1';

export async function handleApiResponse<T>(res: Response, defaultErrorMsg: string): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: defaultErrorMsg }));
    throw new Error(errorData.detail || defaultErrorMsg);
  }
  return res.json();
}
