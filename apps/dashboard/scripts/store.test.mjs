import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const storeView = read('../src/components/SkillsManagerView.tsx');
const app = read('../src/App.tsx');
const rail = read('../src/components/navigation/PrimaryRail.tsx');

test('OpenBot Store has sub-sidebar with navigation and Seus apps', () => {
  assert.ok(storeView.includes('Loja'), 'Store sub-sidebar must have Loja title');
  assert.ok(storeView.includes("setActiveStoreTab('apps')"), 'Apps tab navigation must exist');
  assert.ok(storeView.includes("setActiveStoreTab('agents')"), 'Agents tab navigation must exist');
  assert.ok(storeView.includes("setActiveStoreTab('skills')"), 'Skills tab navigation must exist');
  assert.ok(storeView.includes('Seus apps'), 'Seus apps section must exist in sidebar');
});

test('OpenBot Store Apps view matches screenshot structure and controls', () => {
  // Title & Subtitle
  assert.ok(storeView.includes('Conecte as ferramentas e os serviços com que seus agentes trabalham.'), 'Must have exact subtitle');

  // Action row
  assert.ok(storeView.includes('Adicionar personalizado'), 'Must have "+ Adicionar personalizado" button');
  assert.ok(storeView.includes('placeholder="Buscar"'), 'Must have search bar with "Buscar" placeholder');

  // Categories
  assert.ok(storeView.includes('Produtividade'), 'Produtividade category must exist');
  assert.ok(storeView.includes('Documentos'), 'Documentos category must exist');
  assert.ok(storeView.includes('Ver tudo'), 'Ver tudo link must exist');

  // Apps from screenshot
  assert.ok(storeView.includes('Slack'), 'Slack card must exist');
  assert.ok(storeView.includes('Discord'), 'Discord card must exist');
  assert.ok(storeView.includes('Telegram'), 'Telegram card must exist');
  assert.ok(storeView.includes('WhatsApp'), 'WhatsApp card must exist');
  assert.ok(storeView.includes('1Password'), '1Password card must exist');
  assert.ok(storeView.includes('Bitwarden'), 'Bitwarden card must exist');
  assert.ok(storeView.includes('Coda'), 'Coda card must exist');
  assert.ok(storeView.includes('Craft'), 'Craft card must exist');
  assert.ok(storeView.includes('Dropbox'), 'Dropbox card must exist');
  assert.ok(storeView.includes('Evernote'), 'Evernote card must exist');
});

test('OpenBot Store default connected apps match the screenshot', () => {
  assert.ok(storeView.includes("'telegram'"), 'Telegram should be in default connected list');
  assert.ok(storeView.includes("'whatsapp'"), 'WhatsApp should be in default connected list');
  assert.ok(storeView.includes("'github'"), 'GitHub should be in default connected list');
  assert.ok(storeView.includes("'canva'"), 'Canva should be in default connected list');
  assert.ok(storeView.includes("'vercel'"), 'Vercel should be in default connected list');
  assert.ok(storeView.includes("'context7'"), 'Context7 should be in default connected list');
  assert.ok(storeView.includes("'huggingface'"), 'Hugging Face should be in default connected list');
  assert.ok(storeView.includes('jarvis_connected_apps'), 'Must persist connected apps under jarvis_connected_apps');
});

test('OpenBot Store full-screen layout integration in App.tsx', () => {
  assert.ok(app.includes("activeTab !== 'skills'"), 'App shell must suppress secondary header in Loja');
  assert.ok(app.includes("activeTab === 'skills' ? 'hidden' : 'auto'"), 'App shell must set hidden overflow for Loja');
  assert.ok(rail.includes("activeTab === 'skills'"), 'PrimaryRail must support active Loja tab');
});
