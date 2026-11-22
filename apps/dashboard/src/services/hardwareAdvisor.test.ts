import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HARDWARE_PROFILES,
  computeAgentRecommendations,
  estimateVramGbFromModelName,
  evaluateVramFit,
} from './hardwareAdvisor.ts';

test('estimateVramGbFromModelName estimates VRAM tiers from parameter count', () => {
  assert.equal(estimateVramGbFromModelName('llama3.2:3b'), 2.8);
  assert.equal(estimateVramGbFromModelName('llama3.1:8b'), 5.4);
  assert.equal(estimateVramGbFromModelName('qwen2.5-coder:14b'), 9.6);
  assert.equal(estimateVramGbFromModelName('Qwen/Qwen2.5-32B-Instruct'), 20.0);
});

test('evaluateVramFit classifies GPU smooth vs CPU/RAM vs recommend online', () => {
  const rtx4060 = DEFAULT_HARDWARE_PROFILES[0]; // 8GB VRAM, 32GB RAM
  const integrated = DEFAULT_HARDWARE_PROFILES[1]; // 2GB VRAM, 16GB RAM

  assert.equal(evaluateVramFit(4.8, rtx4060).tier, 'gpu_smooth');
  assert.equal(evaluateVramFit(9.6, rtx4060).tier, 'cpu_ok');
  assert.equal(evaluateVramFit(20.0, integrated).tier, 'recommend_online');
});

test('computeAgentRecommendations recommends local model for Security and Gemini Online for Design when Hugging Face disconnects', () => {
  const rtx4060 = DEFAULT_HARDWARE_PROFILES[0];
  const agents = [
    { role: 'sentinel_security', name: 'Sentinela de Segurança', proper_name: 'Kira', category: 'security' },
    { role: 'ux_ui_designer', name: 'Designer Visual', proper_name: 'Vega', category: 'design' },
    { role: 'frontend_mobile_developer', name: 'Dev Frontend', proper_name: 'Neo', category: 'dev' },
  ];

  const recs = computeAgentRecommendations(
    rtx4060,
    { ollama_connected: true, huggingface_connected: false, gemini_connected: true },
    ['llama3.1:8b', 'qwen2.5-coder:7b'],
    agents
  );

  const kira = recs.find((r) => r.agent_role === 'sentinel_security')!;
  const vega = recs.find((r) => r.agent_role === 'ux_ui_designer')!;
  const neo = recs.find((r) => r.agent_role === 'frontend_mobile_developer')!;

  assert.equal(kira.execution_mode, 'LOCAL');
  assert.equal(kira.recommended_model, 'llama3.1:8b');
  assert.match(kira.reason, /Hugging Face desconectado/i);

  assert.equal(vega.execution_mode, 'ONLINE');
  assert.equal(vega.recommended_model, 'gemini-4-hydrogen');
  assert.match(vega.reason, /Gemini Online/i);

  assert.equal(neo.execution_mode, 'LOCAL');
  assert.equal(neo.fit_tier, 'gpu_smooth');
});

test('computeAgentRecommendations falls back to Gemini Online for security if Ollama disconnects', () => {
  const integrated = DEFAULT_HARDWARE_PROFILES[1];
  const recs = computeAgentRecommendations(
    integrated,
    { ollama_connected: false, huggingface_connected: false, gemini_connected: true },
    [],
    [{ role: 'sentinel_security', name: 'Sentinela', proper_name: 'Kira', category: 'security' }]
  );

  assert.equal(recs[0].execution_mode, 'ONLINE');
  assert.equal(recs[0].provider, 'gemini');
});
