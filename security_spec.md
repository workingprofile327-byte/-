# Security Specification (`security_spec.md`) — আমার হিসাব (`com.wic.amarhishab`)

## 1. Data Invariants

1. **Global Zero-Trust Catch-All**: All paths default to `allow read, write: if false;`.
2. **Verified Authentication**: Every write operation (`create`, `update`, `delete`) across all collections requires `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (`/users/{userId}`)**:
   - Contains personal profile details (`phone`, `displayName`, `activeRole`).
   - Only the exact owner (`request.auth.uid == userId`) can `get`, `create`, or `update` `/users/{userId}`.
   - `list` and `delete` are completely forbidden on `/users/{userId}`.
4. **Shop Directory Integrity (`/shops/{shopId}`)**:
   - Contains non-PII business card metadata for QR linking.
   - `shopId` must equal `request.auth.uid` and `incoming().ownerId == request.auth.uid` on `create` and `update`.
   - `get` is permitted for authenticated users with valid `shopId`; `list` is restricted to `resource.data.ownerId == request.auth.uid`.
5. **Relational Link Integrity (`/links/{linkId}`)**:
   - A link can only be created if `exists(/databases/$(database)/documents/shops/$(incoming().shopkeeperId))` is true and the caller is either `incoming().shopkeeperId` or `incoming().customerId`.
   - `get` and `list` are restricted strictly to participants (`resource.data.shopkeeperId == request.auth.uid || resource.data.customerId == request.auth.uid`).
   - Immutable fields (`shopkeeperId`, `createdAt`) cannot be altered during updates.
6. **Transaction Verification & Terminal State Locking (`/transactions/{txId}`)**:
   - A transaction can only be created if `exists(/databases/$(database)/documents/links/$(incoming().linkId))` is true, `incoming().createdBy == request.auth.uid`, and the user is either `shopkeeperId` or `customerId`.
   - Once `status` reaches `'approved'` or `'rejected'`, the transaction is in a **Terminal State** and cannot be updated further.
   - When a customer submits an entry (`status == 'pending_shopkeeper'`), only the shopkeeper (`existing().shopkeeperId == request.auth.uid`) can approve it (`status: 'approved'`) or propose a correction (`status: 'pending_customer_approval'`).
   - When a shopkeeper proposes a correction (`status == 'pending_customer_approval'`), only the customer (`existing().customerId == request.auth.uid`) can approve the proposed correction (`status: 'approved'` with `amount == existing().proposedAmount`).

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on User Profile)**: Authenticated user `user_A` attempts to create `/users/user_B` with `uid: "user_B"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Write)**: User `user_A` with `email_verified: false` attempts to create `/users/user_A`. -> `PERMISSION_DENIED`
3. **Payload 3 (PII Lateral Read)**: User `user_B` attempts `get` on `/users/user_A` to steal phone number. -> `PERMISSION_DENIED`
4. **Payload 4 (Shadow Field Injection on Shop)**: User `user_A` creates `/shops/user_A` with extra ghost field `isVerifiedBadge: true`. -> `PERMISSION_DENIED`
5. **Payload 5 (Orphaned Link Creation)**: User `cust_1` creates `/links/link_1` pointing to a non-existent `/shops/ghost_shop`. -> `PERMISSION_DENIED`
6. **Payload 6 (Unauthorized Link Scraping)**: User `attacker_1` attempts to `list` `/links` without filtering by their own `shopkeeperId` or `customerId`. -> `PERMISSION_DENIED`
7. **Payload 7 (Orphaned Transaction Creation)**: User `cust_1` creates `/transactions/tx_1` referencing a non-existent `/links/fake_link`. -> `PERMISSION_DENIED`
8. **Payload 8 (Customer Self-Approving Correction)**: Customer `cust_1` attempts to directly update their `pending_shopkeeper` transaction to `approved`. -> `PERMISSION_DENIED`
9. **Payload 9 (Shopkeeper Bypassing Customer Approval on Edit)**: Shopkeeper `shop_1` attempts to change `amount` from `500` to `900` and set `status: 'approved'` directly without `pending_customer_approval`. -> `PERMISSION_DENIED`
10. **Payload 10 (Terminal State Mutation)**: Shopkeeper `shop_1` attempts to modify `amount` on a transaction whose `status` is already `'approved'`. -> `PERMISSION_DENIED`
11. **Payload 11 (Timestamp Forgery)**: User `cust_1` attempts to create a transaction with a backdated `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`
12. **Payload 12 (Resource Exhaustion / Oversized String)**: User `cust_1` sends a 5,000-character `description` string into `/transactions/tx_1`. -> `PERMISSION_DENIED`
