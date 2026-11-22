import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPresetSpreadsheetSpec,
  columnIndexToLetter,
  detectPresetFromPrompt,
  formatCellForPreview,
  sanitizeSheetName,
  spreadsheetToCsv,
} from './spreadsheetEngine.ts';

test('sanitizeSheetName strips Excel-illegal chars and enforces 31-char limit', () => {
  assert.equal(sanitizeSheetName('Vendas: 2026 / [Q1]*?'), 'Vendas 2026 Q1');
  const longName = 'Relatório Completo de Despesas Fixas e Variáveis Mensais 2026';
  assert.ok(sanitizeSheetName(longName).length <= 31);
  assert.equal(sanitizeSheetName('   ', 'Aba'), 'Aba');
});

test('columnIndexToLetter maps zero-based indexes to Excel letters', () => {
  assert.equal(columnIndexToLetter(0), 'A');
  assert.equal(columnIndexToLetter(25), 'Z');
  assert.equal(columnIndexToLetter(26), 'AA');
  assert.equal(columnIndexToLetter(27), 'AB');
});

test('buildPresetSpreadsheetSpec creates multi-sheet financial workbook with live Excel formulas', () => {
  const spec = buildPresetSpreadsheetSpec('financeiro_mensal');
  assert.equal(spec.sheets.length, 3);
  assert.deepEqual(
    spec.sheets.map((s) => s.name),
    ['Receitas', 'Despesas', 'Resumo Mensal']
  );

  const resumo = spec.sheets[2];
  const saldoRow = resumo.rows.find((r) => String(r.indicador).includes('Saldo'));
  assert.ok(saldoRow);
  assert.deepEqual(saldoRow.valor, { formula: 'B5-B6', preview: 3580 });
});

test('detectPresetFromPrompt routes everyday Portuguese requests to the right workbook preset', () => {
  assert.equal(detectPresetFromPrompt('Controle de estoque e margem da loja'), 'controle_estoque');
  assert.equal(detectPresetFromPrompt('Orçamento da reforma da cozinha'), 'orcamento_projeto');
  assert.equal(detectPresetFromPrompt('Plano de estudos para concurso e simulados'), 'plano_estudos');
  assert.equal(detectPresetFromPrompt('Planilha de gastos mensais da família'), 'financeiro_mensal');
});

test('spreadsheetToCsv exports UTF-8 BOM CSV and safely quotes commas and quotes', () => {
  const csv = spreadsheetToCsv({
    name: 'Teste',
    columns: [
      { key: 'nome', header: 'Item', type: 'text' },
      { key: 'valor', header: 'Valor', type: 'currency' },
      { key: 'pct', header: 'Taxa', type: 'percent' },
    ],
    rows: [
      { nome: 'Item "A", especial', valor: { formula: 'SUM(B2:B3)', preview: 150 }, pct: 0.25 },
    ],
  });

  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Item ""A"", especial",150,25.0%'));
  assert.equal(formatCellForPreview({ formula: 'SUM(B2:B3)', preview: 0.378 }, 'percent'), '37,8%');
});
