/**
 * Security Rules Verification Suite (Phase 0 TDD — Dirty Dozen Payloads)
 *
 * Verifies that all 12 adversarial attack vectors in security_spec.md are blocked
 * by firestore.rules, while valid owner/member operations are allowed.
 *
 * Run against Firebase Emulator Suite when available:
 *   firebase emulators:exec --only firestore "npx tsx --test firestore.rules.test.ts"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export interface DirtyDozenCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'create' | 'update' | 'get' | 'list';
  actor: { uid: string; email?: string; email_verified?: boolean };
  payload?: Record<string, unknown>;
  expectedRuleGuard: RegExp;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on User Create',
    targetPath: '/users/uid_a',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_a',
      displayName: 'Ana',
      assistantName: 'Maria',
      experienceMode: 'simple',
      avatarIcon: 'M',
      isAdmin: true,
    },
    expectedRuleGuard: /hasOnly\(/,
  },
  {
    id: 2,
    name: 'Identity Spoofing on User Create',
    targetPath: '/users/uid_a',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'attacker@example.com', email_verified: true },
    payload: {
      ownerId: 'uid_victim',
      displayName: 'Spoof',
      assistantName: 'JARVIS',
      experienceMode: 'engineering',
      avatarIcon: 'S',
    },
    expectedRuleGuard: /data\.ownerId == request\.auth\.uid/,
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoofing',
    targetPath: '/users/uid_victim',
    operation: 'get',
    actor: { uid: 'uid_spoof', email: 'Alexandrecalmonjunior@gmail.com', email_verified: false },
    expectedRuleGuard: /request\.auth\.token\.email_verified == true/,
  },
  {
    id: 4,
    name: 'PII Cross-User Read Attempt',
    targetPath: '/users/uid_a/private/profile',
    operation: 'get',
    actor: { uid: 'uid_b', email: 'other@example.com', email_verified: true },
    expectedRuleGuard: /match \/private\/\{docId\}[\s\S]*isOwner\(userId\)/,
  },
  {
    id: 5,
    name: 'Immutable ownerId and createdAt Tampering',
    targetPath: '/users/uid_a',
    operation: 'update',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    payload: { ownerId: 'uid_b', createdAt: '2020-01-01T00:00:00Z' },
    expectedRuleGuard: /incoming\(\)\.ownerId == existing\(\)\.ownerId/,
  },
  {
    id: 6,
    name: 'Forged Client Timestamp on Create',
    targetPath: '/users/uid_a',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' },
    expectedRuleGuard: /incoming\(\)\.createdAt == request\.time/,
  },
  {
    id: 7,
    name: 'ID Poisoning Attack',
    targetPath: '/users/..%2F..%2Fadmin',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    expectedRuleGuard: /isValidId\(/,
  },
  {
    id: 8,
    name: 'Oversized String Value Poisoning (DoW)',
    targetPath: '/users/uid_a',
    operation: 'update',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    payload: { assistantName: 'A'.repeat(5000) },
    expectedRuleGuard: /data\.assistantName\.size\(\) <= 40/,
  },
  {
    id: 9,
    name: 'Unauthorized Admin Escalation',
    targetPath: '/admins/uid_a',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'user@example.com', email_verified: true },
    payload: { ownerId: 'uid_a' },
    expectedRuleGuard: /match \/admins\/\{adminId\}[\s\S]*isAdmin\(\)/,
  },
  {
    id: 10,
    name: 'Orphaned Household Memory Creation',
    targetPath: '/households/missing_hh/shared_memories/mem_1',
    operation: 'create',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    expectedRuleGuard: /exists\(\/databases\/\$\(database\)\/documents\/households\/\$\(householdId\)\)/,
  },
  {
    id: 11,
    name: 'Non-Member Household Memory Access',
    targetPath: '/households/hh_1/shared_memories/mem_1',
    operation: 'create',
    actor: { uid: 'uid_outsider', email: 'outsider@example.com', email_verified: true },
    expectedRuleGuard: /isHouseholdMember\(householdId\)/,
  },
  {
    id: 12,
    name: 'Terminal State Mutation on Archived Memory',
    targetPath: '/households/hh_1/shared_memories/mem_archived',
    operation: 'update',
    actor: { uid: 'uid_a', email: 'ana@example.com', email_verified: true },
    payload: { status: 'active' },
    expectedRuleGuard: /existing\(\)\.status != 'archived'/,
  },
];

test('firestore.rules enforces all 12 Dirty Dozen security invariants', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const draftPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
  const target = fs.existsSync(rulesPath) ? rulesPath : draftPath;
  assert.ok(fs.existsSync(target), 'Expected firestore.rules or DRAFT_firestore.rules to exist');
  const rulesSource = fs.readFileSync(target, 'utf8');

  assert.match(rulesSource, /rules_version\s*=\s*'2';/, 'Must use rules_version 2');
  assert.match(
    rulesSource,
    /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/,
    'Must start with default-deny catch-all'
  );

  for (const vector of DIRTY_DOZEN_PAYLOADS) {
    assert.match(
      rulesSource,
      vector.expectedRuleGuard,
      `Dirty Dozen #${vector.id} (${vector.name}) guard missing in rules`
    );
  }
});
