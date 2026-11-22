import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAppProjectFiles,
  buildPackageId,
  buildPresetAppBlueprint,
  detectAppPresetFromPrompt,
  slugifyAppName,
} from './appBuilderEngine.ts';

test('slugifyAppName and buildPackageId produce valid Android reverse-domain IDs', () => {
  assert.equal(slugifyAppName('Minha Loja & Caixa 24h!'), 'minha-loja-caixa-24h');
  const pkg = buildPackageId('123 Gestão Fácil');
  assert.match(pkg, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.equal(buildPackageId('Controle de Vendas'), 'br.jarvis.controledevendas');
});

test('detectAppPresetFromPrompt routes everyday ideas to matching presets', () => {
  assert.equal(detectAppPresetFromPrompt('App de hábitos saudáveis e rotina diária'), 'habitos_diarios');
  assert.equal(detectAppPresetFromPrompt('Agenda de clientes para meu salão'), 'agenda_servicos');
  assert.equal(detectAppPresetFromPrompt('Lista de compras de supermercado'), 'lista_compras');
  assert.equal(detectAppPresetFromPrompt('Controle de vendas para minha loja'), 'vendas_loja');
});

test('buildAppProjectFiles scaffolds Android-only project with Capacitor config and no Electron files', () => {
  const bp = buildPresetAppBlueprint('habitos_diarios', 'android');
  const files = buildAppProjectFiles(bp);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('www/index.html'));
  assert.ok(paths.includes('capacitor.config.json'));
  assert.ok(paths.includes('package.json'));
  assert.ok(paths.includes('README_GUIA_PASSO_A_PASSO.md'));
  assert.ok(!paths.includes('electron/main.cjs'));

  const html = files.find((f) => f.path === 'www/index.html')!.content;
  assert.ok(html.includes('Meus Hábitos &amp; Rotina'));
  assert.ok(html.includes('localStorage'));
});

test('buildAppProjectFiles scaffolds Windows-only project with Electron shell and no Capacitor config', () => {
  const bp = buildPresetAppBlueprint('vendas_loja', 'windows');
  const files = buildAppProjectFiles(bp);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('electron/main.cjs'));
  assert.ok(paths.includes('electron/preload.cjs'));
  assert.ok(!paths.includes('capacitor.config.json'));

  const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content);
  assert.equal(pkg.main, 'electron/main.cjs');
  assert.ok(pkg.scripts['win:exe']);
});

test('buildAppProjectFiles scaffolds unified Android + Windows multiplatform package', () => {
  const bp = buildPresetAppBlueprint('agenda_servicos', 'both', 'Agenda Studio');
  const files = buildAppProjectFiles(bp);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('capacitor.config.json'));
  assert.ok(paths.includes('electron/main.cjs'));
  assert.ok(paths.includes('www/index.html'));
  assert.ok(paths.includes('README_GUIA_PASSO_A_PASSO.md'));
});
