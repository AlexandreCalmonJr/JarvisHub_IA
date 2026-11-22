import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo } from '../types';
import { resolveDockAgents, resolveQuickChatAgents } from './agentSync';

const sampleAgents: AgentInfo[] = [
  {
    role: 'jarvis_master',
    name: 'Maestro Orquestrador',
    proper_name: 'Maestro',
    handle: '@maestro',
    mission: 'Orquestra especialistas.',
    preferred_model: 'gemini-4-hydrogen',
    is_read_only: false,
    allowed_tools: [],
    mascot: { id: 'maestro_slime', color: '#f97316', accessory: 'headphones', mood: 'idle' },
  },
  {
    role: 'sentinel_security',
    name: 'Sentinela de Segurança',
    proper_name: 'Kira',
    handle: '@kira',
    mission: 'Audita PDFs e segurança.',
    preferred_model: 'llama3.1:8b',
    is_read_only: true,
    allowed_tools: [],
    mascot: { id: 'sentinel_owl', color: '#10b981', accessory: 'shield', mood: 'idle' },
  },
  {
    role: 'software_architect',
    name: 'Arquiteto de Software',
    proper_name: 'Orion',
    handle: '@orion',
    mission: 'Define arquitetura.',
    preferred_model: 'qwen2.5-coder:7b',
    is_read_only: true,
    allowed_tools: [],
    mascot: { id: 'coder_slime', color: '#2dd4bf', accessory: 'visor', mood: 'idle' },
  },
  {
    role: 'advogado_tributario',
    name: 'Advogado Tributário',
    proper_name: 'Lucas',
    handle: '@lucas',
    mission: 'Analisa impostos e contratos.',
    preferred_model: 'gemini-4-hydrogen',
    is_read_only: true,
    is_custom: true,
    allowed_tools: [],
    mascot: { id: 'scholar_fox', color: '#6366f1', accessory: 'glasses', mood: 'idle' },
  },
];

test('resolveDockAgents lists all installed user agents with custom agents first and accurate canUninstall flags', () => {
  const dock = resolveDockAgents(sampleAgents);
  assert.equal(dock.length, 4);
  assert.equal(dock[0].properName, 'Lucas');
  assert.equal(dock[0].role, 'advogado_tributario');
  assert.equal(dock[0].canUninstall, true);

  const maestro = dock.find((d) => d.role === 'jarvis_master');
  assert.ok(maestro);
  assert.equal(maestro.canUninstall, false);

  const kira = dock.find((d) => d.role === 'sentinel_security');
  assert.ok(kira);
  assert.equal(kira.canUninstall, true);
});

test('resolveDockAgents filters installed agents by name, handle, role, or subtitle', () => {
  assert.equal(resolveDockAgents(sampleAgents, '@orion').length, 1);
  assert.equal(resolveDockAgents(sampleAgents, '@orion')[0].role, 'software_architect');
  assert.equal(resolveDockAgents(sampleAgents, 'Tributário').length, 1);
  assert.equal(resolveDockAgents(sampleAgents, 'inexistente_xyz').length, 0);
});

test('resolveQuickChatAgents uses agent_<role> session IDs and filters by proper name or handle', () => {
  const all = resolveQuickChatAgents(sampleAgents);
  assert.equal(all[0].id, 'agent_advogado_tributario');
  assert.equal(all[0].properName, 'Lucas');

  const filtered = resolveQuickChatAgents(sampleAgents, '@kira');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'agent_sentinel_security');
});
