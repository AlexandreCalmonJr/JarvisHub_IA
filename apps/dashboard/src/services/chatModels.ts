export interface FormattedChatModel {
  id: string;
  name: string;
  label: string;
  effort: string;
  provider: string;
  isCloud?: boolean;
}

export function parseChatModelOptions(data: any): FormattedChatModel[] {
  const list: FormattedChatModel[] = [];
  if (!data) return list;

  // 1. Gateway Híbrido se habilitado
  if (data.hybrid_gateway?.enabled && data.hybrid_gateway?.model) {
    const provName = (data.hybrid_gateway.provider || 'Nuvem').toUpperCase();
    list.push({
      id: data.hybrid_gateway.model,
      name: data.hybrid_gateway.model,
      label: data.hybrid_gateway.model,
      effort: `${provName} Nuvem`,
      provider: provName,
      isCloud: true,
    });
  }

  // 2. Modelos online configurados
  if (Array.isArray(data.online_models)) {
    for (const om of data.online_models) {
      if (!list.some((item) => item.id === om.name)) {
        const prov = (om.provider || 'Nuvem').toUpperCase();
        list.push({
          id: om.name,
          name: om.name,
          label: om.name,
          effort: prov,
          provider: prov,
          isCloud: true,
        });
      }
    }
  }

  // 3. Modelos locais instalados no Ollama (filtrando embeddings)
  if (Array.isArray(data.models)) {
    for (const m of data.models) {
      const nameLower = (m.name || '').toLowerCase();
      if (
        nameLower.includes('embed') ||
        nameLower.includes('nomic') ||
        nameLower.includes('bge-') ||
        nameLower.includes('minilm')
      ) {
        continue;
      }
      const role = m.role || 'Local';
      const shortRole = role.split(',')[0].trim();
      list.push({
        id: m.name,
        name: m.name,
        label: m.name,
        effort: `${m.parameter_size || 'Local'} (${shortRole})`,
        provider: 'Local Ollama',
        isCloud: false,
      });
    }
  }

  return list;
}
