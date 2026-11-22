export type SpreadsheetColumnType = 'text' | 'currency' | 'number' | 'percent' | 'date';

export interface SpreadsheetColumn {
  key: string;
  header: string;
  type: SpreadsheetColumnType;
  width?: number;
}

export interface SpreadsheetFormulaCell {
  formula: string;
  preview: string | number;
}

export type SpreadsheetCellValue = string | number | boolean | null | SpreadsheetFormulaCell;

export interface SpreadsheetSheetSpec {
  name: string;
  description?: string;
  columns: SpreadsheetColumn[];
  rows: Array<Record<string, SpreadsheetCellValue>>;
  summaryRow?: Record<string, SpreadsheetCellValue>;
}

export interface SpreadsheetSpec {
  id: string;
  title: string;
  subtitle: string;
  category: 'financas' | 'estoque' | 'projeto' | 'estudos' | 'personalizado';
  source: 'modelo_pronto' | 'gemini_ai';
  modelUsed: string;
  createdAt: string;
  sheets: SpreadsheetSheetSpec[];
}

export interface SpreadsheetPresetInfo {
  id: 'financeiro_mensal' | 'controle_estoque' | 'orcamento_projeto' | 'plano_estudos';
  title: string;
  description: string;
  category: SpreadsheetSpec['category'];
  sheetNames: string[];
  samplePrompt: string;
}

export const SPREADSHEET_PRESETS: SpreadsheetPresetInfo[] = [
  {
    id: 'financeiro_mensal',
    title: 'Controle Financeiro Mensal',
    description: 'Receitas, despesas fixas/variáveis e aba de resumo com saldo líquido automático.',
    category: 'financas',
    sheetNames: ['Receitas', 'Despesas', 'Resumo Mensal'],
    samplePrompt: 'Crie uma planilha Excel de controle financeiro mensal com abas de receitas, despesas e resumo.',
  },
  {
    id: 'controle_estoque',
    title: 'Controle de Estoque & Vendas',
    description: 'Cadastro de produtos, custo, preço de venda, margem percentual e valor total em estoque.',
    category: 'estoque',
    sheetNames: ['Estoque Atual', 'Vendas do Mês'],
    samplePrompt: 'Monte uma planilha de controle de estoque e vendas para loja com cálculo automático de margem e valor total.',
  },
  {
    id: 'orcamento_projeto',
    title: 'Orçamento de Projeto ou Obra',
    description: 'Etapas, fornecedores, valor previsto vs. realizado e variação percentual por item.',
    category: 'projeto',
    sheetNames: ['Orçamento', 'Cronograma'],
    samplePrompt: 'Crie uma planilha de orçamento previsto vs realizado para gerenciar custos de um projeto.',
  },
  {
    id: 'plano_estudos',
    title: 'Monitor de Estudos & Revisões',
    description: 'Matérias, horas estudadas, acertos em simulados e média automática de aproveitamento.',
    category: 'estudos',
    sheetNames: ['Plano Semanal', 'Simulados'],
    samplePrompt: 'Gere uma planilha de estudos semanais com carga horária, status e média de acertos em simulados.',
  },
];

const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g;

