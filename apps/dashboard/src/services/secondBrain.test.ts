import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrainMemoryItem,
  computeTextEmbedding,
  cosineSimilarity,
  searchBrainMemories,
  distillConversationToMemory,
} from './secondBrain.ts';

const SAMPLE_MEMORIES: BrainMemoryItem[] = [
  {
    id: 'mem-1',
    title: 'Preferência de café da manhã da casa',
    content: 'Preferimos café coado sem açúcar e pão de queijo aos domingos.',
    layer: 'household',
    owner_user_id: 'admin',
    owner_name: 'João',
    agent_role: null,
    agent_name: null,
    source_kind: 'assistant_sync',
    source_label: 'Sincronizado João ↔ Maria',
    tags: ['casa', 'cafe', 'rotina'],
    pinned: true,
    confidence: 0.98,
    created_at: '2026-11-19T10:00:00Z',
    updated_at: '2026-11-19T10:00:00Z',
  },
  {
    id: 'mem-2',
    title: 'Vocabulário de inglês para reuniões',
    content: 'Expressões úteis: "Let us align on next steps" e "Could you clarify the timeline?"',
    layer: 'agent',
    owner_user_id: 'maria',
    owner_name: 'Maria',
    agent_role: 'english_tutor',
    agent_name: 'Clara',
    source_kind: 'chat_research',
    source_label: 'Aula com Clara',
    tags: ['ingles', 'reuniao', 'clara'],
    pinned: false,
    confidence: 0.91,
    created_at: '2026-11-19T11:00:00Z',
    updated_at: '2026-11-19T11:00:00Z',
  },
  {
    id: 'mem-3',
    title: 'Checklist privado de tokens e chaves SSH',
    content: 'Nunca expor chaves SSH privadas fora do cofre local da máquina principal.',
    layer: 'private',
    owner_user_id: 'admin',
    owner_name: 'João',
    agent_role: 'sentinel_security',
    agent_name: 'Kira',
    source_kind: 'manual',
    source_label: 'Regra de segurança',
    tags: ['seguranca', 'ssh', 'privado'],
    pinned: true,
    confidence: 0.99,
    created_at: '2026-11-19T12:00:00Z',
    updated_at: '2026-11-19T12:00:00Z',
  },
];

test('computeTextEmbedding produces higher cosine similarity for related texts', () => {
  const a = computeTextEmbedding('Auditoria de segurança SSH e senhas no servidor');
  const b = computeTextEmbedding('Segurança com chaves SSH e proteção de credenciais');
  const c = computeTextEmbedding('Receita de bolo de cenoura com cobertura de chocolate');

  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
});

test('searchBrainMemories isolates private memories while sharing household layer across users', () => {
  const mariaView = searchBrainMemories(SAMPLE_MEMORIES, '', { username: 'maria' });
  const ids = mariaView.map((h) => h.memory.id);

  assert.ok(ids.includes('mem-1'), 'Household memory must be visible to Maria');
  assert.ok(ids.includes('mem-2'), 'Maria own agent memory must be visible');
  assert.ok(!ids.includes('mem-3'), 'Admin private memory must NOT leak to Maria');
});

test('searchBrainMemories ranks semantically relevant memory first', () => {
  const hits = searchBrainMemories(SAMPLE_MEMORIES, 'chaves SSH privadas', { username: 'admin' });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].memory.id, 'mem-3');
});

test('distillConversationToMemory classifies web search discoveries cleanly', () => {
  const distilled = distillConversationToMemory({
    prompt: 'Atlas, pesquise tendências de design Obsidian 2026',
    answer: 'O estilo Obsidian com acento laranja quente mantém alto contraste AA e leitura confortável.',
    ownerUserId: 'admin',
    ownerName: 'João',
    agentRole: 'research_analyst',
    agentName: 'Atlas',
    sources: [{ title: 'Design Systems 2026', url: 'https://example.com/design' }],
  });

  assert.equal(distilled.source_kind, 'web_search');
  assert.equal(distilled.layer, 'agent');
  assert.equal(distilled.source_url, 'https://example.com/design');
  assert.ok(distilled.tags.includes('pesquisa-web'));
  assert.equal(distilled.embedding?.length, 64);
});
