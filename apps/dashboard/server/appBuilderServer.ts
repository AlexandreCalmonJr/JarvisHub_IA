import JSZip from 'jszip';
import { GoogleGenAI, Type } from '@google/genai';
import {
  AppBlueprintSpec,
  AppFieldSpec,
  AppPresetId,
  AppTargetPlatform,
  GeneratedProjectFile,
  buildAppProjectFiles,
  buildPackageId,
  buildPresetAppBlueprint,
  detectAppPresetFromPrompt,
  slugifyAppName,
} from '../src/services/appBuilderEngine.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateAppBlueprint(input: {
  prompt?: string;
  presetId?: AppPresetId;
  name?: string;
  platform: AppTargetPlatform;
  accentColor?: string;
  useAi?: boolean;
}): Promise<{ blueprint: AppBlueprintSpec; files: GeneratedProjectFile[] }> {
  const platform: AppTargetPlatform =
    input.platform === 'android' || input.platform === 'windows' || input.platform === 'both'
      ? input.platform
      : 'both';

  const prompt = (input.prompt || '').trim();

  if (!input.useAi) {
    const preset = input.presetId || detectAppPresetFromPrompt(prompt);
    const blueprint = buildPresetAppBlueprint(
      preset,
      platform,
      input.name?.trim() || (prompt ? prompt.slice(0, 48) : undefined),
      input.accentColor
    );
    return { blueprint, files: buildAppProjectFiles(blueprint) };
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets ou crie imediatamente usando um Modelo Pronto.'
    );
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Você é o Rafael, arquiteto de aplicativos Android & Windows em português do Brasil.
Projete um aplicativo prático e enxuto para: "${prompt || input.name || 'Gestor Pessoal'}".
Retorne um JSON estruturado com:
- name: nome curto e amigável do app
- tagline: frase curta de 1 linha explicando o benefício
- description: resumo de 1-2 frases
- entityName: nome singular do registro (ex.: "Pedido", "Tarefa", "Cliente", "Despesa")
- entityPlural: plural (ex.: "Pedidos", "Tarefas")
- primaryMetricLabel: rótulo do KPI principal
- metricMode: "sum_currency" (se tiver valor em R$), "count_done" (se for checklist/hábitos) ou "count_all"
- fields: 3 a 4 campos (o primeiro SEMPRE com key="titulo" e type="text"; se metricMode="sum_currency", inclua um campo com key="valor" e type="currency"). Tipos válidos: "text" | "number" | "currency" | "select".
- sampleTitles: 3 exemplos realistas de títulos em português
- sampleValues: 3 valores numéricos correspondentes (ou 0 se não for monetário)`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          tagline: { type: Type.STRING },
          description: { type: Type.STRING },
          entityName: { type: Type.STRING },
          entityPlural: { type: Type.STRING },
          primaryMetricLabel: { type: Type.STRING },
          metricMode: { type: Type.STRING },
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                label: { type: Type.STRING },
                type: { type: Type.STRING },
                placeholder: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
          sampleTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
          sampleValues: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as any;
  const appName = (input.name?.trim() || parsed.name || 'Meu App JARVIS').slice(0, 52);
  const metricMode: AppBlueprintSpec['metricMode'] =
    parsed.metricMode === 'sum_currency' || parsed.metricMode === 'count_done'
      ? parsed.metricMode
      : 'count_all';

  const rawFields: AppFieldSpec[] = Array.isArray(parsed.fields) && parsed.fields.length >= 2
    ? parsed.fields.slice(0, 4).map((f: any, idx: number) => ({
        key:
          idx === 0
            ? 'titulo'
            : String(f.key || `campo_${idx}`)
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '_') || `campo_${idx}`,
        label: String(f.label || `Campo ${idx + 1}`),
        type:
          f.type === 'number' || f.type === 'currency' || f.type === 'select' ? f.type : 'text',
        placeholder: f.placeholder ? String(f.placeholder) : undefined,
        options:
          f.type === 'select' && Array.isArray(f.options) && f.options.length > 0
            ? f.options.map((o: any) => String(o))
            : f.type === 'select'
              ? ['Padrão', 'Prioritário']
              : undefined,
        required: idx === 0,
      }))
    : [
        { key: 'titulo', label: 'Descrição', type: 'text', placeholder: 'Digite aqui...', required: true },
        { key: 'categoria', label: 'Categoria', type: 'select', options: ['Geral', 'Importante'] },
      ];

  const valueField = rawFields.find((f) => f.type === 'currency');
  const titles: string[] = Array.isArray(parsed.sampleTitles) && parsed.sampleTitles.length
    ? parsed.sampleTitles.slice(0, 3).map((t: any) => String(t))
    : ['Primeiro exemplo pronto', 'Segundo item cadastrado', 'Terceiro registro'];
  const values: number[] = Array.isArray(parsed.sampleValues) ? parsed.sampleValues : [];

  const sampleItems = titles.map((t, idx) => {
    const rec: Record<string, string | number | boolean> = {
      id: String(idx + 1),
      titulo: t,
      status: idx === 0 ? 'Concluído' : 'Ativo',
      done: idx === 0,
    };
    rawFields.slice(1).forEach((f) => {
      if (f.type === 'currency' || f.type === 'number') {
        rec[f.key] = Number(values[idx] ?? (idx + 1) * 75);
      } else if (f.type === 'select' && f.options?.length) {
        rec[f.key] = f.options[idx % f.options.length];
      } else {
        rec[f.key] = f.placeholder || 'Exemplo';
      }
    });
    return rec;
  });

  const blueprint: AppBlueprintSpec = {
    id: `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: appName,
    slug: slugifyAppName(appName),
    packageId: buildPackageId(appName),
    tagline: String(parsed.tagline || 'Criado sob medida no Construtor de Apps JARVIS'),
    description: String(parsed.description || prompt || appName),
    platform,
    accentColor: input.accentColor || '#f97316',
    entityName: String(parsed.entityName || 'Registro'),
    entityPlural: String(parsed.entityPlural || 'Registros'),
    primaryMetricLabel: String(parsed.primaryMetricLabel || 'Resumo'),
    metricMode,
    valueFieldKey: valueField?.key,
    statusOptions: ['Ativo', 'Concluído'],
    fields: rawFields,
    sampleItems,
    source: 'gemini_ai',
    modelUsed: 'gemini-4-hydrogen',
    createdAt: new Date().toISOString(),
  };

  return { blueprint, files: buildAppProjectFiles(blueprint) };
}

export async function packageProjectToZipBuffer(
  slug: string,
  files: GeneratedProjectFile[]
): Promise<Buffer> {
  const zip = new JSZip();
  const rootFolder = zip.folder(slug || 'meu-app-jarvis')!;
  for (const file of files) {
    rootFolder.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
