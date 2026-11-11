import { API_BASE, handleApiResponse } from './client';

export interface AccountProfilePayload {
  displayName: string;
  avatarIcon: string;
  developerRole: string;
  seniorityLevel: string;
  responseStyle: string;
  customInstructions: string;
}

export async function fetchUserProfileApi(): Promise<{
  displayName?: string; avatarIcon?: string; roleTitle?: string;
  seniorityLevel?: string; responseStyle?: string;
  userBackground?: string; responseGuidelines?: string;
} | null> {
  const response = await fetch(`${API_BASE}/user/profile`, { credentials: 'include' });
  const stored = await handleApiResponse<Partial<AccountProfilePayload>>(response, 'Falha ao carregar perfil da conta.');
  const instructionParts = (stored.customInstructions || '').split(/\n\s*\n/);
  return {
    displayName: stored.displayName,
    avatarIcon: stored.avatarIcon,
    roleTitle: stored.developerRole,
    seniorityLevel: stored.seniorityLevel,
    responseStyle: stored.responseStyle,
    userBackground: instructionParts[0] || '',
    responseGuidelines: instructionParts.slice(1).join('\n\n'),
  };
}

export async function saveUserProfileApi(profile: {
  displayName: string;
  roleTitle: string;
  avatarIcon: string;
  seniorityLevel: string;
  responseStyle: string;
  userBackground: string;
  responseGuidelines: string;
}): Promise<void> {
  const payload: AccountProfilePayload = {
    displayName: profile.displayName,
    avatarIcon: profile.avatarIcon,
    developerRole: profile.roleTitle,
    seniorityLevel: profile.seniorityLevel,
    responseStyle: profile.responseStyle,
    customInstructions: [
      profile.userBackground.trim(),
      profile.responseGuidelines.trim(),
    ].filter(Boolean).join('\n\n'),
  };
  const response = await fetch(`${API_BASE}/user/profile`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleApiResponse(response, 'Falha ao guardar perfil da conta.');
}
