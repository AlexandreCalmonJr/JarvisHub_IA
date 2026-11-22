# Security Specification — JARVIS AI Hub Firestore Rules

## 1. Data Invariants

1. **Identity & Ownership**:
   - A document at `/users/{userId}` can only be created, read, updated, or deleted by the verified user whose `request.auth.uid == userId` (or a verified administrator).
   - `ownerId` MUST strictly equal `request.auth.uid` on creation and MUST remain immutable on all updates.
2. **PII Isolation (Split Collection)**:
   - Personally Identifiable Information (`email`, private instructions, background) is isolated inside `/users/{userId}/private/{docId}` and NEVER stored in public or shared collections.
   - No non-owner user may read or list `/users/{userId}/private/{docId}`.
3. **Zero Self-Assigned Roles**:
   - No user may write to `/admins/{adminId}` unless they are already a verified administrator.
   - Users cannot inject `role`, `isAdmin`, or shadow keys into `/users/{userId}` or `/households/{householdId}/members/{memberId}`.
4. **Master Gate Relational Sync (Households)**:
   - Access to `/households/{householdId}/shared_memories/{memoryId}` requires both parent household existence (`exists(/databases/$(database)/documents/households/$(householdId))`) AND active membership at `/households/{householdId}/members/$(request.auth.uid)`.
   - Revoking membership immediately revokes access to all subcollection reads and writes.
5. **Terminal State Locking**:
   - Once a `HouseholdMemory` reaches `status == 'archived'`, regular members cannot mutate it further; only a verified admin can recover or modify it.
6. **Temporal Integrity & Anti-DoW**:
   - All `createdAt` values MUST equal `request.time` on create and remain immutable on update.
   - All `updatedAt` values MUST equal `request.time` on create and update.
   - All document IDs (`userId`, `docId`, `householdId`, `memberId`, `memoryId`, `adminId`) MUST satisfy `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
   - Every string field enforces strict `.size()` bounds.
7. **Secure List Queries**:
   - `allow list` never uses `get()` or `exists()` and explicitly evaluates `resource.data.ownerId == request.auth.uid` (or `isAdmin()`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Shadow Field Injection on User Create**:
   `{ "ownerId": "uid_a", "displayName": "Ana", "assistantName": "Maria", "experienceMode": "simple", "avatarIcon": "M", "isAdmin": true, "createdAt": "<ts>", "updatedAt": "<ts>" }`
2. **Identity Spoofing on User Create**:
   `{ "ownerId": "uid_victim", "displayName": "Hacker", "assistantName": "JARVIS", "experienceMode": "engineering", "avatarIcon": "H", "createdAt": "<ts>", "updatedAt": "<ts>" }`
3. **Unverified Email Write Bypass**:
   Authenticated with `email: "Alexandrecalmonjunior@gmail.com"` and `email_verified: false` attempting to read `/users/uid_victim` or write `/admins/uid_attacker`.
4. **PII Cross-User Read Attempt**:
   User `uid_b` performing `get` on `/users/uid_a/private/profile`.
5. **Immutable Field Tampering (`ownerId` / `createdAt`)**:
   User `uid_a` updating `/users/uid_a` and changing `ownerId` to `"uid_b"` or backdating `createdAt`.
6. **Forged Client Timestamp**:
   Creating `/users/uid_a` with client-supplied `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`.
7. **ID Poisoning Attack**:
   Creating `/users/../../../etc/passwd` or a 200-character document ID.
8. **Value Poisoning / Oversized String (Denial of Wallet)**:
   Updating `/users/uid_a` with `assistantName` of 5,000 characters or boolean `true`.
9. **Unauthorized Admin Privilege Escalation**:
   Regular user `uid_a` creating `/admins/uid_a` with `{ "ownerId": "uid_a", "grantedAt": "<ts>" }`.
10. **Orphaned Household Memory Write**:
    Creating `/households/nonexistent_hh/shared_memories/mem1` where parent household does not exist.
11. **Non-Member Household Memory Read/Write**:
    Verified user `uid_outsider` (not in `/households/hh1/members/uid_outsider`) attempting to create or get `/households/hh1/shared_memories/mem1`.
12. **Terminal State Mutation Bypass**:
    Member `uid_a` updating a `HouseholdMemory` whose existing `status` is `'archived'` back to `'active'` or editing its `content`.
