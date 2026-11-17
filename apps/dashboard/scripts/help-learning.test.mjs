import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, relPath), 'utf8');

const learningCode = read('../src/components/LearningCenterView.tsx');
const railCode = read('../src/components/navigation/PrimaryRail.tsx');
const appCode = read('../src/App.tsx');
const routerCode = read('../src/router.ts');

test('LearningCenterView implements OpenBot Novidades & Ajuda sub-tabs and 26 agents guide', () => {
  assert.ok(learningCode.includes("'news'"), 'Must include Novidades v3.0.1 sub-tab');
  assert.ok(learningCode.includes("'changelog'"), 'Must include changelog sub-tab');
  assert.ok(learningCode.includes("'agents_guide'"), 'Must include 26 specialists guide sub-tab');
  assert.ok(learningCode.includes("'react_architecture'"), 'Must include ReAct architecture sub-tab');
  assert.ok(learningCode.includes("'ollama_local'"), 'Must include Ollama local offline guide sub-tab');
  assert.ok(learningCode.includes("'faq'"), 'Must include FAQ sub-tab');
  assert.ok(learningCode.includes("'shortcuts'"), 'Must include shortcuts sub-tab');
  assert.ok(learningCode.includes("'lessons'"), 'Must include lessons & tutorials sub-tab');
  assert.ok(learningCode.includes('ALL_26_AGENTS'), 'Must integrate ALL_26_AGENTS catalog');
});

test('LearningCenterView maintains backward-compatible 21 lessons and server sync', () => {
  assert.ok(learningCode.includes("API_BASE + '/learning/progress'"), 'Must synchronize progress with backend endpoint');
  assert.ok(learningCode.includes('jarvis_learning_progress_v1'), 'Must cache progress in localStorage');
  assert.ok(learningCode.includes('LESSONS.length'), 'Must track total lessons');
  assert.ok(learningCode.includes('startChatWithAgent'), 'Must provide action to chat directly with specialists');
});

test('PrimaryRail and App.tsx route seamlessly to Novidades & Ajuda', () => {
  assert.ok(railCode.includes("activeTab === 'learning'"), 'PrimaryRail must support active learning tab');
  assert.ok(railCode.includes("title=\"Novidades & Ajuda\""), 'Help button must have Novidades & Ajuda tooltip');
  assert.ok(appCode.includes("onOpenHelp={() => navigate('learning')}"), 'App shell must route help click to learning');
  assert.ok(appCode.includes("activeTab !== 'learning'"), 'App shell must suppress legacy header on learning view');
  assert.ok(routerCode.includes("learning: '/learning'"), 'Router must declare /learning path');
  assert.ok(routerCode.includes("help: 'learning'"), 'Router must alias help to learning');
});
