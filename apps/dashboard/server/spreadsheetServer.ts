import ExcelJS from 'exceljs';
import { GoogleGenAI, Type } from '@google/genai';
import {
  SpreadsheetCellValue,
  SpreadsheetColumn,
  SpreadsheetPresetInfo,
  SpreadsheetSheetSpec,
  SpreadsheetSpec,
  buildPresetSpreadsheetSpec,
  detectPresetFromPrompt,
  isFormulaCell,
  sanitizeSheetName,
} from '../src/services/spreadsheetEngine.ts';

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

function normalizeColumnType(raw: string): SpreadsheetColumn['type'] {
  if (raw === 'currency' || raw === 'number' || raw === 'percent' || raw === 'date') {
    return raw;
  }
  return 'text';
}

function parseAiCellValue(raw: unknown, colType: SpreadsheetColumn['type']): SpreadsheetCellValue {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') return raw;
  const text = String(raw).trim();
  if (!text) return '';

  // Support explicit "=FORMULA | preview" or "=FORMULA" returned by AI
  if (text.startsWith('=')) {
    const [formulaPart, previewPart] = text.split('|').map((s) => s.trim());
    const cleanFormula = formulaPart.replace(/^=/, '').trim();
    const numericPreview = previewPart ? Number(previewPart.replace(',', '.')) : Number.NaN;
    return {
      formula: cleanFormula,
      preview: Number.isFinite(numericPreview) ? numericPreview : previewPart || formulaPart,
    };
  }

  if (colType === 'currency' || colType === 'number' || colType === 'percent') {
    const normalized = text
      .replace(/^R\$\s*/i, '')
      .replace(/%$/, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim();
    const num = Number(normalized);
    if (Number.isFinite(num)) {
      return colType === 'percent' && text.includes('%') ? num / 100 : num;
    }
  }
  return text;
}

export async function generateSpreadsheetSpec(input: {
  prompt?: string;
  presetId?: SpreadsheetPresetInfo['id'];
  title?: string;
  useAi?: boolean;
}): Promise<SpreadsheetSpec> {
  const prompt = (input.prompt || '').trim();

  if (input.presetId && !input.useAi) {
    return buildPresetSpreadsheetSpec(input.presetId, input.title);
  }

  if (!input.useAi) {
    const inferredPreset = input.presetId || detectPresetFromPrompt(prompt);
    return buildPresetSpreadsheetSpec(inferredPreset, input.title || prompt.slice(0, 56));
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets ou gere usando um Modelo Pronto Instantâneo.'
    );
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Você é a Iris, especialista em planilhas Excel em português do Brasil.
Crie uma estrutura completa e prática de planilha Excel para o pedido: "${prompt || input.title || 'Controle Financeiro Mensal'}".
Regras obrigatórias:
1. Gere entre 2 e 3 abas (sheets) bem organizadas com nomes curtos (máx 25 caracteres).
2. Cada aba deve ter entre 4 e 6 colunas tipadas (type: "text" | "currency" | "number" | "percent" | "date") e 4 a 7 linhas de exemplo realistas em português do Brasil.
3. Para valores numéricos de moeda (currency) ou número (number), devolva números puros como string numérica (ex: "1250.50"). Para percentual (percent), devolva decimal (ex: "0.25" para 25%).
4. Inclua uma linha de resumo (summaryCells) com fórmulas Excel reais no formato "=SUM(D5:D9)|12500" (fórmula sem erro + barra vertical + valor numérico calculado para prévia). Lembre que os dados começam na linha 5 do Excel (linhas 1-3 são título/subtítulo/espaço e linha 4 é o cabeçalho).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          sheets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                columns: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      header: { type: Type.STRING },
                      type: { type: Type.STRING },
                    },
                  },
                },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                summaryCells: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text || '{}').trim()) as {
    title?: string;
    subtitle?: string;
    sheets?: Array<{
      name?: string;
      description?: string;
      columns?: Array<{ key?: string; header?: string; type?: string }>;
      rows?: string[][];
      summaryCells?: string[];
    }>;
  };

  if (!Array.isArray(parsed.sheets) || parsed.sheets.length === 0) {
    throw new Error('O modelo Gemini retornou uma estrutura vazia para a planilha. Tente detalhar melhor as colunas desejadas.');
  }

  const usedNames = new Set<string>();
  const sheets: SpreadsheetSheetSpec[] = parsed.sheets.slice(0, 4).map((rawSheet, idx) => {
    let safeName = sanitizeSheetName(rawSheet.name || `Aba ${idx + 1}`, `Aba ${idx + 1}`);
    if (usedNames.has(safeName)) {
      safeName = sanitizeSheetName(`${safeName.slice(0, 27)} ${idx + 1}`, `Aba ${idx + 1}`);
    }
    usedNames.add(safeName);

    const columns: SpreadsheetColumn[] = (rawSheet.columns || []).slice(0, 8).map((col, cIdx) => ({
      key: (col.key || `col_${cIdx + 1}`).replace(/[^a-zA-Z0-9_]/g, '_') || `col_${cIdx + 1}`,
      header: col.header || `Coluna ${cIdx + 1}`,
      type: normalizeColumnType(String(col.type || 'text')),
      width: col.type === 'text' ? 24 : 16,
    }));

    const rows = (rawSheet.rows || []).slice(0, 30).map((cellList) => {
      const record: Record<string, SpreadsheetCellValue> = {};
      columns.forEach((col, cIdx) => {
        record[col.key] = parseAiCellValue(cellList?.[cIdx], col.type);
      });
      return record;
    });

    let summaryRow: Record<string, SpreadsheetCellValue> | undefined;
    if (Array.isArray(rawSheet.summaryCells) && rawSheet.summaryCells.length > 0) {
      summaryRow = {};
      columns.forEach((col, cIdx) => {
        summaryRow![col.key] = parseAiCellValue(rawSheet.summaryCells?.[cIdx], col.type);
      });
    }

    return {
      name: safeName,
      description: rawSheet.description || undefined,
      columns,
      rows,
      summaryRow,
    };
  });

  return {
    id: `xls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: (input.title || parsed.title || prompt || 'Planilha Personalizada').trim().slice(0, 80),
    subtitle: (parsed.subtitle || 'Planilha estruturada com fórmulas reais por Iris + Gemini').trim(),
    category: 'personalizado',
    source: 'gemini_ai',
    modelUsed: 'gemini-4-hydrogen',
    createdAt: new Date().toISOString(),
    sheets,
  };
}

function excelNumFmtForType(type: SpreadsheetColumn['type']): string | undefined {
  if (type === 'currency') return '"R$" #,##0.00;-"R$" #,##0.00;"R$" 0.00';
  if (type === 'percent') return '0.0%';
  if (type === 'number') return '#,##0.##';
  return undefined;
}

export async function renderSpreadsheetToXlsxBuffer(spec: SpreadsheetSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JARVIS AI Hub · Iris Planilhas';
  workbook.created = new Date(spec.createdAt || Date.now());
  workbook.modified = new Date();

  const usedNames = new Set<string>();

  for (let sIdx = 0; sIdx < spec.sheets.length; sIdx += 1) {
    const sheetSpec = spec.sheets[sIdx];
    let tabName = sanitizeSheetName(sheetSpec.name, `Aba ${sIdx + 1}`);
    if (usedNames.has(tabName)) {
      tabName = sanitizeSheetName(`${tabName.slice(0, 27)}_${sIdx + 1}`, `Aba ${sIdx + 1}`);
    }
    usedNames.add(tabName);

    const ws = workbook.addWorksheet(tabName, {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    const colCount = Math.max(1, sheetSpec.columns.length);

    // Row 1: Title Banner
    const titleRow = ws.getRow(1);
    titleRow.height = 28;
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `${spec.title} — ${tabName}`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B0D12' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Row 2: Subtitle / description
    const subRow = ws.getRow(2);
    subRow.height = 20;
    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = sheetSpec.description || spec.subtitle;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFCBD5E1' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12161F' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Row 3: Spacer
    ws.getRow(3).height = 8;

    // Row 4: Styled Column Headers
    const headerRow = ws.getRow(4);
    headerRow.height = 24;
    sheetSpec.columns.forEach((col, cIdx) => {
      const cell = headerRow.getCell(cIdx + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
      };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FFF97316' } },
      };
      ws.getColumn(cIdx + 1).width = Math.max(col.width || 16, col.header.length + 4);
    });

    // Rows 5+: Data rows
    sheetSpec.rows.forEach((rowData, rIdx) => {
      const excelRow = ws.getRow(5 + rIdx);
      excelRow.height = 21;
      const isEven = rIdx % 2 === 1;
      sheetSpec.columns.forEach((col, cIdx) => {
        const cell = excelRow.getCell(cIdx + 1);
        const val = rowData[col.key];
        if (isFormulaCell(val)) {
          cell.value = {
            formula: val.formula,
            result: typeof val.preview === 'number' ? val.preview : undefined,
          };
        } else {
          cell.value = val ?? '';
        }
        const fmt = excelNumFmtForType(col.type);
        if (fmt) cell.numFmt = fmt;
        cell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF111827' } };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.alignment = {
          vertical: 'middle',
          horizontal: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // Optional Summary Row with orange tint + bold totals
    if (sheetSpec.summaryRow) {
      const sumRowIdx = 5 + sheetSpec.rows.length;
      const sumRow = ws.getRow(sumRowIdx);
      sumRow.height = 24;
      sheetSpec.columns.forEach((col, cIdx) => {
        const cell = sumRow.getCell(cIdx + 1);
        const val = sheetSpec.summaryRow![col.key];
        if (isFormulaCell(val)) {
          cell.value = {
            formula: val.formula,
            result: typeof val.preview === 'number' ? val.preview : undefined,
          };
        } else {
          cell.value = val ?? '';
        }
        const fmt = excelNumFmtForType(col.type);
        if (fmt) cell.numFmt = fmt;
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
        };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FFF97316' } },
          bottom: { style: 'double', color: { argb: 'FFF97316' } },
        };
      });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
