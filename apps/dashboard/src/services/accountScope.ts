export const ACCOUNT_SCOPE_STORAGE_KEY = 'jarvis_active_account_v1';

export function setActiveAccountScope(accountId: string): void {
  const normalized = accountId.trim();
  if (!normalized) throw new Error('Identificador da conta vazio.');
  localStorage.setItem(ACCOUNT_SCOPE_STORAGE_KEY, normalized);
  // Remove a chave antiga, que não era separada por conta.
  localStorage.removeItem('jarvis_user_profile_v1');
}

export function clearActiveAccountScope(): void {
  localStorage.removeItem(ACCOUNT_SCOPE_STORAGE_KEY);
}

export function getAccountStorageKey(baseKey: string): string {
  const accountId = localStorage.getItem(ACCOUNT_SCOPE_STORAGE_KEY) || 'anonymous';
  return `${baseKey}:${encodeURIComponent(accountId)}`;
}
