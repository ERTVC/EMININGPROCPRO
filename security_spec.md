# PROCSTORE Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Verified Identity**: No read or write is permitted without `request.auth != null && request.auth.token.email_verified == true`.
2. **Path & ID Hardening**: Every single-document `get`, `create`, `update`, and `delete` operation must enforce `isValidId(docId)` (`<= 128` chars, `^[a-zA-Z0-9_\-]+$`) and `incoming().id == docId` on entity documents.
3. **Strict Ownership, Main-Store Lock & Bounded Sharing**: Every store record (`inventory`, `assets`, `recipients`, `issueLog`, `disposalLog`, `igaUnits`, `igaLogistics`, `issueRequests`, `storeSettings`) must carry `ownerUid == request.auth.uid` on `create`, `storeId == 'main-store'`, and a bounded `memberEmails` array (`1..50` strings, first element verified string, including `procurementertvc@gmail.com`). Personal sandbox `storeId == request.auth.uid` self-provisioning is strictly prohibited.
4. **Relational Existence & Atomicity**:
   - An `AssetItem` cannot be created unless its parent `inventory/{inventoryId}` exists (or is created atomically in the same batch via `existsAfter`).
   - An `IssueLogEntry` cannot be created unless `inventory/{inventoryId}` and `recipients/{recipientId}` exist; if `assetId != ''`, `assets/{assetId}` must atomically transition to `status == 'Issued'` with `activeIssueLogId == logId` in the same batch (`getAfter`); if `assetId == ''`, `inventory/{inventoryId}.quantity` must atomically decrement by `incoming().quantity` (`getAfter`).
   - Returning an asset must atomically update both `issueLog/{logId}` (`returned: false -> true`) and `assets/{assetId}` (`Issued -> In Stock`, `activeIssueLogId -> ''`) in the same batch.
   - A `DisposalLogEntry` must always start as `status == 'Pending'` for an existing `Obsolete` asset, and only an Admin (`isStoreAdmin()`) can transition `Pending -> Approved/Rejected` or `Approved -> Disposed` (atomically setting `assets/{assetId}.status == 'Disposed'`).
   - An `IGALogisticsEntry` cannot be created unless its parent `igaUnits/{igaId}` exists in the same `storeId` (or is created atomically in the same batch), is `approvalStatus == 'Approved'` (when `approvalStatus` is present), and if `inventoryId != ''` (a Central Store Requisition), `inventory/{inventoryId}` must be a `Consumable` in the same `storeId` and atomically decrement by `incoming().quantity` (`getAfter`).
   - A non-admin (`hod` or `officer`) creating a `DepartmentalIGA` MUST include a non-empty `proposalFileName` (`<= 150`) and `proposalDataUrl` (`<= 350000`), MUST start with `approvalStatus == 'Pending'`, `status == 'Planned'`, `reviewedByEmail == ''`, and `approvalNotes == ''`, and CANNOT approve or reject their own submission; only `isStoreAdmin()` can transition `approvalStatus` to `'Approved'` or `'Rejected'`.
