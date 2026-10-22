import { Timestamp } from 'firebase/firestore';

export type UserRole = 'shopkeeper' | 'customer';

export type TransactionType = 'baki' | 'joma' | 'nagad';

export type TransactionStatus =
  | 'pending_shopkeeper'
  | 'pending_customer_approval'
  | 'approved'
  | 'rejected';

export type SyncMethod = 'online' | 'wifi_bt_qr';

export interface UserProfile {
  uid: string;
  displayName: string;
  phone: string;
  activeRole: UserRole;
  shopName: string;
  shopCode: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Shop {
  id: string;
  ownerId: string;
  ownerName: string;
  shopName: string;
  shopCode: string;
  category: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ShopCustomerLink {
  id: string;
  shopkeeperId: string;
  customerId: string;
  shopName: string;
  customerName: string;
  customerPhone: string;
  totalBaki: number;
  totalAgrim: number;
  status: 'active' | 'archived';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DraftLineItem {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  time?: string;
}

export interface DraftSession {
  linkId: string;
  shopkeeperId: string;
  customerId: string;
  shopName: string;
  customerName: string;
  type: TransactionType;
  items: DraftLineItem[];
  updatedAt: number;
}

export interface LedgerTransaction {
  id: string;
  linkId: string;
  shopkeeperId: string;
  customerId: string;
  createdBy: string;
  creatorRole: UserRole;
  shopName: string;
  customerName: string;
  type: TransactionType;
  amount: number;
  description: string;
  proposedAmount: number;
  proposedDescription: string;
  editReason: string;
  status: TransactionStatus;
  syncMethod: SyncMethod;
  txDate: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface OfflinePacket {
  packetType: 'AMAR_HISHAB_SYNC_V1';
  id: string;
  linkId: string;
  shopkeeperId: string;
  customerId: string;
  createdBy: string;
  creatorRole: UserRole;
  shopName: string;
  customerName: string;
  type: TransactionType;
  amount: number;
  description: string;
  txDate: string;
  timestamp: number;
}

// Validation Constraints synced with firebase-blueprint.json & firestore.rules
export const VALIDATION_LIMITS = {
  ID_MAX_LEN: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  NAME_MAX_LEN: 80,
  SHOP_NAME_MAX_LEN: 100,
  PHONE_MAX_LEN: 20,
  SHOP_CODE_MAX_LEN: 32,
  CATEGORY_MAX_LEN: 60,
  DESC_MAX_LEN: 1500,
  REASON_MAX_LEN: 200,
  MAX_AMOUNT: 10000000,
  MAX_TOTAL: 100000000,
  DATE_PATTERN: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
};
