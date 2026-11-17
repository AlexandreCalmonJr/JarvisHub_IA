import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const settingsView = read('../src/components/settings/SettingsView.tsx');
const router = read('../src/router.ts');
const app = read('../src/App.tsx');
const primaryRail = read('../src/components/navigation/PrimaryRail.tsx');

test('OpenBot SettingsView implements all specification tabs and sections', () => {
  // Top group
  assert.ok(settingsView.includes("id: 'general', label: 'Geral'"), 'General tab must exist');
  assert.ok(settingsView.includes("id: 'appearance', label: 'Aparência'"), 'Appearance tab must exist');
  assert.ok(settingsView.includes("id: 'notifications', label: 'Notificações'"), 'Notifications tab must exist');
  assert.ok(settingsView.includes("id: 'voice', label: 'Voz'"), 'Voice tab must exist');

  // Conta group
  assert.ok(settingsView.includes("title: 'Conta'"), 'Conta section must exist');
  assert.ok(settingsView.includes("id: 'profile', label: 'Perfil'"), 'Profile tab must exist');
  assert.ok(settingsView.includes("id: 'billing', label: 'Cobrança'"), 'Billing tab must exist');
  assert.ok(settingsView.includes("id: 'mobile', label: 'Conectar celular'"), 'Mobile tab must exist');

  // Este computador group
  assert.ok(settingsView.includes("title: 'Este computador'"), 'Este computador section must exist');
  assert.ok(settingsView.includes("id: 'behavior', label: 'Comportamento do app'"), 'Behavior tab must exist');
  assert.ok(settingsView.includes("id: 'island', label: 'Dynamic Island'"), 'Dynamic Island tab must exist');
  assert.ok(settingsView.includes("id: 'dock', label: 'Dock de agentes'"), 'Agent Dock tab must exist');
  assert.ok(settingsView.includes("id: 'computer', label: 'Uso do computador'"), 'Computer usage tab must exist');
  assert.ok(settingsView.includes("id: 'updates', label: 'Atualizações'"), 'Updates tab must exist');

  // Footer server settings
  assert.ok(settingsView.includes("Configurações do servidor"), 'Server settings button must exist');
});

test('OpenBot General settings match the exact screenshot controls', () => {
  // Conversas section
  assert.ok(settingsView.includes('Atalho de envio'), 'Atalho de envio control must exist');
  assert.ok(settingsView.includes('Ordenar conversas'), 'Ordenar conversas control must exist');
  assert.ok(settingsView.includes('Mostrar etapas do agente'), 'Mostrar etapas do agente control must exist');
  assert.ok(settingsView.includes('Ações de mensagem compactas'), 'Ações de mensagem compactas control must exist');
  assert.ok(settingsView.includes('Abrir links externos em'), 'Abrir links externos em control must exist');

  // Permissões section
  assert.ok(settingsView.includes('Vincular a análise à minha conta'), 'Vincular a análise à minha conta must exist');

  // Account-scoped persistence
  assert.ok(settingsView.includes('jarvis_openbot_general_settings'), 'Must use jarvis_openbot_general_settings key');
  assert.ok(settingsView.includes('getAccountStorageKey'), 'Must scope storage key to active account');
});

test('OpenBot Profile and Mobile Pairing are integrated', () => {
  assert.ok(settingsView.includes('getUserProfile'), 'Must read user profile data');
  assert.ok(settingsView.includes('saveUserProfile'), 'Must save user profile data');
  assert.ok(settingsView.includes('jarvis:open-android-pairing'), 'Must trigger android pairing modal');
});

test('Settings route is registered in router, app shell and rail', () => {
  assert.ok(router.includes("settings: '/settings'"), 'Router must register /settings path');
  assert.ok(app.includes("activeTab === 'settings'"), 'App shell must render settings tab');
  assert.ok(app.includes('SettingsView'), 'App shell must import SettingsView');
  assert.ok(primaryRail.includes("activeTab === 'settings'"), 'PrimaryRail must reflect active settings state');
});

test('OpenBot Server Settings tab implements complete host, database, and runtime administration', () => {
  // Access and Users
  assert.ok(settingsView.includes('Gestão de Acessos & Usuários'), 'Access management card must exist');
  assert.ok(settingsView.includes('jarvis:open-access-management'), 'Must trigger open access management event');
  assert.ok(settingsView.includes('Expiração de Sessão & Tokens JWT'), 'JWT expiration control must exist');

  // Network and Host
  assert.ok(settingsView.includes('Endereço de Bind da Instância'), 'Bind address control must exist');
  assert.ok(settingsView.includes('Porta da API FastAPI'), 'FastAPI port control must exist');
  assert.ok(settingsView.includes('/ws/events'), 'WebSocket endpoint must be declared');

  // Database and Storage
  assert.ok(settingsView.includes('data/jarvis.db'), 'SQLite database path must be declared');
  assert.ok(settingsView.includes('WAL Mode Ativo'), 'WAL mode badge must exist');
  assert.ok(settingsView.includes('Otimizar (VACUUM)'), 'Database vacuum action must exist');
  assert.ok(settingsView.includes('/api/v1/system/backup'), 'Real backup endpoint must be integrated');

  // Local AI runtime (Ollama)
  assert.ok(settingsView.includes('Endpoint do Servidor Ollama'), 'Ollama endpoint must exist');
  assert.ok(settingsView.includes('Janela de Contexto Padrão'), 'Context window control must exist');

  // Server logs and diagnostics
  assert.ok(settingsView.includes('Nível de Detalhe dos Logs'), 'Log verbosity selector must exist');
  assert.ok(settingsView.includes('Exportar Diagnóstico'), 'Export diagnostics action must exist');

  // Other tabs have real interactive options
  assert.ok(settingsView.includes('Tema do Sistema'), 'Appearance theme selector must exist');
  assert.ok(settingsView.includes('Conclusão de Tarefas Longas'), 'Task completion notification toggle must exist');
  assert.ok(settingsView.includes('Plano da Instância: Community Edition'), 'Billing community status must exist');
  assert.ok(settingsView.includes('Restringir Leitura aos Workspaces'), 'Computer workspace restriction toggle must exist');
  assert.ok(settingsView.includes('Canal de Atualização'), 'Update channel selector must exist');
});
