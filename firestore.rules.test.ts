/**
 * Hardened Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  docId: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on User Profile',
    collection: 'users',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    docId: 'user_B',
    payload: {
      uid: 'user_B',
      displayName: 'Spoofed User',
      phone: '01700000000',
      activeRole: 'shopkeeper',
      shopName: 'Spoof Shop',
      shopCode: 'SPOOF1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collection: 'users',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: false },
    docId: 'user_A',
    payload: {
      uid: 'user_A',
      displayName: 'Unverified User',
      phone: '01700000000',
      activeRole: 'customer',
      shopName: '',
      shopCode: '',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Lateral Read on Users Collection',
    collection: 'users',
    operation: 'get',
    auth: { uid: 'user_B', email_verified: true },
    docId: 'user_A',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Shop',
    collection: 'shops',
    operation: 'create',
    auth: { uid: 'user_A', email_verified: true },
    docId: 'user_A',
    payload: {
      ownerId: 'user_A',
      ownerName: 'Rahim',
      shopName: 'Rahim Store',
      shopCode: 'RAHIM1',
      category: 'মুদি দোকান',
      isVerifiedBadge: true, // Ghost field
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Link Creation Without Existing Shop',
    collection: 'links',
    operation: 'create',
    auth: { uid: 'cust_1', email_verified: true },
    docId: 'link_1',
    payload: {
      shopkeeperId: 'non_existent_shop',
      customerId: 'cust_1',
      shopName: 'Ghost Shop',
      customerName: 'Karim',
      customerPhone: '01800000000',
      totalBaki: 0,
      totalAgrim: 0,
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Unauthorized Link Scraping by Non-Participant',
    collection: 'links',
    operation: 'get',
    auth: { uid: 'attacker_1', email_verified: true },
    docId: 'link_1',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Transaction Creation Without Existing Link',
    collection: 'transactions',
    operation: 'create',
    auth: { uid: 'cust_1', email_verified: true },
    docId: 'tx_1',
    payload: {
      linkId: 'fake_link_999',
      shopkeeperId: 'shop_1',
      customerId: 'cust_1',
      createdBy: 'cust_1',
      creatorRole: 'customer',
      shopName: 'Rahim Store',
      customerName: 'Karim',
      type: 'baki',
      amount: 250,
      description: 'চাল ৫ কেজি',
      proposedAmount: 0,
      proposedDescription: '',
      editReason: '',
      status: 'pending_shopkeeper',
      syncMethod: 'online',
      txDate: '2026-10-21',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Customer Self-Approving Pending Shopkeeper Transaction',
    collection: 'transactions',
    operation: 'update',
    auth: { uid: 'cust_1', email_verified: true },
    docId: 'tx_1',
    payload: {
      status: 'approved',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Shopkeeper Bypassing Customer Approval When Editing Amount',
    collection: 'transactions',
    operation: 'update',
    auth: { uid: 'shop_1', email_verified: true },
    docId: 'tx_1',
    payload: {
      amount: 900,
      status: 'approved',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal State Mutation on Approved Transaction',
    collection: 'transactions',
    operation: 'update',
    auth: { uid: 'shop_1', email_verified: true },
    docId: 'tx_approved_1',
    payload: {
      proposedAmount: 1200,
      status: 'pending_customer_approval',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Timestamp Forgery on Transaction Creation',
    collection: 'transactions',
    operation: 'create',
    auth: { uid: 'cust_1', email_verified: true },
    docId: 'tx_forged_time',
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Oversized Description Resource Exhaustion',
    collection: 'transactions',
    operation: 'create',
    auth: { uid: 'cust_1', email_verified: true },
    docId: 'tx_oversized',
    payload: {
      description: 'অ'.repeat(5000),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