5. **Terminal State Locking**: Once an `IssueLogEntry` has `returned == true`, a `DisposalLogEntry` has `status in ['Rejected', 'Disposed']`, an `IssueRequest` reaches `status in ['Issued', 'Declined']`, or an `IGALogisticsEntry` reaches `dispatchStatus == 'Completed'`, non-admin updates are strictly rejected.
6. **PII Isolation, Admin Allowlist & HOD Scoping**: `storeAccess` documents contain officer/HOD email addresses and are readable only by the matching email owner or the bootstrapped admin (`procurementertvc@gmail.com`), and writable only by the bootstrapped admin. Uninvited or `revoked` accounts are strictly denied access to all `storeSettings` and store data collections (no `ownerUid` read/write bypass after revocation). Accounts assigned `role == 'hod'` must carry a non-empty `department` and may only `get`, `list`, `create`, or `update` `inventory`, `assets` (scoped via parent `inventory`), `igaUnits`, `igaLogistics`, and `Pending` `issueRequests` belonging strictly to their assigned department; HOD accounts are strictly prohibited from reading or modifying other departments' records, decrementing another department's consumables, issuing or returning items, approving IGA proposals, or resolving `issueRequests`.
7. **Temporal Integrity & Immutability**: `createdAt == request.time` on create; `createdAt == existing().createdAt` and `updatedAt == request.time` on update; `id`, `storeId`, `ownerUid` are immutable after creation.
8. **Static Query Proving in `allow list`**: All `allow list` rules avoid `resource.data`-dependent `get()`/`exists()` calls and prove access statically from query filters (`memberEmails` for Admin/Officer, `department == storeAccessData().department` for HOD).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)
1. **Unverified Email Spoof**: Signed-in user with `email_verified: false` attempting to read or write `/inventory/item-1` (including spoofing `procurementertvc@gmail.com`).
2. **Ghost Field / Shadow Update**: Authenticated user sending `{ ..., isAdmin: true }` or `{ ..., extraField: 'hack' }` on `inventory` create or update.
3. **Owner UID Spoofing**: Authenticated user creating `/inventory/item-1` with `ownerUid: 'other-user-uid'`.
4. **Path ID Poisoning**: Attempting `setDoc` at `/inventory/../../admin_hack` or a 500-character ID string.
5. **Unbounded Array / Type Poisoning**: Creating `/inventory/item-1` with `memberEmails` containing >50 entries or a non-string `[123]` at index 0.
6. **Self-Assigned Admin Escalation**: Non-admin officer creating or updating `/storeAccess/hacker_at_example_com` with `role: 'admin', status: 'active'`.
7. **PII Blanket Scrape**: Non-admin user querying `collection(db, 'storeAccess')` without matching their own email.
8. **Orphaned Asset Creation**: Creating `/assets/a-1` referencing a nonexistent `inventoryId: 'missing-inv'`.
9. **Non-Atomic Asset Issue Bypass**: Creating `/issueLog/log-1` with `assetId: 'asset-1'` without atomically updating `/assets/asset-1` to `status: 'Issued'` in the same batch.
10. **Consumable Stock Theft / Desync**: Creating `/issueLog/log-2` for a consumable with `quantity: 5` without decrementing `/inventory/{inventoryId}.quantity` by `5`.
11. **Disposal Status Shortcutting / Self-Approval**: Non-admin officer creating `/disposalLog/d-1` with `status: 'Approved'` directly, or updating `'Pending'` to `'Disposed'`.
12. **Terminal State Tampering & Timestamp Forgery**: Re-opening a `'Disposed'` disposal record or `'returned: true'` issue log, or passing a forged client `createdAt` timestamp instead of `request.time`.
13. **Personal Workspace Self-Provisioning / Revoked Access**: Uninvited or revoked Google user attempting to create `/storeSettings/{uid}` or read/write `/inventory/item-1` under `storeId: uid` or `main-store`.
14. **HOD IGA Self-Approval / Proposal Bypass**: HOD creating `/igaUnits/iga-1` with `approvalStatus: 'Approved'` or without `proposalDataUrl` attachment, or self-approving an existing `'Pending'` IGA via `update`.
15. **HOD Cross-Department Read / Write Bypass**: An HOD assigned to `'AGME'` attempting to `get`, `list`, `create`, or `update` `inventory`, `igaUnits`, `igaLogistics`, `issueRequests`, or `departmentBudgets` belonging to `'Electrical & Electronics'`, or decrementing `'Electrical & Electronics'` consumable stock via `Store Requisition`.
16. **HOD Budget Self-Approval / Tampering**: An HOD creating or updating a `DepartmentBudget` with `status: 'Approved'` or `status: 'Reviewed'`, or modifying another department's budget.

## 3. Verification Harness
All payloads are covered in `firestore.rules.test.ts` verifying `PERMISSION_DENIED` against the rules in `firestore.rules`.
