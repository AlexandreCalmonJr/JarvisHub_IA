import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(import.meta.dirname, path), 'utf8');

const app = read('../src/App.tsx');
const primaryRail = read('../src/components/navigation/PrimaryRail.tsx');
const agentDock = read('../src/components/navigation/AgentDock.tsx');
const dynamicIsland = read('../src/components/navigation/DynamicIsland.tsx');
const styles = read('../src/index.css');

test('OpenBot Shell: App.tsx integrates PrimaryRail, AgentDock, and DynamicIsland', () => {
  assert.ok(app.includes('<DynamicIsland'), 'App must render DynamicIsland');
  assert.ok(app.includes('<PrimaryRail'), 'App must render PrimaryRail');
  assert.ok(app.includes('<AgentDock'), 'App must render AgentDock');
});

test('OpenBot Shell: PrimaryRail has 64px width, icons and pin toggles', () => {
  assert.ok(primaryRail.includes("width: '64px'"), 'PrimaryRail must be 64px wide');
  assert.ok(primaryRail.includes('togglePin'), 'PrimaryRail must support pinning/unpinning');
  assert.ok(primaryRail.includes('openbot-pin-popup'), 'PrimaryRail must contain pin popup menu');
  assert.ok(primaryRail.includes('JARVIS Hub Local'), 'PrimaryRail must have server indicator');
  assert.ok(primaryRail.includes('#f97316'), 'PrimaryRail must preserve the Jarvis orange identity');
  assert.ok(primaryRail.includes("fontWeight: 800"), 'PrimaryRail must render the J monogram');
});

test('OpenBot Shell: AgentDock has colorful 3D squircle avatars and add button', () => {
  assert.ok(agentDock.includes('openbot-agent-dock'), 'AgentDock class present');
  assert.ok(agentDock.includes('QA Tester'), 'Agent QA Tester present');
  assert.ok(agentDock.includes('Bug Fixer'), 'Agent Bug Fixer present');
  assert.ok(agentDock.includes('Copy Editor'), 'Agent Copy Editor present');
  assert.ok(agentDock.includes('Security'), 'Agent Security present');
  assert.ok(agentDock.includes('agent-dock-add-btn'), 'Add agent button present');
});

test('OpenBot Shell: DynamicIsland has floating notch, avatar and voice wave', () => {
  assert.ok(dynamicIsland.includes('openbot-dynamic-island'), 'DynamicIsland class present');
  assert.ok(dynamicIsland.includes('dynamic-island-soundwave'), 'Voice soundwave present');
  assert.ok(styles.includes('.openbot-dynamic-island'), 'DynamicIsland CSS animation defined');
  assert.ok(styles.includes('@keyframes soundwave-bar'), 'Soundwave bar animation defined');
});