export function sanitizeSheetName(raw: string, fallback = 'Planilha'): string {
  const cleaned = String(raw || '')
    .replace(INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = cleaned || fallback;
  return base.slice(0, 31).trim() || fallback;
}

export function columnIndexToLetter(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

export function isFormulaCell(value: SpreadsheetCellValue): value is SpreadsheetFormulaCell {
  return (
    typeof value === 'object' &&
    value !== null &&
    'formula' in value &&
    typeof (value as SpreadsheetFormulaCell).formula === 'string'
  );
}

export function formatCellForPreview(value: SpreadsheetCellValue, type: SpreadsheetColumnType): string {
  const raw = isFormulaCell(value) ? value.preview : value;
  if (raw === null || raw === undefined || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (type === 'currency') {
      return raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    if (type === 'percent') {
      return `${(raw * 100).toFixed(1).replace('.', ',')}%`;
    }
    return raw.toLocaleString('pt-BR');
  }
  return String(raw);
}

function escapeCsvField(raw: string): string {
  if (/[",\r\n;]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function spreadsheetToCsv(sheet: SpreadsheetSheetSpec): string {
  const headers = sheet.columns.map((col) => escapeCsvField(col.header)).join(',');
  const lines: string[] = [headers];

  const appendRow = (row: Record<string, SpreadsheetCellValue>) => {
    const cells = sheet.columns.map((col) => {
      const val = row[col.key];
      const raw = isFormulaCell(val) ? val.preview : val;
      if (raw === null || raw === undefined) return '';
      if (typeof raw === 'number' && col.type === 'percent') {
        return escapeCsvField(`${(raw * 100).toFixed(1)}%`);
      }
      return escapeCsvField(String(raw));
    });
    lines.push(cells.join(','));
  };

  for (const row of sheet.rows) {
    appendRow(row);
  }
  if (sheet.summaryRow) {
    appendRow(sheet.summaryRow);
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function detectPresetFromPrompt(prompt: string): SpreadsheetPresetInfo['id'] {
  const normalized = (prompt || '').toLowerCase();
  if (/\b(estoque|loja|produto|venda|sku|margem|mercadoria)\b/.test(normalized)) {
    return 'controle_estoque';
  }
  if (/\b(obra|projeto|reforma|fornecedor|or[cç]amento de projeto|cronograma)\b/.test(normalized)) {
    return 'orcamento_projeto';
  }
  if (/\b(estudo|enem|concurso|simulado|mat[eé]ria|prova|ingl[eê]s|faculdade)\b/.test(normalized)) {
    return 'plano_estudos';
  }
  return 'financeiro_mensal';
}

export function buildPresetSpreadsheetSpec(
  presetId: SpreadsheetPresetInfo['id'],
  customTitle?: string
): SpreadsheetSpec {
  const id = `xls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  if (presetId === 'controle_estoque') {
    return {
      id,
      title: customTitle?.trim() || 'Controle de Estoque & Vendas',
      subtitle: 'Planilha multi-abas com margem automática, valor em estoque e faturamento mensal',
      category: 'estoque',
      source: 'modelo_pronto',
      modelUsed: 'iris-template-xlsx',
      createdAt,
      sheets: [
        {
          name: 'Estoque Atual',
          description: 'Posição atual de produtos com valor total e margem calculados por fórmula Excel.',
          columns: [
            { key: 'sku', header: 'Código', type: 'text', width: 12 },
            { key: 'produto', header: 'Produto', type: 'text', width: 28 },
            { key: 'categoria', header: 'Categoria', type: 'text', width: 16 },
            { key: 'qtd', header: 'Qtd. Atual', type: 'number', width: 13 },
            { key: 'custo', header: 'Custo Unit.', type: 'currency', width: 15 },
            { key: 'preco', header: 'Preço Venda', type: 'currency', width: 15 },
            { key: 'total_estoque', header: 'Valor em Estoque', type: 'currency', width: 18 },
            { key: 'margem', header: 'Margem', type: 'percent', width: 13 },
          ],
          rows: [
            {
              sku: 'PRD-001',
              produto: 'Fone Bluetooth Pro',
              categoria: 'Áudio',
              qtd: 24,
              custo: 95,
              preco: 189.9,
              total_estoque: { formula: 'D5*E5', preview: 2280 },
              margem: { formula: '(F5-E5)/F5', preview: 0.4997 },
            },
            {
              sku: 'PRD-002',
              produto: 'Carregador Turbo 65W',
              categoria: 'Acessórios',
              qtd: 40,
              custo: 48,
              preco: 119.9,
              total_estoque: { formula: 'D6*E6', preview: 1920 },
              margem: { formula: '(F6-E6)/F6', preview: 0.5997 },
            },
            {
              sku: 'PRD-003',
              produto: 'Suporte Ergonômico Notebook',
              categoria: 'Escritório',
              qtd: 18,
              custo: 52,
              preco: 129.0,
              total_estoque: { formula: 'D7*E7', preview: 936 },
              margem: { formula: '(F7-E7)/F7', preview: 0.5969 },
            },
            {
              sku: 'PRD-004',
              produto: 'Teclado Mecânico Compacto',
              categoria: 'Periféricos',
              qtd: 12,
              custo: 165,
              preco: 329.0,
              total_estoque: { formula: 'D8*E8', preview: 1980 },
              margem: { formula: '(F8-E8)/F8', preview: 0.4985 },
            },
            {
              sku: 'PRD-005',
              produto: 'Mouse Sem Fio Silencioso',
              categoria: 'Periféricos',
              qtd: 35,
              custo: 39,
              preco: 89.9,
              total_estoque: { formula: 'D9*E9', preview: 1365 },
              margem: { formula: '(F9-E9)/F9', preview: 0.5662 },
            },
          ],
          summaryRow: {
            sku: 'TOTAL',
            produto: 'Resumo Geral do Estoque',
            categoria: '5 SKUs',
            qtd: { formula: 'SUM(D5:D9)', preview: 129 },
            custo: { formula: 'AVERAGE(E5:E9)', preview: 79.8 },
            preco: { formula: 'AVERAGE(F5:F9)', preview: 171.54 },
            total_estoque: { formula: 'SUM(G5:G9)', preview: 8481 },
            margem: { formula: 'AVERAGE(H5:H9)', preview: 0.5522 },
          },
        },
        {
          name: 'Vendas do Mês',
          description: 'Registro de vendas por canal com faturamento consolidado.',
          columns: [
            { key: 'data', header: 'Data', type: 'date', width: 14 },
            { key: 'produto', header: 'Produto', type: 'text', width: 28 },
            { key: 'canal', header: 'Canal', type: 'text', width: 16 },
            { key: 'unidades', header: 'Unidades', type: 'number', width: 12 },
            { key: 'valor_unit', header: 'Valor Unit.', type: 'currency', width: 15 },
            { key: 'faturamento', header: 'Faturamento', type: 'currency', width: 16 },
          ],
          rows: [
            { data: '03/11/2026', produto: 'Fone Bluetooth Pro', canal: 'WhatsApp', unidades: 6, valor_unit: 189.9, faturamento: { formula: 'D5*E5', preview: 1139.4 } },
            { data: '07/11/2026', produto: 'Carregador Turbo 65W', canal: 'Loja Física', unidades: 11, valor_unit: 119.9, faturamento: { formula: 'D6*E6', preview: 1318.9 } },
            { data: '12/11/2026', produto: 'Teclado Mecânico Compacto', canal: 'Site Próprio', unidades: 4, valor_unit: 329.0, faturamento: { formula: 'D7*E7', preview: 1316.0 } },
            { data: '16/11/2026', produto: 'Mouse Sem Fio Silencioso', canal: 'Marketplace', unidades: 9, valor_unit: 89.9, faturamento: { formula: 'D8*E8', preview: 809.1 } },
          ],
          summaryRow: {
            data: 'TOTAL',
            produto: 'Consolidado de Vendas',
            canal: '4 pedidos',
            unidades: { formula: 'SUM(D5:D8)', preview: 30 },
            valor_unit: { formula: 'AVERAGE(E5:E8)', preview: 182.18 },
            faturamento: { formula: 'SUM(F5:F8)', preview: 4583.4 },
          },
        },
      ],
    };
  }

  if (presetId === 'orcamento_projeto') {
    return {
      id,
      title: customTitle?.trim() || 'Orçamento de Projeto & Cronograma',
      subtitle: 'Comparativo de previsto vs. realizado com cálculo de variação e saldo disponível',
      category: 'projeto',
      source: 'modelo_pronto',
      modelUsed: 'iris-template-xlsx',
      createdAt,
      sheets: [
        {
          name: 'Orçamento',
          description: 'Controle financeiro por etapa com fórmula automática de diferença e desvio.',
          columns: [
            { key: 'etapa', header: 'Etapa / Item', type: 'text', width: 28 },
            { key: 'responsavel', header: 'Responsável', type: 'text', width: 18 },
            { key: 'previsto', header: 'Previsto (R$)', type: 'currency', width: 16 },
            { key: 'realizado', header: 'Realizado (R$)', type: 'currency', width: 16 },
            { key: 'saldo', header: 'Saldo / Economia', type: 'currency', width: 18 },
            { key: 'desvio', header: 'Desvio %', type: 'percent', width: 13 },
          ],
          rows: [
            { etapa: 'Planejamento & Licenças', responsavel: 'Coordenação', previsto: 2500, realizado: 2300, saldo: { formula: 'C5-D5', preview: 200 }, desvio: { formula: '(D5-C5)/C5', preview: -0.08 } },
            { etapa: 'Materiais & Equipamentos', responsavel: 'Compras', previsto: 8400, realizado: 8950, saldo: { formula: 'C6-D6', preview: -550 }, desvio: { formula: '(D6-C6)/C6', preview: 0.0655 } },
            { etapa: 'Mão de Obra Especializada', responsavel: 'Equipe Técnica', previsto: 6200, realizado: 6000, saldo: { formula: 'C7-D7', preview: 200 }, desvio: { formula: '(D7-C7)/C7', preview: -0.0323 } },
            { etapa: 'Testes & Acabamento', responsavel: 'Qualidade', previsto: 1900, realizado: 1550, saldo: { formula: 'C8-D8', preview: 350 }, desvio: { formula: '(D8-C8)/C8', preview: -0.1842 } },
          ],
          summaryRow: {
            etapa: 'TOTAL DO PROJETO',
            responsavel: '4 etapas',
            previsto: { formula: 'SUM(C5:C8)', preview: 19000 },
            realizado: { formula: 'SUM(D5:D8)', preview: 18800 },
            saldo: { formula: 'SUM(E5:E8)', preview: 200 },
            desvio: { formula: '(D9-C9)/C9', preview: -0.0105 },
          },
        },
        {
          name: 'Cronograma',
          description: 'Marcos de entrega e percentual concluído.',
          columns: [
            { key: 'marco', header: 'Marco', type: 'text', width: 30 },
            { key: 'inicio', header: 'Início', type: 'date', width: 14 },
            { key: 'entrega', header: 'Entrega', type: 'date', width: 14 },
            { key: 'status', header: 'Status', type: 'text', width: 16 },
            { key: 'progresso', header: 'Progresso', type: 'percent', width: 14 },
          ],
          rows: [
            { marco: 'Aprovação de Escopo', inicio: '01/11/2026', entrega: '05/11/2026', status: 'Concluído', progresso: 1 },
            { marco: 'Aquisição de Materiais', inicio: '06/11/2026', entrega: '12/11/2026', status: 'Concluído', progresso: 1 },
            { marco: 'Execução Principal', inicio: '13/11/2026', entrega: '24/11/2026', status: 'Em andamento', progresso: 0.7 },
            { marco: 'Revisão Final & Entrega', inicio: '25/11/2026', entrega: '30/11/2026', status: 'Planejado', progresso: 0.15 },
          ],
          summaryRow: {
            marco: 'Média Geral de Avanço',
            inicio: '01/11/2026',
            entrega: '30/11/2026',
            status: 'No prazo',
            progresso: { formula: 'AVERAGE(E5:E8)', preview: 0.7125 },
          },
        },
      ],
    };
  }

  if (presetId === 'plano_estudos') {
    return {
      id,
      title: customTitle?.trim() || 'Monitor de Estudos & Revisões',
      subtitle: 'Organização semanal de disciplinas, carga horária e desempenho em simulados',
      category: 'estudos',
      source: 'modelo_pronto',
      modelUsed: 'iris-template-xlsx',
      createdAt,
      sheets: [
        {
          name: 'Plano Semanal',
          description: 'Distribuição de horas planejadas e cumpridas por matéria.',
          columns: [
            { key: 'materia', header: 'Matéria / Tema', type: 'text', width: 26 },
            { key: 'dia', header: 'Dias Foco', type: 'text', width: 16 },
            { key: 'meta_h', header: 'Meta (h)', type: 'number', width: 12 },
            { key: 'feito_h', header: 'Realizado (h)', type: 'number', width: 14 },
            { key: 'cumprimento', header: 'Cumprimento', type: 'percent', width: 14 },
            { key: 'status', header: 'Status', type: 'text', width: 16 },
          ],
          rows: [
            { materia: 'Inglês — Conversação & Listening', dia: 'Seg / Qua / Sex', meta_h: 4.5, feito_h: 4.5, cumprimento: { formula: 'D5/C5', preview: 1 }, status: 'Meta batida' },
            { materia: 'Matemática & Raciocínio Lógico', dia: 'Ter / Qui', meta_h: 4, feito_h: 3.5, cumprimento: { formula: 'D6/C6', preview: 0.875 }, status: 'Em progresso' },
            { materia: 'Leitura & Redação Prática', dia: 'Qua / Sáb', meta_h: 3, feito_h: 3, cumprimento: { formula: 'D7/C7', preview: 1 }, status: 'Meta batida' },
            { materia: 'Tecnologia & Ferramentas IA', dia: 'Sáb / Dom', meta_h: 3.5, feito_h: 2.5, cumprimento: { formula: 'D8/C8', preview: 0.7143 }, status: 'Revisar' },
          ],
          summaryRow: {
            materia: 'TOTAL DA SEMANA',
            dia: '7 dias',
            meta_h: { formula: 'SUM(C5:C8)', preview: 15 },
            feito_h: { formula: 'SUM(D5:D8)', preview: 13.5 },
            cumprimento: { formula: 'D9/C9', preview: 0.9 },
            status: 'Ótimo ritmo',
          },
        },
        {
          name: 'Simulados',
          description: 'Histórico de acertos e taxa média de evolução.',
          columns: [
            { key: 'data', header: 'Data', type: 'date', width: 14 },
            { key: 'tema', header: 'Simulado', type: 'text', width: 28 },
            { key: 'questoes', header: 'Questões', type: 'number', width: 12 },
            { key: 'acertos', header: 'Acertos', type: 'number', width: 12 },
            { key: 'aproveitamento', header: 'Aproveitamento', type: 'percent', width: 16 },
          ],
          rows: [
            { data: '02/11/2026', tema: 'Simulado Geral #01', questoes: 40, acertos: 30, aproveitamento: { formula: 'D5/C5', preview: 0.75 } },
            { data: '09/11/2026', tema: 'Simulado Geral #02', questoes: 40, acertos: 33, aproveitamento: { formula: 'D6/C6', preview: 0.825 } },
            { data: '16/11/2026', tema: 'Simulado Geral #03', questoes: 40, acertos: 36, aproveitamento: { formula: 'D7/C7', preview: 0.9 } },
          ],
          summaryRow: {
            data: 'MÉDIA',
            tema: 'Evolução Consolidada',
            questoes: { formula: 'SUM(C5:C7)', preview: 120 },
            acertos: { formula: 'SUM(D5:D7)', preview: 99 },
            aproveitamento: { formula: 'AVERAGE(E5:E7)', preview: 0.825 },
          },
        },
      ],
    };
  }

  // Default: financeiro_mensal
  return {
    id,
    title: customTitle?.trim() || 'Controle Financeiro Mensal',
    subtitle: 'Receitas, despesas organizadas por categoria e resumo mensal com saldo automático',
    category: 'financas',
    source: 'modelo_pronto',
    modelUsed: 'iris-template-xlsx',
    createdAt,
    sheets: [
      {
        name: 'Receitas',
        description: 'Todas as entradas previstas e recebidas no mês.',
        columns: [
          { key: 'data', header: 'Data', type: 'date', width: 14 },
          { key: 'fonte', header: 'Fonte de Receita', type: 'text', width: 28 },
          { key: 'categoria', header: 'Tipo', type: 'text', width: 16 },
          { key: 'valor', header: 'Valor (R$)', type: 'currency', width: 16 },
          { key: 'status', header: 'Status', type: 'text', width: 14 },
        ],
        rows: [
          { data: '05/11/2026', fonte: 'Salário / Pró-labore', categoria: 'Fixa', valor: 7200, status: 'Recebido' },
          { data: '12/11/2026', fonte: 'Consultoria / Projeto Extra', categoria: 'Variável', valor: 1850, status: 'Recebido' },
          { data: '18/11/2026', fonte: 'Rendimentos & Dividendos', categoria: 'Investimentos', valor: 420, status: 'Recebido' },
        ],
        summaryRow: {
          data: 'TOTAL',
          fonte: 'Total de Receitas do Mês',
          categoria: '3 entradas',
          valor: { formula: 'SUM(D5:D7)', preview: 9470 },
          status: '100% recebido',
        },
      },
      {
        name: 'Despesas',
        description: 'Gastos fixos e variáveis com acompanhamento de pagamento.',
        columns: [
          { key: 'vencimento', header: 'Vencimento', type: 'date', width: 14 },
          { key: 'descricao', header: 'Descrição', type: 'text', width: 28 },
          { key: 'categoria', header: 'Categoria', type: 'text', width: 18 },
          { key: 'valor', header: 'Valor (R$)', type: 'currency', width: 16 },
          { key: 'status', header: 'Situação', type: 'text', width: 14 },
        ],
        rows: [
          { vencimento: '05/11/2026', descricao: 'Aluguel & Condomínio', categoria: 'Moradia', valor: 2350, status: 'Pago' },
          { vencimento: '10/11/2026', descricao: 'Supermercado & Feira', categoria: 'Alimentação', valor: 1480, status: 'Pago' },
          { vencimento: '12/11/2026', descricao: 'Energia, Água & Internet', categoria: 'Contas Fixas', valor: 540, status: 'Pago' },
          { vencimento: '15/11/2026', descricao: 'Transporte & Combustível', categoria: 'Mobilidade', valor: 620, status: 'Pago' },
          { vencimento: '20/11/2026', descricao: 'Saúde & Academia', categoria: 'Bem-estar', valor: 490, status: 'Pago' },
          { vencimento: '25/11/2026', descricao: 'Lazer & Assinaturas', categoria: 'Estilo de Vida', valor: 410, status: 'Previsto' },
        ],
        summaryRow: {
          vencimento: 'TOTAL',
          descricao: 'Total de Despesas do Mês',
          categoria: '6 lançamentos',
          valor: { formula: 'SUM(D5:D10)', preview: 5890 },
          status: 'Sob controle',
        },
      },
      {
        name: 'Resumo Mensal',
        description: 'Consolidado automático conectado às abas Receitas e Despesas.',
        columns: [
          { key: 'indicador', header: 'Indicador Financeiro', type: 'text', width: 30 },
          { key: 'valor', header: 'Valor (R$)', type: 'currency', width: 18 },
          { key: 'participacao', header: '% da Receita', type: 'percent', width: 16 },
          { key: 'observacao', header: 'Observação', type: 'text', width: 32 },
        ],
        rows: [
          {
            indicador: 'Total de Receitas',
            valor: { formula: 'Receitas!D8', preview: 9470 },
            participacao: 1,
            observacao: 'Entradas confirmadas no período',
          },
          {
            indicador: 'Total de Despesas',
            valor: { formula: 'Despesas!D11', preview: 5890 },
            participacao: { formula: 'B6/B5', preview: 0.622 },
            observacao: 'Gastos fixos + variáveis do mês',
          },
          {
            indicador: 'Saldo Líquido (Sobra)',
            valor: { formula: 'B5-B6', preview: 3580 },
            participacao: { formula: 'B7/B5', preview: 0.378 },
            observacao: 'Disponível para reserva e metas',
          },
          {
            indicador: 'Meta Sugerida de Reserva (20%)',
            valor: { formula: 'B5*0.2', preview: 1894 },
            participacao: 0.2,
            observacao: 'Meta saudável acima do mínimo',
          },
        ],
      },
    ],
  };
}
