/**
 * Regras puras para controle de exclusão e filtragem de conversas no histórico do Chat.
 */

export interface ConversationCardTarget {
  id: string;
  isQuickShortcut?: boolean;
}

/**
 * Qualquer conversa salva no histórico real do usuário pode ser excluída —
 * inclusive debates (`/debate`) e sessões abertas originalmente via clique em um agente (`agent_*`).
 * Apenas atalhos rápidos da seção "Meus Agentes" (que não são conversas salvas) não exibem lixeira.
 */
export function canDeleteConversationCard(card: ConversationCardTarget): boolean {
  if (!card.id || !card.id.trim()) return false;
  return !card.isQuickShortcut;
}

export function filterOutDeletedSession<T extends { id?: string; session_id?: string }>(
  items: T[],
  deletedId: string
): T[] {
  return items.filter((item) => item.id !== deletedId && item.session_id !== deletedId);
}
