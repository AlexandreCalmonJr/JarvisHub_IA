import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const chatMaster = read('../src/components/ChatMaster.tsx');
const chatHeader = read('../src/components/chat/OpenBotChatHeader.tsx');
const convRail = read('../src/components/chat/OpenBotConversationRail.tsx');
const bubble = read('../src/components/chat/MessageBubble.tsx');
const tasksView = read('../src/components/TaskManagerView.tsx');

test('OpenBot Fase 2: ChatMaster integrates OpenBotConversationRail and OpenBotChatHeader', () => {
  assert.match(chatMaster, /<OpenBotConversationRail/);
  assert.match(chatMaster, /<OpenBotChatHeader/);
  assert.match(chatMaster, /handleSelectSession/);
  assert.match(chatMaster, /handleOpenNewChatTab/);
});

test('OpenBot Fase 2: ChatHeader supports tabs, drawer toggle and model selector', () => {
  assert.match(chatHeader, /openbot-tab-pill/);
  assert.match(chatHeader, /openbot-model-pill/);
  assert.match(chatHeader, /ollama\/qwen2\.5-coder:7b/);
  assert.match(chatHeader, /onToggleRail/);
});

test('OpenBot Fase 2: Conversation Rail has search, Sem seção, and squircle avatars', () => {
  assert.match(convRail, /openbot-conv-rail/);
  assert.match(convRail, /openbot-session-card/);
  assert.match(convRail, /Sem seção/);
  assert.match(convRail, /QA Tester/);
  assert.match(convRail, /Bug Fixer/);
});

test('OpenBot Fase 2: MessageBubble features OpenBot coral bubble and collapsible X etapas', () => {
  assert.match(bubble, /openbot-coral-bubble/);
  assert.match(bubble, /openbot-step-pill/);
  assert.match(bubble, /etapas/);
  assert.match(bubble, /#e05244/);
});

test('OpenBot Fase 2: Tasks Hub tem hero, cápsula de delegação e grupos derivados das tarefas reais', () => {
  assert.match(tasksView, /Delegue o trabalho\./);
  assert.match(tasksView, /Volte para uma resposta\./);
  assert.match(tasksView, /openbot-tasks-gradient/);
  assert.match(tasksView, /openbot-delegation-capsule/);
  // Os grupos são calculados a partir de `tasks`, nunca de linhas fixas.
  assert.match(tasksView, /tasks\.filter\(\(t\) => !t\.is_completed\)/);
  assert.match(tasksView, /tasks\.filter\(\(t\) => t\.is_completed\)/);
  assert.match(tasksView, /Em andamento/);
  assert.match(tasksView, /Concluídas/);
  // Sem dados inventados no hub.
  assert.doesNotMatch(tasksView, /Northwind Traders/);
  assert.doesNotMatch(tasksView, /arxiv\.org/);
  assert.doesNotMatch(tasksView, /processos seletivos/);
  assert.doesNotMatch(tasksView, /\|\| 1\}/);
});

test('OpenBot Fase 2: delegação executa o especialista real pela API', () => {
  assert.match(tasksView, /\/agents\/\$\{encodeURIComponent\(selectedAgentRole\)\}\/task/);
  assert.match(tasksView, /ALL_26_AGENTS/);
  assert.doesNotMatch(tasksView, /'task_' \+ Date\.now\(\)/);
});
