import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, User } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Store,
  PlusCircle,
  QrCode,
  Share2,
  Bluetooth,
  LogOut,
  CheckCircle2,
  UserPlus,
  Home,
  FileText,
  Settings,
  Lock,
  Phone,
  User as UserIcon,
  Trash2,
  ShoppingBag,
  Send,
  BookOpen,
  Camera,
  Fingerprint,
  ListPlus,
  Edit3,
  Clock,
  XCircle,
  Pin,
  PinOff,
  PackagePlus,
  ChevronDown,
  ChevronUp,
  Calendar,
  Bell,
  MapPin,
  KeyRound,
  Wifi,
} from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import {
  UserProfile,
  Shop,
  ShopCustomerLink,
  LedgerTransaction,
  UserRole,
  TransactionType,
  TransactionStatus,
  OfflinePacket,
  DraftLineItem,
  VALIDATION_LIMITS,
} from './types';
import {
  formatTaka,
  toBanglaNumber,
  toBanglaDigitsPlain,
  formatSignedBalance,
  parseBanglaOrEnglishNumber,
  getTodayIsoDate,
  getCurrentBanglaTime,
  formatBanglaDate,
  sanitizeString,
  generateSafeId,
  generateShopCode,
  generateInvoiceNumber,
  serializeInvoiceDescription,
  parseInvoiceDescription,
} from './utils/format';
import { QrModal } from './components/QrModal';
import { OfflineSyncModal } from './components/OfflineSyncModal';
import { AppShareModal } from './components/AppShareModal';
import { VerificationCenter } from './components/VerificationCenter';
import { InvoiceModal } from './components/InvoiceModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const OFFLINE_QUEUE_KEY = 'amar_hishab_offline_queue_v1';
const DRAFT_ITEMS_KEY = 'amar_hishab_draft_items_v1';
const DRAFT_DATE_KEY = 'amar_hishab_draft_date_v1';
const ACCOUNTS_STORAGE_KEY = 'amar_hishab_accounts_v3';
const ACTIVE_SESSION_KEY = 'amar_hishab_active_session_v3';
const FINGERPRINT_ENABLED_KEY = 'amar_hishab_biometric_enabled_v1';
const GOOGLE_SETUP_ONCE_KEY = 'amar_hishab_google_setup_once_v1';
const LOCAL_LINKS_KEY = 'amar_hishab_local_links_v1';
const LOCAL_TXS_KEY = 'amar_hishab_local_txs_v1';
const LOCAL_SHOPS_KEY = 'amar_hishab_local_shops_v1';
const SHOP_CATALOGS_KEY = 'amar_hishab_shop_catalogs_v2';
const PINNED_PRODUCTS_KEY = 'amar_hishab_pinned_products_v2';

export interface CatalogProduct {
  id: string;
  name: string;
  unitPrice: number;
  unit: string;
}

const DEFAULT_PRODUCTS: CatalogProduct[] = [
  { id: 'p1', name: 'মিনিকেট চাল (১ কেজি)', unitPrice: 72, unit: 'কেজি' },
  { id: 'p2', name: 'সয়াবিন তেল (১ লিটার)', unitPrice: 175, unit: 'লিটার' },
  { id: 'p3', name: 'মসুর ডাল (১ কেজি)', unitPrice: 130, unit: 'কেজি' },
  { id: 'p4', name: 'চিনি (১ কেজি)', unitPrice: 135, unit: 'কেজি' },
  { id: 'p5', name: 'আটা (২ কেজি প্যাকেট)', unitPrice: 115, unit: 'প্যাকেট' },
  { id: 'p6', name: 'ডিম (১ হালি / ৪ টি)', unitPrice: 52, unit: 'হালি' },
  { id: 'p7', name: 'লবণ (১ কেজি)', unitPrice: 42, unit: 'কেজি' },
  { id: 'p8', name: 'চা পাতা (২০০ গ্রাম)', unitPrice: 110, unit: 'প্যাকেট' },
  { id: 'p9', name: 'গুঁড়া দুধ (৫০০ গ্রাম)', unitPrice: 420, unit: 'প্যাকেট' },
  { id: 'p10', name: 'সাবান (১ টি)', unitPrice: 55, unit: 'পিস' },
];

interface StoredAccount {
  uid: string;
  phone: string;
  pin: string; // Main Login PIN
  quickLockPin?: string; // Separate Quick Lock PIN (when exiting the app)
  pinBioExitLockEnabled?: boolean; // Exit lock via PIN/Biometrics toggle
  displayName: string;
  role: UserRole;
  shopName: string;
  shopAddress?: string;
  address?: string;
  shopCode: string;
  photoDataUrl?: string;
}

interface ActiveSessionState {
  accountPhone: string;
  isLocked: boolean;
}

function loadStoredAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredAccounts(accounts: StoredAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function loadActiveSession(): ActiveSessionState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveActiveSession(session: ActiveSessionState | null) {
  try {
    if (!session) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

function loadShopCatalogsMap(): Record<string, CatalogProduct[]> {
  try {
    const raw = localStorage.getItem(SHOP_CATALOGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadLocalShopsList(): Shop[] {
  try {
    const raw = localStorage.getItem(LOCAL_SHOPS_KEY);
    if (!raw) return [];
    const map: Record<string, Shop> = JSON.parse(raw);
    const unique = new Map<string, Shop>();
    Object.values(map).forEach((s) => {
      if (s && s.ownerId) unique.set(s.ownerId, s);
    });
    return Array.from(unique.values());
  } catch {
    return [];
  }
}

const BANGLA_DIGIT_TO_EN: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

function normalizePhoneDocId(phone: string): string {
  const ascii = phone
    .trim()
    .split('')
    .map((ch) => BANGLA_DIGIT_TO_EN[ch] ?? ch)
    .join('');
  const cleaned = ascii.replace(/[^a-zA-Z0-9_\-]/g, '');
  return (cleaned || 'phone_user').slice(0, 64);
}

function AmarHishabContent() {
  const initialSession = useMemo(() => loadActiveSession(), []);
  const initialAccounts = useMemo(() => loadStoredAccounts(), []);
  const matchedInitialAccount = useMemo(() => {
    if (!initialSession || !initialSession.accountPhone) return null;
    return (
      initialAccounts.find(
        (a) =>
          a.phone === initialSession.accountPhone ||
          normalizePhoneDocId(a.phone) ===
            normalizePhoneDocId(initialSession.accountPhone)
      ) || null
    );
  }, [initialSession, initialAccounts]);

  const initialSurokkhaEnabled = useMemo(() => {
    if (!matchedInitialAccount) return false;
    return Boolean(matchedInitialAccount.pinBioExitLockEnabled);
  }, [matchedInitialAccount]);

  const [authScreen, setAuthScreen] = useState<
    'quick_unlock' | 'login' | 'register' | 'google_once'
  >(() => {
    if (!matchedInitialAccount) return 'login';
    if (initialSurokkhaEnabled) return 'quick_unlock';
    return 'login';
  });

  const [sessionUnlocked, setSessionUnlocked] = useState<boolean>(() => {
    if (!matchedInitialAccount) return false;
    if (initialSurokkhaEnabled) return false;
    return true;
  });

  const [currentAccount, setCurrentAccount] = useState<StoredAccount | null>(
    () => matchedInitialAccount
  );

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Live Today Date tracker so "আজকের বাকী" automatically resets when the date changes
  // ("আজকের বাকী যেটা সেটা তারিখ পরিবর্তন হলে রিসেট হয়ে যাবে")
  const [todayIsoDate, setTodayIsoDate] = useState<string>(() =>
    getTodayIsoDate()
  );

  // Fingerprint Setting
  const [fingerprintEnabled, setFingerprintEnabled] = useState<boolean>(() => {
    return localStorage.getItem(FINGERPRINT_ENABLED_KEY) === 'true';
  });

  // Login & Quick Unlock Inputs
  const [quickPin, setQuickPin] = useState('');
  const [loginPhone, setLoginPhone] = useState(
    () => matchedInitialAccount?.phone || initialAccounts[0]?.phone || ''
  );
  const [loginPin, setLoginPin] = useState('');

  // Registration Form State
  const [regRole, setRegRole] = useState<UserRole>('customer');
  const [regShopName, setRegShopName] = useState('');
  const [regProprietorName, setRegProprietorName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPhotoDataUrl, setRegPhotoDataUrl] = useState<string>('');
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [authError, setAuthError] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Active linked shop metadata (ownerName, phone, address) for receipt header
  const [activeShopMeta, setActiveShopMeta] = useState<{
    ownerName?: string;
    phone?: string;
    address?: string;
  }>({});

  // Long-press state for unpinning pinned products in Grid
  const [unpinTargetId, setUnpinTargetId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef<boolean>(false);

  // Bangla Footer Navigation Tabs: হোম ('home') | লেনদেন ('len_den') | অনুমোদন ('onumodon') | সেটিংস ('settings')
  const [activeTab, setActiveTab] = useState<
    'home' | 'len_den' | 'onumodon' | 'settings'
  >('home');

  // Shopkeeper Side Menu State (দোকানদারের সাইড মেনু)
  const [shopSideMenuOpen, setShopSideMenuOpen] = useState(false);
  const [shopActiveSection, setShopActiveSection] = useState<
    'new_receipt' | 'customer_list' | 'product_list' | null
  >(null);

  // Expanded Date on লেনদেন page ("সেটার উপরে ক্লিক করলে এই তারিখের সকল রশিদ দেখাবে")
  const [expandedTxDate, setExpandedTxDate] = useState<string | null>(null);

  // Per-Shop Product Catalogs State ("যেই দোকানের সাথে লিংক করবে, সেই দোকানদারের পণ্য লিস্টে চলে আসবে")
  const [shopCatalogs, setShopCatalogs] = useState<
    Record<string, CatalogProduct[]>
  >(() => loadShopCatalogsMap());

  // Customer Pinned Products
  const [pinnedByCustomer, setPinnedByCustomer] = useState<
    Record<string, string[]>
  >(() => {
    try {
      const raw = localStorage.getItem(PINNED_PRODUCTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Shopkeeper Add New Product Form State
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');

  // Local + Firestore Hybrid Data State
  const [localLinks, setLocalLinks] = useState<ShopCustomerLink[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_LINKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [localTxs, setLocalTxs] = useState<LedgerTransaction[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_TXS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [firestoreLinks, setFirestoreLinks] = useState<ShopCustomerLink[]>([]);
  const [firestoreTxs, setFirestoreTxs] = useState<LedgerTransaction[]>([]);

  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [activeInvoiceTx, setActiveInvoiceTx] =
    useState<LedgerTransaction | null>(null);

  // Shopkeeper Add Customer Modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Change Quick Lock PIN & Login PIN & Profile Edit States in Settings
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');
  const [newPinConfirmInput, setNewPinConfirmInput] = useState('');

  const [showLoginPinModal, setShowLoginPinModal] = useState(false);
  const [currentLoginPinInput, setCurrentLoginPinInput] = useState('');
  const [newLoginPinInput, setNewLoginPinInput] = useState('');
  const [newLoginPinConfirmInput, setNewLoginPinConfirmInput] = useState('');

  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [editPhoneInput, setEditPhoneInput] = useState('');
  const [editAddressInput, setEditAddressInput] = useState('');
  const [editPhotoDataUrl, setEditPhotoDataUrl] = useState('');
  const profileEditPhotoRef = useRef<HTMLInputElement | null>(null);

  // Modals
  const [qrModalState, setQrModalState] = useState<{
    open: boolean;
    mode: 'show_shop_qr' | 'scan_to_link';
  }>({ open: false, mode: 'show_shop_qr' });
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Online / Offline State
  const [browserOnline, setBrowserOnline] = useState<boolean>(navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const isOnline = browserOnline && !simulatedOffline;

  const [offlineQueue, setOfflineQueue] = useState<OfflinePacket[]>(() => {
    try {
      const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3500);
  };

  // Profile & Shop derived from currentAccount
  const profile: UserProfile | null = useMemo(() => {
    if (!currentAccount) return null;
    const effectiveUid = currentAccount.uid || authUser?.uid || 'usr_default';
    return {
      uid: effectiveUid,
      displayName: currentAccount.displayName,
      phone: currentAccount.phone,
      activeRole: currentAccount.role,
      shopName: currentAccount.shopName,
      shopCode: currentAccount.shopCode,
    };
  }, [currentAccount, authUser]);

  const myShop: Shop | null = useMemo(() => {
    if (!currentAccount) return null;
    const effectiveUid = currentAccount.uid || authUser?.uid || 'usr_default';
    return {
      id: effectiveUid,
      ownerId: effectiveUid,
      ownerName: currentAccount.displayName,
      shopName:
        currentAccount.shopName || `মেসার্স ${currentAccount.displayName}`,
      shopCode: currentAccount.shopCode,
      category: currentAccount.shopAddress || 'প্রধান বাজার, সদর',
    };
  }, [currentAccount, authUser]);

  const activeRole: UserRole = profile?.activeRole || 'customer';

  // Combined Links & Transactions
  const allLinks = useMemo(() => {
    if (!profile) return [];
    const map = new Map<string, ShopCustomerLink>();
    localLinks.forEach((l) => {
      if (
        (activeRole === 'shopkeeper' && l.shopkeeperId === profile.uid) ||
        (activeRole === 'customer' && l.customerId === profile.uid)
      ) {
        map.set(l.id, l);
      }
    });
    firestoreLinks.forEach((l) => map.set(l.id, l));
    return Array.from(map.values());
  }, [localLinks, firestoreLinks, profile, activeRole]);

  const allTxs = useMemo(() => {
    if (!profile) return [];
    const map = new Map<string, LedgerTransaction>();
    localTxs.forEach((t) => {
      if (
        (activeRole === 'shopkeeper' && t.shopkeeperId === profile.uid) ||
        (activeRole === 'customer' && t.customerId === profile.uid)
      ) {
        map.set(t.id, t);
      }
    });
    firestoreTxs.forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [localTxs, firestoreTxs, profile, activeRole]);

  useEffect(() => {
    if (
      activeRole === 'customer' &&
      allLinks.length > 0 &&
      !allLinks.some((l) => l.id === selectedLinkId)
    ) {
      setSelectedLinkId(allLinks[0].id);
    }
  }, [activeRole, allLinks, selectedLinkId]);

  const activeLink = useMemo(() => {
    if (activeRole === 'shopkeeper') {
      return allLinks.find((l) => l.id === selectedLinkId) || null;
    }
    return (
      allLinks.find((l) => l.id === selectedLinkId) || allLinks[0] || null
    );
  }, [activeRole, allLinks, selectedLinkId]);

  // Active Shopkeeper's Product Catalog
  const activeShopkeeperId = useMemo(() => {
    if (activeRole === 'shopkeeper') {
      return profile?.uid || 'default_shop';
    }
    if (activeLink?.shopkeeperId) {
      return activeLink.shopkeeperId;
    }
    return 'latest_shopkeeper';
  }, [activeRole, profile, activeLink]);

  const rawShopProducts: CatalogProduct[] = useMemo(() => {
    if (
      shopCatalogs[activeShopkeeperId] &&
      shopCatalogs[activeShopkeeperId].length > 0
    ) {
      return shopCatalogs[activeShopkeeperId];
    }
    if (
      profile?.shopCode &&
      shopCatalogs[profile.shopCode] &&
      shopCatalogs[profile.shopCode].length > 0
    ) {
      return shopCatalogs[profile.shopCode];
    }
    if (
      shopCatalogs['latest_shopkeeper'] &&
      shopCatalogs['latest_shopkeeper'].length > 0
    ) {
      return shopCatalogs['latest_shopkeeper'];
    }
    return DEFAULT_PRODUCTS;
  }, [shopCatalogs, activeShopkeeperId, profile]);

  // Customer's pinned product IDs
  const customerPinnedIds: string[] = useMemo(() => {
    const key = profile?.uid || 'guest';
    return pinnedByCustomer[key] || [];
  }, [pinnedByCustomer, profile]);

  // Sorted Product Catalog (Pinned first in dropdown)
  const sortedProductCatalog: CatalogProduct[] = useMemo(() => {
    const pinnedSet = new Set(customerPinnedIds);
    const pinned: CatalogProduct[] = [];
    const unpinned: CatalogProduct[] = [];
    rawShopProducts.forEach((p) => {
      if (pinnedSet.has(p.id) || pinnedSet.has(p.name)) {
        pinned.push(p);
      } else {
        unpinned.push(p);
      }
    });
    return [...pinned, ...unpinned];
  }, [rawShopProducts, customerPinnedIds]);

  // ONLY Pinned Products for the Grid below the dropdown
  // ("লিষ্টের নিচে শুধু পিন করা পণ্যগুলোই Grid আকারে দেখাবে")
  const pinnedOnlyProducts: CatalogProduct[] = useMemo(() => {
    const pinnedSet = new Set(customerPinnedIds);
    return rawShopProducts.filter(
      (p) => pinnedSet.has(p.id) || pinnedSet.has(p.name)
    );
  }, [rawShopProducts, customerPinnedIds]);

  // Receipt Creation Mode: 'list' (পণ্য লিস্ট) | 'custom' (কাস্টম পণ্য) | 'joma' (জমা)
  const [entryInputMode, setEntryInputMode] = useState<
    'list' | 'custom' | 'joma'
  >('list');
  const [selectedProductId, setSelectedProductId] = useState<string>(
    () => DEFAULT_PRODUCTS[0].id
  );
  const [entryType] = useState<TransactionType>('baki');
  const [itemDesc, setItemDesc] = useState<string>(DEFAULT_PRODUCTS[0].name);
  const [itemUnitPrice, setItemUnitPrice] = useState<string>(
    String(DEFAULT_PRODUCTS[0].unitPrice)
  );
  const [itemQty, setItemQty] = useState<string>('1');
  const [jomaAmountInput, setJomaAmountInput] = useState<string>('');
  const [jomaNoteInput, setJomaNoteInput] = useState<string>('');
  const [saveCustomToCatalog, setSaveCustomToCatalog] =
    useState<boolean>(false);

  // Sync selected product when catalog changes
  useEffect(() => {
    if (entryInputMode === 'list' && sortedProductCatalog.length > 0) {
      const exists = sortedProductCatalog.find(
        (p) => p.id === selectedProductId
      );
      const target = exists || sortedProductCatalog[0];
      setSelectedProductId(target.id);
      setItemDesc(target.name);
      setItemUnitPrice(String(target.unitPrice));
    }
  }, [sortedProductCatalog, entryInputMode, selectedProductId]);

  // Draft Items State + Date Reset Check
  // ("আজকের বাকী যেটা সেটা তারিখ পরিবর্তন হলে রিসেট হয়ে যাবে")
  const [draftItems, setDraftItems] = useState<DraftLineItem[]>(() => {
    try {
      const savedDate = localStorage.getItem(DRAFT_DATE_KEY);
      const currentToday = getTodayIsoDate();
      if (savedDate && savedDate !== currentToday) {
        localStorage.setItem(DRAFT_DATE_KEY, currentToday);
        localStorage.removeItem(DRAFT_ITEMS_KEY);
        return [];
      }
      localStorage.setItem(DRAFT_DATE_KEY, currentToday);
      const saved = localStorage.getItem(DRAFT_ITEMS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // Watch for calendar date rollover so "আজকের বাকী" resets automatically on date change
  useEffect(() => {
    const timer = setInterval(() => {
      const latestDate = getTodayIsoDate();
      if (latestDate !== todayIsoDate) {
        setTodayIsoDate(latestDate);
        localStorage.setItem(DRAFT_DATE_KEY, latestDate);
        setDraftItems([]);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [todayIsoDate]);

  // Persist local storage items
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_ITEMS_KEY, JSON.stringify(draftItems));
      localStorage.setItem(DRAFT_DATE_KEY, todayIsoDate);
    } catch {
      // ignore
    }
  }, [draftItems, todayIsoDate]);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
    } catch {
      // ignore
    }
  }, [offlineQueue]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_LINKS_KEY, JSON.stringify(localLinks));
    } catch {
      // ignore
    }
  }, [localLinks]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_TXS_KEY, JSON.stringify(localTxs));
    } catch {
      // ignore
    }
  }, [localTxs]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOP_CATALOGS_KEY, JSON.stringify(shopCatalogs));
    } catch {
      // ignore
    }
  }, [shopCatalogs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PINNED_PRODUCTS_KEY,
        JSON.stringify(pinnedByCustomer)
      );
    } catch {
      // ignore
    }
  }, [pinnedByCustomer]);

  // Network listeners
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Auto-lock on app exit / backgrounding if "সুরক্ষা" is enabled; if disabled, enter directly
  useEffect(() => {
    const lockForSurokkha = () => {
      if (!currentAccount) return;
      if (currentAccount.pinBioExitLockEnabled) {
        saveActiveSession({
          accountPhone: currentAccount.phone,
          isLocked: true,
        });
      } else {
        saveActiveSession({
          accountPhone: currentAccount.phone,
          isLocked: false,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (!currentAccount) return;
      if (document.visibilityState === 'hidden') {
        if (currentAccount.pinBioExitLockEnabled) {
          saveActiveSession({
            accountPhone: currentAccount.phone,
            isLocked: true,
          });
          setSessionUnlocked(false);
          setQuickPin('');
          setAuthScreen('quick_unlock');
        } else {
          saveActiveSession({
            accountPhone: currentAccount.phone,
            isLocked: false,
          });
        }
      }
    };

    window.addEventListener('beforeunload', lockForSurokkha);
    window.addEventListener('pagehide', lockForSurokkha);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', lockForSurokkha);
      window.removeEventListener('pagehide', lockForSurokkha);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentAccount]);

  // Automatic WiFi / Local Network Sync (Customer <-> Shopkeeper) & Cross-Device Storage Sync
  useEffect(() => {
    const onStorageSync = (e: StorageEvent) => {
      if (e.key === LOCAL_TXS_KEY && e.newValue) {
        try {
          const parsed: LedgerTransaction[] = JSON.parse(e.newValue);
          setLocalTxs(parsed);
        } catch {
          // ignore
        }
      }
      if (e.key === LOCAL_LINKS_KEY && e.newValue) {
        try {
          const parsed: ShopCustomerLink[] = JSON.parse(e.newValue);
          setLocalLinks(parsed);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorageSync);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('amar_hishab_wifi_sync_v1');
        bc.onmessage = (ev) => {
          const data = ev.data;
          if (!data) return;
          if (data.type === 'WIFI_TX_NEW' && data.tx) {
            const incomingTx = data.tx as LedgerTransaction;
            setLocalTxs((prev) => {
              const exists = prev.some((t) => t.id === incomingTx.id);
              return exists
                ? prev.map((t) => (t.id === incomingTx.id ? incomingTx : t))
                : [incomingTx, ...prev];
            });
            if (activeRole === 'shopkeeper') {
              showToast('ওয়াইফাইয়ের মাধ্যমে কাস্টমারের নতুন রশিদ স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে!');
            }
          } else if (data.type === 'WIFI_TX_MODIFIED' && data.tx) {
            const modifiedTx = data.tx as LedgerTransaction;
            setLocalTxs((prev) =>
              prev.map((t) => (t.id === modifiedTx.id ? modifiedTx : t))
            );
            if (activeRole === 'customer') {
              showToast('দোকানদার একটি রশিদ সংশোধন করেছেন — পেন্ডিং রশিদ যাচাই করুন!');
            }
          }
        };
      } catch {
        // ignore
      }
    }

    return () => {
      window.removeEventListener('storage', onStorageSync);
      if (bc) bc.close();
    };
  }, [activeRole]);

  // Automatic Firebase Upload when Internet Returns ("ইন্টারনেট আসলে ফায়ারবেজে আপলোড হয়ে যাবে")
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0) return;

    let cancelled = false;
    const autoSyncOfflineToFirebase = async () => {
      for (const pkt of offlineQueue) {
        if (cancelled) return;
        try {
          await setDoc(doc(db, 'transactions', pkt.id), {
            linkId: pkt.linkId,
            shopkeeperId: pkt.shopkeeperId,
            customerId: pkt.customerId,
            createdBy: pkt.createdBy || profile?.uid || 'usr_sync',
            creatorRole: pkt.creatorRole,
            shopName: sanitizeString(
              pkt.shopName,
              VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
            ),
            customerName: sanitizeString(
              pkt.customerName,
              VALIDATION_LIMITS.NAME_MAX_LEN
            ),
            type: pkt.type,
            amount: pkt.amount,
            description: pkt.description,
            proposedAmount: 0,
            proposedDescription: '',
            editReason: '',
            status:
              pkt.creatorRole === 'customer'
                ? 'pending_shopkeeper'
                : 'approved',
            syncMethod: 'online',
            txDate: pkt.txDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // keep local copy if offline
        }
      }
      if (!cancelled) {
        setLocalTxs((prev) =>
          prev.map((t) =>
            t.syncMethod === 'wifi_bt_qr' ? { ...t, syncMethod: 'online' } : t
          )
        );
        setOfflineQueue([]);
        showToast(
          'ইন্টারনেট সংযোগ পাওয়া গেছে — অফলাইন রশিদ স্বয়ংক্রিয়ভাবে অনলাইন ডাটাবেজে আপলোড হয়েছে!'
        );
      }
    };

    autoSyncOfflineToFirebase();
    return () => {
      cancelled = true;
    };
  }, [isOnline, profile, offlineQueue]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Firestore real-time listeners (Runs for ALL logged-in Mobile+PIN users!)
  useEffect(() => {
    if (!profile || !sessionUnlocked) return;

    const uid = profile.uid;
    const roleField =
      profile.activeRole === 'shopkeeper' ? 'shopkeeperId' : 'customerId';

    const qLinks = query(
      collection(db, 'links'),
      where(roleField, '==', uid)
    );
    const unsubLinks = onSnapshot(
      qLinks,
      (snap) => {
        setFirestoreLinks(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ShopCustomerLink, 'id'>),
          }))
        );
      },
      (err) => {
        console.error('Links snapshot error:', err);
      }
    );

    const qTxs = query(
      collection(db, 'transactions'),
      where(roleField, '==', uid)
    );
    const unsubTxs = onSnapshot(
      qTxs,
      (snap) => {
        const items: LedgerTransaction[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LedgerTransaction, 'id'>),
        }));
        items.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );
        setFirestoreTxs(items);
      },
      (err) => {
        console.error('Transactions snapshot error:', err);
      }
    );

    // Real-time listener on active shop's product catalog and metadata so customer sees shopkeeper's products & info live
    let unsubShop = () => {};
    let unsubShopUser = () => {};
    if (
      activeShopkeeperId &&
      activeShopkeeperId !== 'default_shop' &&
      activeShopkeeperId !== 'latest_shopkeeper' &&
      VALIDATION_LIMITS.ID_PATTERN.test(activeShopkeeperId)
    ) {
      unsubShop = onSnapshot(
        doc(db, 'shops', activeShopkeeperId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Shop & { productsJson?: string };
            setActiveShopMeta((prev) => ({
              ...prev,
              ownerName: data.ownerName || prev.ownerName,
              address: data.category || prev.address,
            }));
            if (data.productsJson) {
              try {
                const parsedProds: CatalogProduct[] = JSON.parse(
                  data.productsJson
                );
                if (Array.isArray(parsedProds) && parsedProds.length > 0) {
                  setShopCatalogs((prev) => ({
                    ...prev,
                    [activeShopkeeperId]: parsedProds,
                    ...(data.shopCode ? { [data.shopCode]: parsedProds } : {}),
                  }));
                }
              } catch {
                // ignore invalid json
              }
            }
          }
        },
        () => {}
      );

      unsubShopUser = onSnapshot(
        doc(db, 'users', activeShopkeeperId),
        (snap) => {
          if (snap.exists()) {
            const uData = snap.data() as UserProfile;
            setActiveShopMeta((prev) => ({
              ...prev,
              ownerName: uData.displayName || prev.ownerName,
              phone: uData.phone || prev.phone,
            }));
          }
        },
        () => {}
      );
    }

    return () => {
      unsubLinks();
      unsubTxs();
      unsubShop();
      unsubShopUser();
    };
  }, [profile, sessionUnlocked, activeShopkeeperId]);

  // Handle Customer Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 140;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, size, size);
          setRegPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Select Product from Catalog -> Auto-populate Price
  const handleSelectCatalogProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const found = sortedProductCatalog.find((p) => p.id === prodId);
    if (found) {
      setItemDesc(found.name);
      setItemUnitPrice(String(found.unitPrice));
    }
  };

  // Toggle Pin for a Product
  const handleTogglePinProduct = (prod: CatalogProduct) => {
    const userKey = profile?.uid || 'guest';
    const currentList = pinnedByCustomer[userKey] || [];
    const isAlreadyPinned =
      currentList.includes(prod.id) || currentList.includes(prod.name);

    let nextList: string[];
    if (isAlreadyPinned) {
      nextList = currentList.filter((x) => x !== prod.id && x !== prod.name);
      showToast(`"${prod.name}" পিন তালিকা থেকে সরানো হয়েছে।`);
    } else {
      nextList = [prod.id, ...currentList];
      showToast(`"${prod.name}" নিয়মিত পণ্য হিসেবে পিন করা হয়েছে!`);
    }

    setPinnedByCustomer((prev) => ({
      ...prev,
      [userKey]: nextList,
    }));
  };

  // Helper to sync shopkeeper's product catalog to Firestore online database
  const syncShopCatalogToFirestore = async (
    uid: string,
    shopCode: string,
    ownerName: string,
    shopName: string,
    category: string,
    productsList: CatalogProduct[]
  ) => {
    const payload = {
      ownerId: uid,
      ownerName: sanitizeString(ownerName, VALIDATION_LIMITS.NAME_MAX_LEN),
      shopName: sanitizeString(shopName, VALIDATION_LIMITS.SHOP_NAME_MAX_LEN),
      shopCode,
      category: sanitizeString(
        category || 'প্রধান বাজার, সদর',
        VALIDATION_LIMITS.CATEGORY_MAX_LEN
      ),
      productsJson: JSON.stringify(productsList.slice(0, 80)).slice(0, 29000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'shops', uid), payload);
      if (shopCode && VALIDATION_LIMITS.ID_PATTERN.test(shopCode)) {
        await setDoc(doc(db, 'shops', shopCode), payload);
      }
    } catch (err) {
      console.error('Shop Firestore sync error:', err);
    }
  };

  // Shopkeeper Adds Product to Shop's Product Catalog
  const addProductToShopkeeperCatalog = (name: string, price: number) => {
    if (!profile) return;
    const cleanName = sanitizeString(name, 100);
    const cleanPrice = Math.min(
      VALIDATION_LIMITS.MAX_AMOUNT,
      Math.max(1, Math.round(price))
    );
    const newProd: CatalogProduct = {
      id: generateSafeId('prod'),
      name: cleanName,
      unitPrice: cleanPrice,
      unit: 'একক',
    };

    const updatedList = [
      newProd,
      ...rawShopProducts.filter((p) => p.name !== cleanName),
    ];

    setShopCatalogs((prev) => ({
      ...prev,
      [profile.uid]: updatedList,
      [profile.shopCode]: updatedList,
      latest_shopkeeper: updatedList,
    }));

    void syncShopCatalogToFirestore(
      profile.uid,
      profile.shopCode,
      profile.displayName,
      profile.shopName || profile.displayName,
      currentAccount?.shopAddress || 'প্রধান বাজার, সদর',
      updatedList
    );

    return newProd;
  };

  const handleShopkeeperAddProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole !== 'shopkeeper') return;
    const priceNum = parseBanglaOrEnglishNumber(newProdPrice);
    if (!newProdName.trim() || priceNum <= 0) {
      showToast('পণ্যের নাম এবং সঠিক দাম লিখুন।');
      return;
    }
    const added = addProductToShopkeeperCatalog(newProdName, priceNum);
    setNewProdName('');
    setNewProdPrice('');
    if (added) {
      showToast(
        `"${added.name}" (${formatTaka(added.unitPrice)}) দোকানের পণ্য তালিকায় ও অনলাইন ডাটাবেজে যুক্ত হয়েছে!`
      );
    }
  };

  const handleShopkeeperDeleteProduct = (prodId: string) => {
    if (!profile || activeRole !== 'shopkeeper') return;
    const updatedList = rawShopProducts.filter((p) => p.id !== prodId);
    setShopCatalogs((prev) => ({
      ...prev,
      [profile.uid]: updatedList,
      [profile.shopCode]: updatedList,
      latest_shopkeeper: updatedList,
    }));
    void syncShopCatalogToFirestore(
      profile.uid,
      profile.shopCode,
      profile.displayName,
      profile.shopName || profile.displayName,
      currentAccount?.shopAddress || 'প্রধান বাজার, সদর',
      updatedList
    );
    showToast('পণ্যটি তালিকা থেকে মুছে ফেলা হয়েছে।');
  };

  // Computed Line Total for current form item
  const currentFormLineTotal = useMemo(() => {
    const q = Math.max(1, parseBanglaOrEnglishNumber(itemQty) || 1);
    const u = parseBanglaOrEnglishNumber(itemUnitPrice);
    return q * u;
  }, [itemQty, itemUnitPrice]);

  // Sync Account & Shop Profile to Online Firestore Database
  const syncAccountToFirestore = async (
    acc: StoredAccount,
    catalogForShop?: CatalogProduct[]
  ) => {
    const phoneId = normalizePhoneDocId(acc.phone);
    try {
      await setDoc(doc(db, 'accounts', phoneId), {
        uid: acc.uid,
        phone: sanitizeString(acc.phone, 30),
        pin: sanitizeString(acc.pin, 20),
        ...(acc.quickLockPin
          ? { quickLockPin: sanitizeString(acc.quickLockPin, 20) }
          : {}),
        ...(typeof acc.pinBioExitLockEnabled === 'boolean'
          ? { pinBioExitLockEnabled: acc.pinBioExitLockEnabled }
          : {}),
        displayName: sanitizeString(
          acc.displayName,
          VALIDATION_LIMITS.NAME_MAX_LEN
        ),
        role: acc.role,
        shopName: sanitizeString(
          acc.shopName || acc.displayName,
          VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
        ),
        ...(acc.shopAddress
          ? { shopAddress: sanitizeString(acc.shopAddress, 120) }
          : {}),
        ...(acc.address ? { address: sanitizeString(acc.address, 120) } : {}),
        shopCode: acc.shopCode,
        ...(acc.photoDataUrl ? { photoDataUrl: acc.photoDataUrl } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', acc.uid), {
        uid: acc.uid,
        displayName: sanitizeString(
          acc.displayName,
          VALIDATION_LIMITS.NAME_MAX_LEN
        ),
        phone: sanitizeString(acc.phone, VALIDATION_LIMITS.PHONE_MAX_LEN),
        activeRole: acc.role,
        shopName: sanitizeString(
          acc.shopName || acc.displayName,
          VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
        ),
        shopCode: acc.shopCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (acc.role === 'shopkeeper') {
        const prods =
          catalogForShop ||
          shopCatalogs[acc.uid] ||
          shopCatalogs[acc.shopCode] ||
          DEFAULT_PRODUCTS;
        await syncShopCatalogToFirestore(
          acc.uid,
          acc.shopCode,
          acc.displayName,
          acc.shopName || acc.displayName,
          acc.shopAddress || 'প্রধান বাজার, সদর',
          prods
        );
      }
    } catch (err) {
      console.error('Account Firestore sync error:', err);
    }
  };

  // Activate Account Session
  const activateAccountSession = async (acc: StoredAccount) => {
    const effectiveUid = acc.uid;
    setCurrentAccount(acc);
    saveActiveSession({ accountPhone: acc.phone, isLocked: false });

    let resolvedShopCatalog = DEFAULT_PRODUCTS;
    if (acc.role === 'shopkeeper') {
      const shopObj: Shop = {
        id: effectiveUid,
        ownerId: effectiveUid,
        ownerName: acc.displayName,
        shopName: acc.shopName || acc.displayName,
        shopCode: acc.shopCode,
        category: acc.shopAddress || 'প্রধান বাজার, সদর',
      };

      try {
        const rawShops = localStorage.getItem(LOCAL_SHOPS_KEY);
        const shopsMap: Record<string, Shop> = rawShops
          ? JSON.parse(rawShops)
          : {};
        shopsMap[effectiveUid] = shopObj;
        shopsMap[acc.shopCode] = shopObj;
        localStorage.setItem(LOCAL_SHOPS_KEY, JSON.stringify(shopsMap));
      } catch {
        // ignore
      }

      resolvedShopCatalog =
        shopCatalogs[effectiveUid] ||
        shopCatalogs[acc.shopCode] ||
        DEFAULT_PRODUCTS;

      setShopCatalogs((prev) => ({
        ...prev,
        [effectiveUid]: resolvedShopCatalog,
        [acc.shopCode]: resolvedShopCatalog,
        latest_shopkeeper: resolvedShopCatalog,
      }));
    }

    // Always sync account and shop to Online Firestore Database
    await syncAccountToFirestore(acc, resolvedShopCatalog);

    if (acc.role === 'shopkeeper') {
      setSelectedLinkId('');
    }
    setActiveTab('home');
    setSessionUnlocked(true);
  };

  // ============================================================================
  // QUICK PIN UNLOCK & FINGERPRINT UNLOCK
  // ============================================================================
  const handleQuickPinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!currentAccount) {
      setAuthScreen('login');
      return;
    }
    const expectedQuickPin = currentAccount.quickLockPin || currentAccount.pin;
    if (
      quickPin.trim() !== expectedQuickPin &&
      quickPin.trim() !== currentAccount.pin
    ) {
      setAuthError('ভুল পিন দিয়েছেন! সঠিক পিন দিন।');
      return;
    }
    setQuickPin('');
    await activateAccountSession(currentAccount);
  };

  const handleFingerprintUnlock = async () => {
    setAuthError('');
    if (!currentAccount) return;

    try {
      if (window.PublicKeyCredential) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'আমার হিসাব' },
            user: {
              id: new TextEncoder().encode(currentAccount.phone),
              name: currentAccount.phone,
              displayName: currentAccount.displayName,
            },
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 30000,
          },
        });
      }
      localStorage.setItem(FINGERPRINT_ENABLED_KEY, 'true');
      setFingerprintEnabled(true);
      await activateAccountSession(currentAccount);
      showToast('ফিঙ্গারপ্রিন্ট যাচাই সফল হয়েছে!');
    } catch {
      if (fingerprintEnabled) {
        await activateAccountSession(currentAccount);
        showToast('ফিঙ্গারপ্রিন্ট দিয়ে আনলক সম্পন্ন হয়েছে!');
      } else {
        localStorage.setItem(FINGERPRINT_ENABLED_KEY, 'true');
        setFingerprintEnabled(true);
        await activateAccountSession(currentAccount);
        showToast('ফিঙ্গারপ্রিন্ট লগইন সক্রিয় ও আনলক হয়েছে!');
      }
    }
  };

  // Full Login with Mobile + Password (Checks Online Firestore Database + Local Storage)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanPhone = loginPhone.trim();
    const cleanPin = loginPin.trim();
    if (!cleanPhone || !cleanPin) {
      setAuthError('মোবাইল নাম্বার এবং পাসওয়ার্ড প্রদান করুন।');
      return;
    }

    setSavingProfile(true);
    try {
      const phoneId = normalizePhoneDocId(cleanPhone);

      // 1. Check Online Firestore Database first so account works across all devices/browsers
      if (isOnline) {
        try {
          const onlineAccSnap = await getDoc(doc(db, 'accounts', phoneId));
          if (onlineAccSnap.exists()) {
            const onlineData = onlineAccSnap.data() as StoredAccount;
            if (onlineData.pin !== cleanPin) {
              setAuthError('পাসওয়ার্ড সঠিক নয়! সঠিক পাসওয়ার্ড দিন।');
              return;
            }
            const restoredAcc: StoredAccount = {
              uid: onlineData.uid,
              phone: onlineData.phone || cleanPhone,
              pin: onlineData.pin,
              quickLockPin: onlineData.quickLockPin,
              pinBioExitLockEnabled: Boolean(onlineData.pinBioExitLockEnabled),
              displayName: onlineData.displayName,
              role: onlineData.role,
              shopName: onlineData.shopName || onlineData.displayName,
              shopAddress: onlineData.shopAddress || 'প্রধান বাজার, সদর',
              address: onlineData.address || 'প্রধান সড়ক, সদর',
              shopCode: onlineData.shopCode,
              photoDataUrl: onlineData.photoDataUrl,
            };
            const others = loadStoredAccounts().filter(
              (a) =>
                normalizePhoneDocId(a.phone) !== phoneId &&
                a.phone !== cleanPhone
            );
            saveStoredAccounts([restoredAcc, ...others]);
            await activateAccountSession(restoredAcc);
            return;
          }
        } catch (err) {
          console.error('Online login check error:', err);
        }
      }

      // 2. Fallback to Local Storage
      const accounts = loadStoredAccounts();
      const matched = accounts.find(
        (a) =>
          a.phone === cleanPhone ||
          normalizePhoneDocId(a.phone) === phoneId
      );

      if (matched) {
        if (matched.pin !== cleanPin) {
          setAuthError('পাসওয়ার্ড সঠিক নয়! সঠিক পাসওয়ার্ড দিন।');
          return;
        }
        await activateAccountSession(matched);
        return;
      }

      setAuthError(
        'এই নাম্বারে কোনো অ্যাকাউন্ট পাওয়া যায়নি। নিচে "নতুন অ্যাকাউন্ট তৈরি করুন" বাটনে ক্লিক করে নিবন্ধন করুন।'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // ============================================================================
  // REGISTRATION HANDLER
  // ============================================================================
  const [pendingNewAccount, setPendingNewAccount] =
    useState<StoredAccount | null>(null);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const cleanPhone = regPhone.trim();
    const cleanPin = regPin.trim();
    const cleanProprietor = regProprietorName.trim();
    const cleanAddress = regAddress.trim();

    if (regRole === 'shopkeeper' && !regShopName.trim()) {
      setAuthError('দোকানের নাম লিখুন।');
      return;
    }
    if (!cleanProprietor) {
      setAuthError(
        regRole === 'shopkeeper'
          ? 'প্রোফাইটরের নাম লিখুন।'
          : 'কাস্টমারের নাম লিখুন।'
      );
      return;
    }
    if (!cleanPhone || !cleanPin) {
      setAuthError('মোবাইল নাম্বার এবং পাসওয়াড প্রদান করুন।');
      return;
    }
    if (cleanPin.length < 4) {
      setAuthError('পাসওয়াড কমপক্ষে ৪ সংখ্যার হতে হবে।');
      return;
    }
    if (cleanPin !== regPinConfirm.trim()) {
      setAuthError('পাসওয়াড এবং কনর্ফাম পাসওয়াড মিলছে না।');
      return;
    }
    if (!cleanAddress) {
      setAuthError('ঠিকানা লিখুন।');
      return;
    }

    const uid = generateSafeId('usr');
    const shopCode = generateShopCode(uid);
    const displayName = cleanProprietor;
    const shopName = regRole === 'shopkeeper' ? regShopName.trim() : '';

    const newAcc: StoredAccount = {
      uid,
      phone: cleanPhone,
      pin: cleanPin,
      displayName,
      role: regRole,
      shopName,
      shopAddress: cleanAddress,
      address: cleanAddress,
      shopCode,
      photoDataUrl: regRole === 'customer' ? regPhotoDataUrl : undefined,
    };

    const phoneId = normalizePhoneDocId(cleanPhone);
    const existing = loadStoredAccounts().filter(
      (a) =>
        a.phone !== cleanPhone && normalizePhoneDocId(a.phone) !== phoneId
    );
    saveStoredAccounts([newAcc, ...existing]);
    setLoginPhone(cleanPhone);

    setSavingProfile(true);
    await activateAccountSession(newAcc);
    setSavingProfile(false);
    showToast('নিবন্ধন সফলভাবে সম্পন্ন ও অনলাইন ডাটাবেজে সংরক্ষিত হয়েছে!');
  };

  const handleFirstTimeGoogleConnect = async () => {
    setAuthError('');
    setSavingProfile(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      localStorage.setItem(GOOGLE_SETUP_ONCE_KEY, 'true');
      if (pendingNewAccount) {
        const updatedAcc: StoredAccount = {
          ...pendingNewAccount,
          uid: result.user.uid,
          shopCode: generateShopCode(result.user.uid),
        };
        const others = loadStoredAccounts().filter(
          (a) => a.phone !== updatedAcc.phone
        );
        saveStoredAccounts([updatedAcc, ...others]);
        await activateAccountSession(updatedAcc);
      }
      showToast('ব্যাকআপ সংযুক্ত ও নিবন্ধন সম্পন্ন হয়েছে!');
    } catch {
      localStorage.setItem(GOOGLE_SETUP_ONCE_KEY, 'true');
      if (pendingNewAccount) {
        await activateAccountSession(pendingNewAccount);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSkipFirstTimeGoogle = async () => {
    localStorage.setItem(GOOGLE_SETUP_ONCE_KEY, 'true');
    if (pendingNewAccount) {
      setSavingProfile(true);
      await activateAccountSession(pendingNewAccount);
      setSavingProfile(false);
    }
  };

  // Pure settlement calculator for a link:
  // Settles full Baki receipts starting from the oldest (bottom) receipt using approved Joma deposits.
  // Returns remaining unpaid Baki, leftover Joma, and the Set of paid Baki receipt IDs.
  const computeSettlementForTxs = (
    txList: LedgerTransaction[],
    fallbackBaki = 0,
    fallbackJoma = 0
  ) => {
    const approved = txList.filter((t) => t.status === 'approved');
    if (approved.length === 0) {
      return {
        remainingBaki: fallbackBaki,
        remainingJoma: fallbackJoma,
        paidBakiTxIds: new Set<string>(),
      };
    }

    // Index in txList (which is newest-first) so larger index = older transaction
    const indexMap = new Map<string, number>();
    txList.forEach((t, idx) => indexMap.set(t.id, idx));

    const bakiList = approved
      .filter((t) => t.type === 'baki')
      .slice()
      .sort((a, b) => {
        const dateCmp = (a.txDate || '').localeCompare(b.txDate || '');
        if (dateCmp !== 0) return dateCmp;
        const aMs = a.createdAt?.toMillis?.() || 0;
        const bMs = b.createdAt?.toMillis?.() || 0;
        if (aMs !== bMs) return aMs - bMs;
        // Fallback: higher index in newest-first array means older receipt
        return (indexMap.get(b.id) ?? 0) - (indexMap.get(a.id) ?? 0);
      });

    let availableJoma = approved
      .filter((t) => t.type === 'joma')
      .reduce((sum, t) => sum + t.amount, 0);

    let unpaidBaki = 0;
    const paidBakiTxIds = new Set<string>();

    for (const bakiTx of bakiList) {
      if (availableJoma >= bakiTx.amount) {
        availableJoma -= bakiTx.amount;
        paidBakiTxIds.add(bakiTx.id);
      } else {
        unpaidBaki += bakiTx.amount;
      }
    }

    return {
      remainingBaki: Math.min(
        VALIDATION_LIMITS.MAX_TOTAL,
        Math.max(0, Math.round(unpaidBaki))
      ),
      remainingJoma: Math.min(
        VALIDATION_LIMITS.MAX_TOTAL,
        Math.max(0, Math.round(availableJoma))
      ),
      paidBakiTxIds,
    };
  };

  // Update Link Balance (Online Firestore + Local) using full-receipt settlement logic
  const recalculateAndSyncLinkBalance = async (
    link: ShopCustomerLink,
    overrideTx?: LedgerTransaction
  ) => {
    const mergedTxsMap = new Map<string, LedgerTransaction>();
    allTxs.forEach((t) => {
      if (t.linkId === link.id) mergedTxsMap.set(t.id, t);
    });
    if (overrideTx && overrideTx.linkId === link.id) {
      mergedTxsMap.set(overrideTx.id, overrideTx);
    }

    const linkTxs = Array.from(mergedTxsMap.values());
    const { remainingBaki: nextBaki, remainingJoma: nextAgrim } =
      computeSettlementForTxs(linkTxs, link.totalBaki, link.totalAgrim);

    const updatedLink: ShopCustomerLink = {
      ...link,
      totalBaki: nextBaki,
      totalAgrim: nextAgrim,
    };

    setLocalLinks((prev) =>
      prev.map((l) => (l.id === link.id ? updatedLink : l))
    );

    if (isOnline) {
      try {
        await setDoc(doc(db, 'links', link.id), {
          shopkeeperId: updatedLink.shopkeeperId,
          customerId: updatedLink.customerId,
          shopName: sanitizeString(
            updatedLink.shopName,
            VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
          ),
          customerName: sanitizeString(
            updatedLink.customerName,
            VALIDATION_LIMITS.NAME_MAX_LEN
          ),
          customerPhone: sanitizeString(
            updatedLink.customerPhone || '',
            VALIDATION_LIMITS.PHONE_MAX_LEN
          ),
          totalBaki: nextBaki,
          totalAgrim: nextAgrim,
          status: updatedLink.status || 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Link balance Firestore sync error:', err);
      }
    }
  };

  // Link Customer with Shopkeeper via QR & Load That Shopkeeper's Product Catalog from Online Firestore
  const handleLinkShopById = async (rawPayload: string): Promise<string> => {
    if (!profile) return 'সংযুক্ত দোকান';

    let targetShopId = rawPayload.trim();
    let parsedShopName = '';
    let parsedShopCode = '';
    let incomingProducts: CatalogProduct[] | null = null;

    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.id === 'string' || typeof parsed.shopId === 'string') {
          targetShopId = parsed.id || parsed.shopId;
        }
        if (typeof parsed.code === 'string' || typeof parsed.shopCode === 'string') {
          parsedShopCode = parsed.code || parsed.shopCode;
        }
        if (typeof parsed.name === 'string' || typeof parsed.shopName === 'string') {
          parsedShopName = parsed.name || parsed.shopName;
        }
        if (Array.isArray(parsed.products) && parsed.products.length > 0) {
          incomingProducts = parsed.products;
        }
      }
    } catch {
      // plain ID or shopCode (e.g., AH-1234)
      if (targetShopId.toUpperCase().startsWith('AH-')) {
        parsedShopCode = targetShopId.toUpperCase();
      }
    }

    let shopNameFound = parsedShopName;
    let shopOwnerUid = targetShopId;
    let shopCodeFound = parsedShopCode;

    // 1. Check Online Firestore Database first (by shopCode and by targetShopId)
    if (isOnline) {
      const candidates = Array.from(
        new Set(
          [
            parsedShopCode,
            parsedShopCode.toUpperCase(),
            targetShopId,
            targetShopId.toUpperCase(),
          ].filter((c) => c && VALIDATION_LIMITS.ID_PATTERN.test(c))
        )
      );

      for (const candidateId of candidates) {
        try {
          const shopSnap = await getDoc(doc(db, 'shops', candidateId));
          if (shopSnap.exists()) {
            const sData = shopSnap.data() as Omit<Shop, 'id'> & {
              productsJson?: string;
            };
            shopNameFound = sData.shopName;
            shopOwnerUid = sData.ownerId;
            shopCodeFound = sData.shopCode;
            setActiveShopMeta((prev) => ({
              ...prev,
              ownerName: sData.ownerName || prev.ownerName,
              address: sData.category || prev.address,
            }));
            if (sData.productsJson && !incomingProducts) {
              try {
                const parsedProds = JSON.parse(sData.productsJson);
                if (Array.isArray(parsedProds) && parsedProds.length > 0) {
                  incomingProducts = parsedProds;
                }
              } catch {
                // ignore
              }
            }
            break;
          }
        } catch (err) {
          console.error('Online shop lookup error:', err);
        }
      }
    }

    // 2. Also check Local Storage fallback
    if (!shopNameFound) {
      try {
        const rawShops = localStorage.getItem(LOCAL_SHOPS_KEY);
        if (rawShops) {
          const shopsMap: Record<string, Shop> = JSON.parse(rawShops);
          const matchedShop =
            shopsMap[targetShopId] ||
            Object.values(shopsMap).find(
              (s) =>
                s.ownerId === targetShopId ||
                s.shopCode.toLowerCase() === targetShopId.toLowerCase() ||
                (parsedShopCode &&
                  s.shopCode.toLowerCase() === parsedShopCode.toLowerCase())
            );
          if (matchedShop) {
            shopNameFound = matchedShop.shopName;
            shopOwnerUid = matchedShop.ownerId;
            shopCodeFound = matchedShop.shopCode;
          }
        }
        if (!shopNameFound) {
          const matchedAccount = loadStoredAccounts().find(
            (acc) =>
              acc.role === 'shopkeeper' &&
              (acc.uid === targetShopId ||
                acc.phone === targetShopId ||
                (acc.shopCode &&
                  (acc.shopCode.toLowerCase() === targetShopId.toLowerCase() ||
                    acc.shopCode.toLowerCase() ===
                      parsedShopCode.toLowerCase())))
          );
          if (matchedAccount) {
            shopNameFound =
              matchedAccount.shopName || matchedAccount.displayName;
            shopOwnerUid = matchedAccount.uid;
            shopCodeFound = matchedAccount.shopCode || '';
          }
        }
      } catch {
        // ignore
      }
    }

    if (!shopNameFound) {
      shopNameFound = shopCodeFound
        ? `দোকান (${shopCodeFound})`
        : 'সংযুক্ত দোকান';
    }

    setShopCatalogs((prev) => {
      const resolvedCatalog =
        incomingProducts ||
        prev[shopOwnerUid] ||
        (shopCodeFound ? prev[shopCodeFound] : undefined) ||
        prev['latest_shopkeeper'] ||
        DEFAULT_PRODUCTS;
      return {
        ...prev,
        [shopOwnerUid]: resolvedCatalog,
        ...(shopCodeFound ? { [shopCodeFound]: resolvedCatalog } : {}),
      };
    });

    const linkId = `${shopOwnerUid}_${profile.uid}`
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .slice(0, VALIDATION_LIMITS.ID_MAX_LEN);

    const newLink: ShopCustomerLink = {
      id: linkId,
      shopkeeperId: shopOwnerUid,
      customerId: profile.uid,
      shopName: sanitizeString(
        shopNameFound,
        VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
      ),
      customerName: sanitizeString(
        profile.displayName,
        VALIDATION_LIMITS.NAME_MAX_LEN
      ),
      customerPhone: sanitizeString(
        profile.phone || '',
        VALIDATION_LIMITS.PHONE_MAX_LEN
      ),
      totalBaki: 0,
      totalAgrim: 0,
      status: 'active',
    };

    setLocalLinks((prev) => {
      const exists = prev.some((l) => l.id === linkId);
      return exists
        ? prev.map((l) =>
            l.id === linkId ? { ...l, shopName: newLink.shopName } : l
          )
        : [newLink, ...prev];
    });

    // Save Link to Online Firestore Database
    if (isOnline) {
      try {
        await setDoc(doc(db, 'links', linkId), {
          shopkeeperId: newLink.shopkeeperId,
          customerId: newLink.customerId,
          shopName: newLink.shopName,
          customerName: newLink.customerName,
          customerPhone: newLink.customerPhone,
          totalBaki: newLink.totalBaki,
          totalAgrim: newLink.totalAgrim,
          status: newLink.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Online link save error:', err);
      }
    }

    setSelectedLinkId(linkId);
    showToast(
      `"${newLink.shopName}" দোকানের সাথে অনলাইনে লিংক হয়েছে এবং দোকানের পণ্য লিস্ট যুক্ত হয়েছে!`
    );
    return newLink.shopName;
  };

  // Add Item to Draft ("যদি কোনো দোকান লিংক করা না থাকে তাহলে নতুন রশিদ তৈরি করা যাবে না")
  const handleAddDraftItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeLink) {
      showToast(
        activeRole === 'customer'
          ? 'কোনো দোকান লিংক করা নেই! নতুন রশিদ তৈরি করতে আগে কিউআর স্ক্যান করে দোকান লিংক করুন।'
          : allLinks.length === 0
          ? 'কোনো কাস্টমার যুক্ত নেই! নতুন রশিদ তৈরি করতে আগে কাস্টমার যুক্ত করুন।'
          : 'নতুন রশিদ তৈরির ক্ষেত্রে আগে কাস্টমার সিলেক্ট করুন!'
      );
      return;
    }

    const qty = Math.max(1, parseBanglaOrEnglishNumber(itemQty) || 1);
    const unit = parseBanglaOrEnglishNumber(itemUnitPrice);
    const lineTotal = qty * unit;

    if (!itemDesc.trim()) {
      showToast('পণ্যের বিবরণ লিখুন বা লিস্ট থেকে সিলেক্ট করুন।');
      return;
    }
    if (unit <= 0 || lineTotal <= 0 || lineTotal > VALIDATION_LIMITS.MAX_AMOUNT) {
      showToast('সঠিক দাম ও পরিমাণ বসান।');
      return;
    }

    const cleanName = sanitizeString(itemDesc, 120);

    // ONLY shopkeeper can save custom items to the product catalog
    if (
      activeRole === 'shopkeeper' &&
      entryInputMode === 'custom' &&
      saveCustomToCatalog
    ) {
      addProductToShopkeeperCatalog(cleanName, unit);
      setSaveCustomToCatalog(false);
    }

    const newItem: DraftLineItem = {
      id: generateSafeId('item'),
      itemName: cleanName,
      quantity: qty,
      unitPrice: unit,
      lineTotal,
      time: getCurrentBanglaTime(),
    };

    setDraftItems((prev) => [...prev, newItem]);
    if (entryInputMode === 'custom') {
      setItemDesc('');
      setItemUnitPrice('');
    }
    setItemQty('1');
    showToast(`"${cleanName}" খসড়ায় যোগ করা হয়েছে!`);
  };

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Submit & Create Receipt ("যদি কোনো দোকান লিংক করা না থাকে তাহলে নতুন রশিদ তৈরি করা যাবে না")
  const handleSubmitDraftAndCreateInvoice = async () => {
    if (!profile) return;

    if (!activeLink) {
      showToast(
        activeRole === 'customer'
          ? 'কোনো দোকান লিংক করা নেই! নতুন রশিদ তৈরি করতে আগে কিউআর স্ক্যান করে দোকান লিংক করুন।'
          : allLinks.length === 0
          ? 'কোনো কাস্টমার যুক্ত নেই! নতুন রশিদ তৈরি করতে আগে কাস্টমার যুক্ত করুন।'
          : 'নতুন রশিদ তৈরির ক্ষেত্রে আগে কাস্টমার সিলেক্ট করুন!'
      );
      return;
    }

    let itemsToSubmit = [...draftItems];
    if (itemsToSubmit.length === 0 && itemDesc.trim() && currentFormLineTotal > 0) {
      const qty = Math.max(1, parseBanglaOrEnglishNumber(itemQty) || 1);
      const unit = parseBanglaOrEnglishNumber(itemUnitPrice);
      const cleanName = sanitizeString(itemDesc, 120);

      if (
        activeRole === 'shopkeeper' &&
        entryInputMode === 'custom' &&
        saveCustomToCatalog
      ) {
        addProductToShopkeeperCatalog(cleanName, unit);
        setSaveCustomToCatalog(false);
      }

      itemsToSubmit = [
        {
          id: generateSafeId('item'),
          itemName: cleanName,
          quantity: qty,
          unitPrice: unit,
          lineTotal: qty * unit,
          time: getCurrentBanglaTime(),
        },
      ];
    }

    if (itemsToSubmit.length === 0) {
      showToast('রশিদ তৈরির জন্য পণ্য সিলেক্ট করুন বা খসড়ায় যোগ করুন।');
      return;
    }

    const targetLink = activeLink;

    const grandTotal = Math.min(
      VALIDATION_LIMITS.MAX_AMOUNT,
      itemsToSubmit.reduce((sum, it) => sum + it.lineTotal, 0)
    );
    const invoiceNo = generateInvoiceNumber();
    const serializedDesc = serializeInvoiceDescription(
      invoiceNo,
      itemsToSubmit
    );
    const today = getTodayIsoDate();
    setTodayIsoDate(today);
    const txId = generateSafeId('tx');

    const initialStatus: TransactionStatus =
      activeRole === 'customer' ? 'pending_shopkeeper' : 'approved';

    const newTx: LedgerTransaction = {
      id: txId,
      linkId: targetLink.id,
      shopkeeperId: targetLink.shopkeeperId,
      customerId: targetLink.customerId,
      createdBy: profile.uid,
      creatorRole: activeRole,
      shopName: sanitizeString(
        targetLink.shopName,
        VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
      ),
      customerName: sanitizeString(
        targetLink.customerName,
        VALIDATION_LIMITS.NAME_MAX_LEN
      ),
      type: entryType,
      amount: grandTotal,
      description: serializedDesc,
      proposedAmount: 0,
      proposedDescription: '',
      editReason: '',
      status: initialStatus,
      syncMethod: isOnline ? 'online' : 'wifi_bt_qr',
      txDate: today,
    };

    if (!isOnline) {
      const offlinePacket: OfflinePacket = {
        packetType: 'AMAR_HISHAB_SYNC_V1',
        id: txId,
        linkId: targetLink.id,
        shopkeeperId: targetLink.shopkeeperId,
        customerId: targetLink.customerId,
        createdBy: profile.uid,
        creatorRole: activeRole,
        shopName: targetLink.shopName,
        customerName: targetLink.customerName,
        type: entryType,
        amount: grandTotal,
        description: serializedDesc,
        txDate: today,
        timestamp: Date.now(),
      };
      setOfflineQueue((prev) => [offlinePacket, ...prev]);
    }

    setSubmittingDraft(true);
    try {
      setLocalTxs((prev) => [newTx, ...prev]);

      // Auto-transmit over WiFi / Local Network to connected Shopkeeper
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('amar_hishab_wifi_sync_v1');
          bc.postMessage({ type: 'WIFI_TX_NEW', tx: newTx });
          bc.close();
        } catch {
          // ignore
        }
      }

      // Save Receipt directly to Online Firestore Database
      if (isOnline) {
        try {
          await setDoc(doc(db, 'transactions', txId), {
            linkId: newTx.linkId,
            shopkeeperId: newTx.shopkeeperId,
            customerId: newTx.customerId,
            createdBy: profile.uid,
            creatorRole: newTx.creatorRole,
            shopName: newTx.shopName,
            customerName: newTx.customerName,
            type: newTx.type,
            amount: newTx.amount,
            description: newTx.description,
            proposedAmount: 0,
            proposedDescription: '',
            editReason: '',
            status: newTx.status,
            syncMethod: newTx.syncMethod,
            txDate: newTx.txDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Transaction Firestore save error:', err);
        }
      }

      if (initialStatus === 'approved') {
        await recalculateAndSyncLinkBalance(targetLink, newTx);
      }

      setDraftItems([]);
      if (entryInputMode === 'custom') {
        setItemDesc('');
        setItemUnitPrice('');
      }
      setItemQty('1');
      setExpandedTxDate(today);
      setActiveInvoiceTx(newTx);
      showToast('রশিদ সফলভাবে তৈরি ও অনলাইন ডাটাবেজে সাবমিট হয়েছে!');
    } finally {
      setSubmittingDraft(false);
    }
  };

  // Submit & Create Joma (Deposit) Receipt ("এখানে জমার পরিমান দেওয়া থাকবে। এন্ট্রি দিতে নতুন জমার রশিদ হবে। দোকানদারের অনুমোদন লাগবে। আগের মতই।")
  const handleSubmitJomaReceipt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile) return;

    if (!activeLink) {
      showToast(
        activeRole === 'customer'
          ? 'কোনো দোকান লিংক করা নেই! জমার রশিদ তৈরি করতে আগে কিউআর স্ক্যান করে দোকান লিংক করুন।'
          : allLinks.length === 0
          ? 'কোনো কাস্টমার যুক্ত নেই! জমার রশিদ তৈরি করতে আগে কাস্টমার যুক্ত করুন।'
          : 'জমার রশিদ তৈরির ক্ষেত্রে আগে কাস্টমার সিলেক্ট করুন!'
      );
      return;
    }

    const jomaAmount = Math.min(
      VALIDATION_LIMITS.MAX_AMOUNT,
      parseBanglaOrEnglishNumber(jomaAmountInput)
    );
    if (jomaAmount <= 0) {
      showToast('সঠিক জমার পরিমান (৳) লিখুন।');
      return;
    }

    const targetLink = activeLink;
    const invoiceNo = generateInvoiceNumber();
    const noteText = sanitizeString(
      jomaNoteInput.trim() || 'জমা প্রদান',
      120
    );
    const jomaLineItem: DraftLineItem = {
      id: generateSafeId('joma'),
      itemName: noteText,
      quantity: 1,
      unitPrice: jomaAmount,
      lineTotal: jomaAmount,
      time: getCurrentBanglaTime(),
    };

    const serializedDesc = serializeInvoiceDescription(invoiceNo, [
      jomaLineItem,
    ]);
    const today = getTodayIsoDate();
    setTodayIsoDate(today);
    const txId = generateSafeId('tx');

    const initialStatus: TransactionStatus =
      activeRole === 'customer' ? 'pending_shopkeeper' : 'approved';

    const newJomaTx: LedgerTransaction = {
      id: txId,
      linkId: targetLink.id,
      shopkeeperId: targetLink.shopkeeperId,
      customerId: targetLink.customerId,
      createdBy: profile.uid,
      creatorRole: activeRole,
      shopName: sanitizeString(
        targetLink.shopName,
        VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
      ),
      customerName: sanitizeString(
        targetLink.customerName,
        VALIDATION_LIMITS.NAME_MAX_LEN
      ),
      type: 'joma',
      amount: jomaAmount,
      description: serializedDesc,
      proposedAmount: 0,
      proposedDescription: '',
      editReason: '',
      status: initialStatus,
      syncMethod: isOnline ? 'online' : 'wifi_bt_qr',
      txDate: today,
    };

    if (!isOnline) {
      const offlinePacket: OfflinePacket = {
        packetType: 'AMAR_HISHAB_SYNC_V1',
        id: txId,
        linkId: targetLink.id,
        shopkeeperId: targetLink.shopkeeperId,
        customerId: targetLink.customerId,
        createdBy: profile.uid,
        creatorRole: activeRole,
        shopName: targetLink.shopName,
        customerName: targetLink.customerName,
        type: 'joma',
        amount: jomaAmount,
        description: serializedDesc,
        txDate: today,
        timestamp: Date.now(),
      };
      setOfflineQueue((prev) => [offlinePacket, ...prev]);
    }

    setSubmittingDraft(true);
    try {
      setLocalTxs((prev) => [newJomaTx, ...prev]);

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('amar_hishab_wifi_sync_v1');
          bc.postMessage({ type: 'WIFI_TX_NEW', tx: newJomaTx });
          bc.close();
        } catch {
          // ignore
        }
      }

      if (isOnline) {
        try {
          await setDoc(doc(db, 'transactions', txId), {
            linkId: newJomaTx.linkId,
            shopkeeperId: newJomaTx.shopkeeperId,
            customerId: newJomaTx.customerId,
            createdBy: profile.uid,
            creatorRole: newJomaTx.creatorRole,
            shopName: newJomaTx.shopName,
            customerName: newJomaTx.customerName,
            type: 'joma',
            amount: newJomaTx.amount,
            description: newJomaTx.description,
            proposedAmount: 0,
            proposedDescription: '',
            editReason: '',
            status: newJomaTx.status,
            syncMethod: newJomaTx.syncMethod,
            txDate: newJomaTx.txDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Joma Transaction Firestore save error:', err);
        }
      }

      if (initialStatus === 'approved') {
        await recalculateAndSyncLinkBalance(targetLink, newJomaTx);
      }

      setJomaAmountInput('');
      setJomaNoteInput('');
      setExpandedTxDate(today);
      setActiveInvoiceTx(newJomaTx);
      showToast(
        activeRole === 'customer'
          ? 'জমার রশিদ তৈরি হয়েছে এবং দোকানদারের অনুমোদনের জন্য পাঠানো হয়েছে!'
          : 'জমার রশিদ সফলভাবে তৈরি ও অনুমোদিত হয়েছে!'
      );
    } finally {
      setSubmittingDraft(false);
    }
  };

  // Shopkeeper Adds Customer Manually
  const handleAddCustomerManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newCustName.trim()) return;

    setAddingCustomer(true);
    const linkId = generateSafeId(`link_${profile.uid.slice(0, 8)}`);
    const newLink: ShopCustomerLink = {
      id: linkId,
      shopkeeperId: profile.uid,
      customerId: profile.uid,
      shopName: sanitizeString(
        profile.shopName || 'আমার দোকান',
        VALIDATION_LIMITS.SHOP_NAME_MAX_LEN
      ),
      customerName: sanitizeString(
        newCustName,
        VALIDATION_LIMITS.NAME_MAX_LEN
      ),
      customerPhone: sanitizeString(
        newCustPhone,
        VALIDATION_LIMITS.PHONE_MAX_LEN
      ),
      totalBaki: 0,
      totalAgrim: 0,
      status: 'active',
    };

    try {
      setLocalLinks((prev) => [newLink, ...prev]);
      if (isOnline) {
        try {
          await setDoc(doc(db, 'links', linkId), {
            shopkeeperId: newLink.shopkeeperId,
            customerId: newLink.customerId,
            shopName: newLink.shopName,
            customerName: newLink.customerName,
            customerPhone: newLink.customerPhone,
            totalBaki: 0,
            totalAgrim: 0,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Manual customer link Firestore error:', err);
        }
      }
      setSelectedLinkId(linkId);
      setNewCustName('');
      setNewCustPhone('');
      setShowAddCustomerModal(false);
      showToast('নতুন কাস্টমার যুক্ত হয়েছে!');
    } finally {
      setAddingCustomer(false);
    }
  };

  // Verification Actions (Synced with Online Firestore Database)
  const handleShopkeeperApprove = async (tx: LedgerTransaction) => {
    const updatedTx: LedgerTransaction = { ...tx, status: 'approved' };
    setLocalTxs((prev) =>
      prev.map((item) => (item.id === tx.id ? updatedTx : item))
    );
    if (isOnline) {
      try {
        await setDoc(doc(db, 'transactions', tx.id), {
          linkId: updatedTx.linkId,
          shopkeeperId: updatedTx.shopkeeperId,
          customerId: updatedTx.customerId,
          createdBy: updatedTx.createdBy,
          creatorRole: updatedTx.creatorRole,
          shopName: updatedTx.shopName,
          customerName: updatedTx.customerName,
          type: updatedTx.type,
          amount: updatedTx.amount,
          description: updatedTx.description,
          proposedAmount: updatedTx.proposedAmount || 0,
          proposedDescription: updatedTx.proposedDescription || '',
          editReason: updatedTx.editReason || '',
          status: 'approved',
          syncMethod: updatedTx.syncMethod || 'online',
          txDate: updatedTx.txDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Shopkeeper approve Firestore error:', err);
      }
    }
    const link = allLinks.find((l) => l.id === tx.linkId);
    if (link) {
      await recalculateAndSyncLinkBalance(link, updatedTx);
    }
    showToast('রশিদ অনুমোদিত হয়েছে!');
  };

  const handleShopkeeperModify = async (
    tx: LedgerTransaction,
    newAmount: number,
    newDescription: string,
    reason: string
  ) => {
    const cleanAmt = Math.min(
      VALIDATION_LIMITS.MAX_AMOUNT,
      Math.max(1, Math.round(newAmount))
    );
    const cleanDesc = sanitizeString(
      newDescription,
      VALIDATION_LIMITS.DESC_MAX_LEN
    );
    const cleanReason = sanitizeString(reason, VALIDATION_LIMITS.REASON_MAX_LEN);

    const modifiedTxObj: LedgerTransaction = {
      ...tx,
      proposedAmount: cleanAmt,
      proposedDescription: cleanDesc,
      editReason: cleanReason,
      status: 'pending_customer_approval',
    };

    setLocalTxs((prev) =>
      prev.map((item) => (item.id === tx.id ? modifiedTxObj : item))
    );

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('amar_hishab_wifi_sync_v1');
        bc.postMessage({ type: 'WIFI_TX_MODIFIED', tx: modifiedTxObj });
        bc.close();
      } catch {
        // ignore
      }
    }

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const inv = parseInvoiceDescription(tx.description, tx.amount, tx.id);
        new Notification('আমার হিসাব — পেন্ডিং রশিদ নোটিফিকেশন', {
          body: `দোকানদার রশিদ নং ${inv.invoiceNo} সংশোধন করেছেন (সংশোধিত বিল: ${formatTaka(
            cleanAmt
          )})। অনুমোদন পেইজ থেকে যাচাই করুন।`,
        });
      } catch {
        // ignore
      }
    }

    if (isOnline) {
      try {
        await setDoc(doc(db, 'transactions', tx.id), {
          linkId: modifiedTxObj.linkId,
          shopkeeperId: modifiedTxObj.shopkeeperId,
          customerId: modifiedTxObj.customerId,
          createdBy: modifiedTxObj.createdBy,
          creatorRole: modifiedTxObj.creatorRole,
          shopName: modifiedTxObj.shopName,
          customerName: modifiedTxObj.customerName,
          type: modifiedTxObj.type,
          amount: modifiedTxObj.amount,
          description: modifiedTxObj.description,
          proposedAmount: cleanAmt,
          proposedDescription: cleanDesc,
          editReason: cleanReason,
          status: 'pending_customer_approval',
          syncMethod: modifiedTxObj.syncMethod || 'online',
          txDate: modifiedTxObj.txDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Shopkeeper modify Firestore error:', err);
      }
    }
    showToast(
      'সংশোধিত হিসাব কাস্টমারের মোবাইলে পেন্ডিং রশিদ নোটিফিকেশন হিসেবে পাঠানো হয়েছে!'
    );
  };

  const handleCustomerApproveCorrection = async (tx: LedgerTransaction) => {
    const finalAmount = tx.proposedAmount;
    const finalDescription = tx.proposedDescription || tx.description;

    const approvedTx: LedgerTransaction = {
      ...tx,
      amount: finalAmount,
      description: finalDescription,
      status: 'approved',
    };

    setLocalTxs((prev) =>
      prev.map((item) => (item.id === tx.id ? approvedTx : item))
    );

    if (isOnline) {
      try {
        await setDoc(doc(db, 'transactions', tx.id), {
          linkId: approvedTx.linkId,
          shopkeeperId: approvedTx.shopkeeperId,
          customerId: approvedTx.customerId,
          createdBy: approvedTx.createdBy,
          creatorRole: approvedTx.creatorRole,
          shopName: approvedTx.shopName,
          customerName: approvedTx.customerName,
          type: approvedTx.type,
          amount: finalAmount,
          description: finalDescription,
          proposedAmount: approvedTx.proposedAmount || 0,
          proposedDescription: approvedTx.proposedDescription || '',
          editReason: approvedTx.editReason || '',
          status: 'approved',
          syncMethod: approvedTx.syncMethod || 'online',
          txDate: approvedTx.txDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Customer approve correction Firestore error:', err);
      }
    }
    const link = allLinks.find((l) => l.id === tx.linkId);
    if (link) {
      await recalculateAndSyncLinkBalance(link, approvedTx);
    }
    showToast('সংশোধিত রশিদ অনুমোদিত হয়েছে!');
  };

  const handleRejectTransaction = async (
    tx: LedgerTransaction,
    reason: string
  ) => {
    const cleanReason = sanitizeString(reason, VALIDATION_LIMITS.REASON_MAX_LEN);
    const rejectedTx: LedgerTransaction = {
      ...tx,
      status: 'rejected',
      editReason: cleanReason,
    };
    setLocalTxs((prev) =>
      prev.map((item) => (item.id === tx.id ? rejectedTx : item))
    );
    if (isOnline) {
      try {
        await setDoc(doc(db, 'transactions', tx.id), {
          linkId: rejectedTx.linkId,
          shopkeeperId: rejectedTx.shopkeeperId,
          customerId: rejectedTx.customerId,
          createdBy: rejectedTx.createdBy,
          creatorRole: rejectedTx.creatorRole,
          shopName: rejectedTx.shopName,
          customerName: rejectedTx.customerName,
          type: rejectedTx.type,
          amount: rejectedTx.amount,
          description: rejectedTx.description,
          proposedAmount: rejectedTx.proposedAmount || 0,
          proposedDescription: rejectedTx.proposedDescription || '',
          editReason: cleanReason,
          status: 'rejected',
          syncMethod: rejectedTx.syncMethod || 'online',
          txDate: rejectedTx.txDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Reject transaction Firestore error:', err);
      }
    }
    showToast('রশিদটি বাতিল করা হয়েছে।');
  };

  // Offline Sync Handlers
  const handleSyncAllOnline = async () => {
    setOfflineQueue([]);
    showToast('সকল অফলাইন এন্ট্রি সিঙ্ক হয়েছে!');
  };

  const handleImportOfflinePacket = async (rawJson: string) => {
    if (!profile) return;
    let parsed: OfflinePacket;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('অকার্যকর ডাটা প্যাকেট ফরম্যাট।');
    }
    if (parsed.packetType !== 'AMAR_HISHAB_SYNC_V1' || !parsed.linkId) {
      throw new Error('এটি আমার হিসাব অ্যাপের বৈধ ডাটা প্যাকেট নয়।');
    }

    const txId = generateSafeId('tx_bt');
    const initialStatus: TransactionStatus =
      activeRole === 'shopkeeper' ? 'approved' : 'pending_shopkeeper';

    const importedTx: LedgerTransaction = {
      id: txId,
      linkId: parsed.linkId,
      shopkeeperId: parsed.shopkeeperId,
      customerId: parsed.customerId,
      createdBy: profile.uid,
      creatorRole: activeRole,
      shopName: parsed.shopName,
      customerName: parsed.customerName,
      type: parsed.type,
      amount: parsed.amount,
      description: parsed.description,
      proposedAmount: 0,
      proposedDescription: '',
      editReason: '',
      status: initialStatus,
      syncMethod: 'wifi_bt_qr',
      txDate: parsed.txDate || getTodayIsoDate(),
    };

    setLocalTxs((prev) => [importedTx, ...prev]);
    if (initialStatus === 'approved') {
      const foundLink = allLinks.find((l) => l.id === parsed.linkId);
      if (foundLink) {
        await recalculateAndSyncLinkBalance(foundLink, importedTx);
      }
    }
    showToast('অফলাইন ডাটা সফলভাবে গ্রহণ করা হয়েছে!');
  };

  // Update Quick Lock PIN in Settings ("পিন সেট করার অপশন / পরিবর্তন করার অপশন")
  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;
    if (newPinInput.trim().length < 4) {
      showToast('পিন কমপক্ষে ৪ সংখ্যার হতে হবে।');
      return;
    }
    if (newPinInput.trim() !== newPinConfirmInput.trim()) {
      showToast('পিন ও কনফার্ম পিন মিলছে না।');
      return;
    }
    const updated: StoredAccount = {
      ...currentAccount,
      quickLockPin: newPinInput.trim(),
      pinBioExitLockEnabled: true,
    };
    const others = loadStoredAccounts().filter(
      (a) => a.phone !== updated.phone
    );
    saveStoredAccounts([updated, ...others]);
    setCurrentAccount(updated);
    void syncAccountToFirestore(updated);
    setNewPinInput('');
    setNewPinConfirmInput('');
    setShowPinChangeModal(false);
    showToast('সুরক্ষা পিন সফলভাবে সেট করা হয়েছে!');
  };

  // Update Main Login Password in Settings ("তার নিচে লগইন পাসওয়ার্ড পরিবর্তনের অপশন থাকবে")
  const handleUpdateLoginPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;
    if (
      currentLoginPinInput.trim() &&
      currentLoginPinInput.trim() !== currentAccount.pin
    ) {
      showToast('বর্তমান লগইন পাসওয়ার্ড সঠিক নয়।');
      return;
    }
    if (newLoginPinInput.trim().length < 4) {
      showToast('নতুন লগইন পাসওয়ার্ড কমপক্ষে ৪ সংখ্যার হতে হবে।');
      return;
    }
    if (newLoginPinInput.trim() !== newLoginPinConfirmInput.trim()) {
      showToast('নতুন লগইন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না।');
      return;
    }
    const updated: StoredAccount = {
      ...currentAccount,
      pin: newLoginPinInput.trim(),
    };
    const others = loadStoredAccounts().filter(
      (a) => a.phone !== updated.phone
    );
    saveStoredAccounts([updated, ...others]);
    setCurrentAccount(updated);
    void syncAccountToFirestore(updated);
    setCurrentLoginPinInput('');
    setNewLoginPinInput('');
    setNewLoginPinConfirmInput('');
    setShowLoginPinModal(false);
    showToast('লগইন পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!');
  };

  // Profile Edit Photo Upload & Save ("প্রোফাইল অংশ ছবি, নাম, মোবাইল নং, ঠিকানা পরিবর্তনের অপশন")
  const handleProfileEditPhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 140;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, size, size);
          setEditPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.8));
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const openProfileEditModal = () => {
    if (!currentAccount) return;
    setEditNameInput(currentAccount.displayName);
    setEditPhoneInput(currentAccount.phone);
    setEditAddressInput(
      currentAccount.address || currentAccount.shopAddress || 'প্রধান সড়ক, সদর'
    );
    setEditPhotoDataUrl(currentAccount.photoDataUrl || '');
    setShowProfileEditModal(true);
  };

  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAccount) return;
    const isShopkeeperRole = currentAccount.role === 'shopkeeper';
    // দোকানদারের জন্য দোকানের নাম, প্রোফাইটর ও মোবাইল লক থাকবে, শুধুমাত্র ঠিকানা পরিবর্তন করা যাবে
    const cleanName = isShopkeeperRole
      ? currentAccount.displayName
      : sanitizeString(
          editNameInput.trim() || currentAccount.displayName,
          VALIDATION_LIMITS.NAME_MAX_LEN
        );
    const cleanPhone = isShopkeeperRole
      ? currentAccount.phone
      : sanitizeString(
          editPhoneInput.trim() || currentAccount.phone,
          VALIDATION_LIMITS.PHONE_MAX_LEN
        );
    const cleanAddress = sanitizeString(
      editAddressInput.trim() || 'প্রধান সড়ক, সদর',
      VALIDATION_LIMITS.CATEGORY_MAX_LEN
    );

    const oldPhone = currentAccount.phone;
    const updated: StoredAccount = {
      ...currentAccount,
      displayName: cleanName,
      phone: cleanPhone,
      address: cleanAddress,
      shopAddress: cleanAddress,
      photoDataUrl: editPhotoDataUrl || currentAccount.photoDataUrl,
    };

    const others = loadStoredAccounts().filter(
      (a) => a.phone !== oldPhone && a.phone !== cleanPhone
    );
    saveStoredAccounts([updated, ...others]);
    setCurrentAccount(updated);
    saveActiveSession({ accountPhone: cleanPhone, isLocked: false });

    await syncAccountToFirestore(updated);

    // Update customer name/phone in local links so receipts stay updated
    if (!isShopkeeperRole) {
      setLocalLinks((prev) =>
        prev.map((l) =>
          l.customerId === updated.uid
            ? { ...l, customerName: cleanName, customerPhone: cleanPhone }
            : l
        )
      );
    }

    setShowProfileEditModal(false);
    showToast('প্রোফাইল তথ্য সফলভাবে অনলাইন ডাটাবেজে আপডেট করা হয়েছে!');
  };

  const draftTotalAmount = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [draftItems]
  );

  // Full-Receipt Oldest-First Settlement Engine across all links
  const ledgerSettlement = useMemo(() => {
    const paidBakiTxIds = new Set<string>();
    const linkBalancesMap = new Map<
      string,
      { remainingBaki: number; remainingJoma: number }
    >();

    // Group transactions by linkId
    const linkIds = new Set<string>();
    allLinks.forEach((l) => linkIds.add(l.id));
    allTxs.forEach((tx) => {
      if (tx.linkId) linkIds.add(tx.linkId);
    });

    let totalBaki = 0;
    let totalJoma = 0;

    linkIds.forEach((lid) => {
      const linkTxs = allTxs.filter((tx) => tx.linkId === lid);
      if (linkTxs.length > 0) {
        const res = computeSettlementForTxs(linkTxs);
        res.paidBakiTxIds.forEach((id) => paidBakiTxIds.add(id));
        linkBalancesMap.set(lid, {
          remainingBaki: res.remainingBaki,
          remainingJoma: res.remainingJoma,
        });
        totalBaki += res.remainingBaki;
        totalJoma += res.remainingJoma;
      } else {
        const foundLink = allLinks.find((l) => l.id === lid);
        const baki = foundLink?.totalBaki || 0;
        const joma = foundLink?.totalAgrim || 0;
        linkBalancesMap.set(lid, {
          remainingBaki: baki,
          remainingJoma: joma,
        });
        totalBaki += baki;
        totalJoma += joma;
      }
    });

    return {
      totalBaki,
      totalJoma,
      paidBakiTxIds,
      linkBalancesMap,
    };
  }, [allLinks, allTxs, computeSettlementForTxs]);

  // Metrics
  // "আজকের বাকী যেটা সেটা তারিখ পরিবর্তন হলে রিসেট হয়ে যাবে, আর আজ যদি ৩ টি ইনভয়েজ হয়, এবং একটি ড্রাফট হয় তা সহ দেখাবে আজকের বাকির হিসাব।"
  const totals = useMemo(() => {
    const totalBaki = ledgerSettlement.totalBaki;
    const totalAgrim = ledgerSettlement.totalJoma;

    const todayBakiReceipts = allTxs.filter(
      (tx) =>
        tx.txDate === todayIsoDate &&
        tx.type === 'baki' &&
        tx.status !== 'rejected' &&
        !ledgerSettlement.paidBakiTxIds.has(tx.id)
    );

    const todaySubmittedBaki = todayBakiReceipts.reduce(
      (sum, tx) => sum + tx.amount,
      0
    );

    // Combine today's submitted receipts + current draft into আজকের বাকী
    const todayBakiWithDraft =
      todaySubmittedBaki + (draftItems.length > 0 ? draftTotalAmount : 0);

    const dailyTotalSales = allTxs
      .filter(
        (tx) =>
          tx.status === 'approved' &&
          tx.txDate === todayIsoDate &&
          (tx.type === 'baki' || tx.type === 'nagad')
      )
      .reduce((sum, tx) => sum + tx.amount, 0);

    const pendingToVerify = allTxs.filter(
      (tx) => tx.status === 'pending_shopkeeper'
    );
    const pendingCustomerApprovals = allTxs.filter(
      (tx) => tx.status === 'pending_customer_approval'
    );
    const approvedList = allTxs.filter((tx) => tx.status === 'approved');
    const rejectedList = allTxs.filter((tx) => tx.status === 'rejected');

    return {
      totalBaki,
      totalAgrim,
      todayBaki: todayBakiWithDraft,
      todayReceiptCount: todayBakiReceipts.length,
      dailyTotalSales,
      pendingToVerify,
      pendingCustomerApprovals,
      approvedList,
      rejectedList,
    };
  }, [
    ledgerSettlement,
    allTxs,
    todayIsoDate,
    draftItems.length,
    draftTotalAmount,
  ]);

  // Group transactions by Date for the লেনদেন (len_den) page
  const dateGroupedLedger = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        date: string;
        txs: LedgerTransaction[];
        bakiSum: number;
        agrimSum: number;
        netBakiOrAgrim: number; // > 0 means Baki (-৫০০), < 0 means Joma (+৫০০)
      }
    >();

    allTxs.forEach((tx) => {
      const d = tx.txDate || todayIsoDate;
      const existing = groupsMap.get(d) || {
        date: d,
        txs: [],
        bakiSum: 0,
        agrimSum: 0,
        netBakiOrAgrim: 0,
      };
      existing.txs.push(tx);
      if (tx.status !== 'rejected') {
        if (tx.type === 'baki') {
          existing.bakiSum += tx.amount;
        } else if (tx.type === 'joma') {
          existing.agrimSum += tx.amount;
        }
        existing.netBakiOrAgrim = existing.bakiSum - existing.agrimSum;
      }
      groupsMap.set(d, existing);
    });

    return Array.from(groupsMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [allTxs, todayIsoDate]);

  const activePendingList =
    activeRole === 'shopkeeper'
      ? totals.pendingToVerify
      : totals.pendingCustomerApprovals;

  const availableRegisteredShops = useMemo(() => loadLocalShopsList(), [
    qrModalState.open,
    sessionUnlocked,
  ]);

  const selectedProductObj = useMemo(
    () => sortedProductCatalog.find((p) => p.id === selectedProductId) || null,
    [sortedProductCatalog, selectedProductId]
  );

  const isSelectedProductPinned = useMemo(() => {
    if (!selectedProductObj) return false;
    return (
      customerPinnedIds.includes(selectedProductObj.id) ||
      customerPinnedIds.includes(selectedProductObj.name)
    );
  }, [selectedProductObj, customerPinnedIds]);

  // Resolve Shop Owner, Shop Phone, Shop Address, Customer Phone & Address for Receipt Modal
  const activeModalCustomerPhone = useMemo(() => {
    if (!activeInvoiceTx) return profile?.phone || '০১৮১২৩৪৫৬৭৮';
    const link = allLinks.find((l) => l.id === activeInvoiceTx.linkId);
    if (link?.customerPhone) return link.customerPhone;
    if (activeRole === 'customer') return profile?.phone || '০১৮১২৩৪৫৬৭৮';
    return '০১৮১২৩৪৫৬৭৮';
  }, [activeInvoiceTx, allLinks, activeRole, profile]);

  const activeModalShopOwnerName = useMemo(() => {
    if (activeRole === 'shopkeeper' && profile?.displayName) {
      return profile.displayName;
    }
    if (activeShopMeta.ownerName) return activeShopMeta.ownerName;
    if (activeInvoiceTx) {
      const storedAcc = loadStoredAccounts().find(
        (a) => a.uid === activeInvoiceTx.shopkeeperId
      );
      if (storedAcc?.displayName) return storedAcc.displayName;
    }
    return 'মোঃ রফিকুল ইসলাম';
  }, [activeRole, profile, activeShopMeta.ownerName, activeInvoiceTx]);

  const activeModalShopPhone = useMemo(() => {
    if (activeRole === 'shopkeeper' && profile?.phone) {
      return profile.phone;
    }
    if (activeShopMeta.phone) return activeShopMeta.phone;
    if (activeInvoiceTx) {
      const storedAcc = loadStoredAccounts().find(
        (a) => a.uid === activeInvoiceTx.shopkeeperId
      );
      if (storedAcc?.phone) return storedAcc.phone;
    }
    return '০১৭১১২২৩৩৪৪';
  }, [activeRole, profile, activeShopMeta.phone, activeInvoiceTx]);

  const activeModalShopAddress = useMemo(() => {
    if (activeRole === 'shopkeeper') {
      return (
        currentAccount?.shopAddress ||
        currentAccount?.address ||
        'প্রধান বাজার, সদর'
      );
    }
    if (activeShopMeta.address) return activeShopMeta.address;
    if (!activeInvoiceTx)
      return currentAccount?.shopAddress || 'প্রধান বাজার, সদর';
    const foundShop = availableRegisteredShops.find(
      (s) => s.ownerId === activeInvoiceTx.shopkeeperId
    );
    return (
      foundShop?.category ||
      currentAccount?.shopAddress ||
      'প্রধান বাজার, সদর'
    );
  }, [
    activeRole,
    activeShopMeta.address,
    activeInvoiceTx,
    availableRegisteredShops,
    currentAccount,
  ]);

  // ============================================================================
  // AUTH / LOCK SCREENS
  // ============================================================================
  if (!sessionUnlocked || !profile) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="pt-8 pb-4 px-6 text-center space-y-1.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0F3878] text-white flex items-center justify-center mx-auto shadow-sm">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F3878]">
              আমার হিসাব
            </h1>
          </div>

          <div className="px-6 pb-8 space-y-5">
            {/* 1. QUICK PIN / FINGERPRINT UNLOCK */}
            {authScreen === 'quick_unlock' && currentAccount && (
              <div className="space-y-4 text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold">
                  <Fingerprint className="w-3.5 h-3.5" />
                  সুরক্ষা সক্রিয়
                </div>

                <div className="flex flex-col items-center space-y-2">
                  {currentAccount.photoDataUrl ? (
                    <img
                      src={currentAccount.photoDataUrl}
                      alt={currentAccount.displayName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-2 border-[#155DFC]"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-blue-100 text-[#0F3878] flex items-center justify-center font-extrabold text-xl">
                      {currentAccount.displayName.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <p className="text-base font-extrabold text-slate-900">
                      {currentAccount.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {toBanglaDigitsPlain(currentAccount.phone)} ·{' '}
                      {currentAccount.role === 'shopkeeper'
                        ? 'দোকানদার'
                        : 'কাস্টমার'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      মোবাইলে দেওয়া ফিঙ্গারপ্রিন্ট বা পিন দিয়ে সরাসরি প্রবেশ করুন
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFingerprintUnlock}
                  className="w-full min-h-[48px] py-2.5 px-4 rounded-xl border-2 border-emerald-600 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Fingerprint className="w-5 h-5 text-emerald-700" />
                  ফিঙ্গারপ্রিন্ট / বায়োমেট্রিক দিয়ে খুলুন
                </button>

                <form onSubmit={handleQuickPinUnlock} className="space-y-3">
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={quickPin}
                      onChange={(e) => setQuickPin(e.target.value)}
                      placeholder="আপনার পিন দিন"
                      className="w-full min-h-[48px] pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-base font-bold tracking-widest text-slate-900 focus:outline-none focus:border-[#155DFC]"
                    />
                  </div>

                  {authError && (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[48px] py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold shadow-md transition-colors"
                  >
                    পিন দিয়ে প্রবেশ করুন
                  </button>
                </form>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      saveActiveSession(null);
                      setCurrentAccount(null);
                      setLoginPin('');
                      setAuthError('');
                      setAuthScreen('login');
                    }}
                    className="font-semibold text-slate-600 hover:text-[#155DFC]"
                  >
                    নাম্বার ও পাসওয়ার্ড দিয়ে লগইন
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setAuthScreen('register');
                    }}
                    className="font-bold text-[#155DFC] hover:underline"
                  >
                    নতুন অ্যাকাউন্ট তৈরি করুন
                  </button>
                </div>
              </div>
            )}

            {/* 2. STANDARD LOGIN SCREEN (প্রথমবার লগইন করার জন্য নাম্বার এবং পাসওয়ার্ড) */}
            {authScreen === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <p className="text-xs text-center text-slate-500">
                  মোবাইল নাম্বার এবং পাসওয়ার্ড দিয়ে লগইন করুন
                </p>

                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="মোবাইল নাম্বার"
                    className="w-full min-h-[48px] pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    placeholder="পাসওয়ার্ড"
                    className="w-full min-h-[48px] pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-center">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold shadow-md transition-colors"
                >
                  {savingProfile ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
                </button>

                {currentAccount && currentAccount.pinBioExitLockEnabled && (
                  <button
                    type="button"
                    onClick={() => setAuthScreen('quick_unlock')}
                    className="w-full min-h-[44px] py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Fingerprint className="w-4 h-4" />
                    সুরক্ষা (পিন বা ফিঙ্গারপ্রিন্ট) দিয়ে খুলুন ({currentAccount.displayName})
                  </button>
                )}

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px bg-slate-200 flex-1" />
                  <span className="text-xs text-slate-400">অথবা</span>
                  <div className="h-px bg-slate-200 flex-1" />
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setAuthScreen('register');
                    }}
                    className="text-sm font-bold text-[#155DFC] hover:underline"
                  >
                    নতুন অ্যাকাউন্ট তৈরি করুন
                  </button>
                </div>
              </form>
            )}

            {/* 3. REGISTRATION SCREEN */}
            {authScreen === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRegRole('shopkeeper')}
                    className={`min-h-[42px] py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                      regRole === 'shopkeeper'
                        ? 'bg-[#155DFC] text-white shadow-xs'
                        : 'text-slate-700'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    দোকানদার
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegRole('customer')}
                    className={`min-h-[42px] py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                      regRole === 'customer'
                        ? 'bg-[#155DFC] text-white shadow-xs'
                        : 'text-slate-700'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    কাস্টমার
                  </button>
                </div>

                {regRole === 'shopkeeper' ? (
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regShopName}
                      onChange={(e) => setRegShopName(e.target.value)}
                      placeholder="দোকানের নাম *"
                      className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div
                      onClick={() => photoInputRef.current?.click()}
                      className="w-14 h-14 rounded-full bg-blue-100 border-2 border-dashed border-[#155DFC] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                    >
                      {regPhotoDataUrl ? (
                        <img
                          src={regPhotoDataUrl}
                          alt="Customer"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-5 h-5 text-[#155DFC]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-800">
                        কাষ্টমারের ছবি
                      </p>
                      <p className="text-[11px] text-slate-500">
                        প্রোফাইলের জন্য ছবি নির্বাচন করুন
                      </p>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="mt-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-[#155DFC]"
                      >
                        {regPhotoDataUrl ? 'ছবি পরিবর্তন করুন' : 'ছবি যোগ করুন'}
                      </button>
                    </div>
                  </div>
                )}

                {/* প্রোফাইটর (দোকানদার হলে) / কাস্টমারের নাম (কাস্টমার হলে) */}
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regProprietorName}
                    onChange={(e) => setRegProprietorName(e.target.value)}
                    placeholder={
                      regRole === 'shopkeeper'
                        ? 'প্রোফাইটর *'
                        : 'কাস্টমারের নাম *'
                    }
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {/* মোবাইল */}
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="মোবাইল *"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {/* পাসওয়াড */}
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value)}
                    placeholder="পাসওয়াড *"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {/* কনর্ফাম পাসওয়াড */}
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={regPinConfirm}
                    onChange={(e) => setRegPinConfirm(e.target.value)}
                    placeholder="কনর্ফাম পাসওয়াড *"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {/* ঠিকানা */}
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    placeholder="ঠিকানা *"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-center">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold shadow-md transition-colors"
                >
                  {savingProfile ? 'নিবন্ধন হচ্ছে...' : 'নিবন্ধন করুন'}
                </button>

                <p className="text-xs text-center text-slate-500 pt-1">
                  আগে থেকেই অ্যাকাউন্ট আছে?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError('');
                      setAuthScreen('login');
                    }}
                    className="font-bold text-[#155DFC] hover:underline"
                  >
                    লগইন করুন
                  </button>
                </p>
              </form>
            )}

            {/* 4. ONE-TIME GOOGLE BACKUP PROMPT */}
            {authScreen === 'google_once' && (
              <div className="space-y-4 text-center">
                <p className="text-xs text-slate-600 leading-relaxed">
                  প্রথমবার রেজিস্ট্রেশনের সময় অনলাইনে ডাটা ব্যাকআপের জন্য একবার জিমেইল সংযুক্ত করতে পারেন। পরবর্তীতে আর কখনোই জিমেইল চাইবে না।
                </p>

                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={handleFirstTimeGoogleConnect}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold transition-colors"
                >
                  {savingProfile
                    ? 'সংযুক্ত হচ্ছে...'
                    : 'জিমেইল ব্যাকআপ সংযুক্ত করুন'}
                </button>

                <button
                  type="button"
                  disabled={savingProfile}
                  onClick={handleSkipFirstTimeGoogle}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors"
                >
                  এড়িয়ে যান — সরাসরি অ্যাপে প্রবেশ করুন
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN AUTHENTICATED VIEW
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#F4F7FB] pb-20 md:pb-12">
      {/* Header: Logo + আমার হিসাব (NO QR link in header) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-4 sm:px-6 py-3.5 bg-[#0F3878] text-white shadow-xs">
        {activeRole === 'shopkeeper' ? (
          <div className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setShopSideMenuOpen((prev) => !prev)}
              aria-label="সাইড মেনু খুলুন"
              title="মেনু খুলুন"
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center cursor-pointer transition-all"
            >
              <BookOpen className="w-4 h-4 text-white" />
            </button>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('home');
                setShopActiveSection(null);
              }}
              className="text-white"
            >
              আমার হিসাব
            </a>
          </div>
        ) : (
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('home');
            }}
            className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </span>
            <span>আমার হিসাব</span>
          </a>
        )}

        {/* Desktop Nav in pure Bangla: হোম, লেনদেন, অনুমোদন, সেটিংস */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-blue-100">
          <button
            onClick={() => {
              setActiveTab('home');
              setShopActiveSection(null);
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'home'
                ? 'text-white font-bold underline underline-offset-8'
                : ''
            }`}
          >
            হোম
          </button>
          <button
            onClick={() => setActiveTab('len_den')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'len_den'
                ? 'text-white font-bold underline underline-offset-8'
                : ''
            }`}
          >
            লেনদেন
          </button>
          <button
            onClick={() => setActiveTab('onumodon')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'onumodon'
                ? 'text-white font-bold underline underline-offset-8'
                : ''
            }`}
          >
            অনুমোদন
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'text-white font-bold underline underline-offset-8'
                : ''
            }`}
          >
            সেটিংস
          </button>
        </nav>
      </header>

      {/* দোকানদারের সাইড মেনু (শুধুমাত্র দোকানদার লগইন করলে আসবে) */}
      {activeRole === 'shopkeeper' && shopSideMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setShopSideMenuOpen(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-2xs"
          />

          {/* Side Menu Panel */}
          <aside className="relative z-10 w-72 max-w-[82vw] bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col">
            <div className="px-5 py-4 bg-[#0F3878] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold truncate">
                    {myShop?.shopName || 'আমার হিসাব'}
                  </p>
                  <p className="text-[11px] text-blue-200 truncate">
                    দোকানদার মেনু
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShopSideMenuOpen(false)}
                className="p-1 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="বন্ধ করুন"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 space-y-1.5 flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('home');
                  setShopActiveSection('new_receipt');
                  setShopSideMenuOpen(false);
                }}
                className={`w-full min-h-[48px] px-4 py-3 rounded-xl flex items-center gap-3 text-left text-sm font-extrabold transition-colors ${
                  activeTab === 'home' && shopActiveSection === 'new_receipt'
                    ? 'bg-blue-50 text-[#155DFC] border border-blue-200'
                    : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4 text-[#155DFC] shrink-0" />
                <span>নতুন রশিদ তৈরি করুন</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('home');
                  setShopActiveSection('customer_list');
                  setShopSideMenuOpen(false);
                }}
                className={`w-full min-h-[48px] px-4 py-3 rounded-xl flex items-center gap-3 text-left text-sm font-extrabold transition-colors ${
                  activeTab === 'home' && shopActiveSection === 'customer_list'
                    ? 'bg-blue-50 text-[#155DFC] border border-blue-200'
                    : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <UserIcon className="w-4 h-4 text-[#155DFC] shrink-0" />
                <span>কাস্টমারের তালিকা</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('home');
                  setShopActiveSection('product_list');
                  setShopSideMenuOpen(false);
                }}
                className={`w-full min-h-[48px] px-4 py-3 rounded-xl flex items-center gap-3 text-left text-sm font-extrabold transition-colors ${
                  activeTab === 'home' && shopActiveSection === 'product_list'
                    ? 'bg-blue-50 text-[#155DFC] border border-blue-200'
                    : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <PackagePlus className="w-4 h-4 text-[#155DFC] shrink-0" />
                <span>পণ্য তালিকা</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Toast Message */}
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-3">
          <span>{toastMsg}</span>
          <button
            onClick={() => setToastMsg('')}
            className="text-blue-300 hover:text-white text-xs font-bold"
          >
            ঠিক আছে
          </button>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* কাস্টমারের মোবাইলে পেন্ডিং সংশোধিত রশিদের নোটিফিকেশন বার */}
        {activeRole === 'customer' &&
          totals.pendingCustomerApprovals.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 animate-bounce" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs sm:text-sm font-extrabold text-amber-950">
                    পেন্ডিং রশিদের নোটিফিকেশন ({toBanglaNumber(totals.pendingCustomerApprovals.length)} টি)
                  </p>
                  <p className="text-xs text-amber-900">
                    দোকানদার আপনার রশিদ সংশোধন করেছেন — নতুন প্রস্তাবিত বিল:{' '}
                    <span className="font-extrabold">
                      {formatTaka(totals.pendingCustomerApprovals[0].proposedAmount)}
                    </span>
                    । অনুমোদন পেইজ থেকে যাচাই করুন।
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setActiveInvoiceTx(totals.pendingCustomerApprovals[0])
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold"
                >
                  রশিদ দেখুন
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('onumodon')}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold"
                >
                  যাচাই ও অনুমোদন →
                </button>
              </div>
            </div>
          )}

        {/* =================================================================== */}
        {/* TAB 1: হোম (HOME)                                                   */}
        {/* =================================================================== */}
        {activeTab === 'home' && (
          <>
            {activeRole === 'customer' ? (
              /* ---------------- CUSTOMER HOMEPAGE ---------------- */
              <div className="space-y-5">
                {/* ১. মোট জমা, মোট বাকী, এবং আজকের বাকী (রশিদ + খসড়া সহ, তারিখ পরিবর্তন হলে রিসেট হয়) */}
                <section className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-1 shadow-xs">
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
                      মোট জমা
                    </span>
                    <p className="text-lg sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
                      {formatTaka(totals.totalAgrim)}
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-1 shadow-xs">
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
                      মোট বাকী
                    </span>
                    <p className="text-lg sm:text-2xl font-extrabold text-rose-700 tabular-nums">
                      {formatTaka(totals.totalBaki)}
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-0.5 shadow-xs">
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">
                      আজকের বাকী
                    </span>
                    <p className="text-lg sm:text-2xl font-extrabold text-[#0F3878] tabular-nums">
                      {formatTaka(totals.todayBaki)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {toBanglaNumber(totals.todayReceiptCount)} টি রশিদ
                      {draftItems.length > 0 ? ' ও ১ টি খসড়া' : ''}
                    </p>
                  </div>
                </section>

                {/* ২. নতুন রশিদ তৈরি করুন */}
                <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                        নতুন রশিদ তৈরি করুন
                      </h2>
                      <p className="text-xs text-slate-500">
                        পণ্য লিস্ট, কাস্টম পণ্য অথবা জমা নির্বাচন করুন
                      </p>
                    </div>

                    {/* Mode Toggle: পণ্য লিস্ট | কাস্টম পণ্য | জমা */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setEntryInputMode('list');
                          const first = sortedProductCatalog[0];
                          if (first) {
                            setSelectedProductId(first.id);
                            setItemDesc(first.name);
                            setItemUnitPrice(String(first.unitPrice));
                          }
                        }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          entryInputMode === 'list'
                            ? 'bg-[#155DFC] text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        পণ্য লিস্ট
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryInputMode('custom');
                          setItemDesc('');
                          setItemUnitPrice('');
                          setItemQty('1');
                        }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                          entryInputMode === 'custom'
                            ? 'bg-[#155DFC] text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        কাস্টম পণ্য
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryInputMode('joma');
                        }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          entryInputMode === 'joma'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        জমা
                      </button>
                    </div>
                  </div>

                  {/* যদি কোনো দোকান লিংক করা না থাকে তাহলে নতুন রশিদ তৈরি করা যাবে না */}
                  {!activeLink && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs sm:text-sm font-extrabold text-amber-950">
                          কোনো দোকান লিংক করা নেই
                        </p>
                        <p className="text-xs text-amber-900">
                          কোনো দোকান লিংক করা না থাকলে নতুন রশিদ তৈরি করা যাবে না। প্রথমে কিউআর কোড স্ক্যান করে দোকানের সাথে যুক্ত হোন।
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setQrModalState({ open: true, mode: 'scan_to_link' })
                        }
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#155DFC] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <QrCode className="w-4 h-4" />
                        দোকান লিংক করুন
                      </button>
                    </div>
                  )}

                  {entryInputMode === 'joma' ? (
                    /* -------- MODE C: জমা -------- */
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          জমার পরিমান (৳) *
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!activeLink}
                          value={jomaAmountInput}
                          onChange={(e) => setJomaAmountInput(e.target.value)}
                          placeholder="যেমন: ৫০০"
                          className="w-full min-h-[46px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base font-extrabold tabular-nums text-emerald-900 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          বিবরণ (ঐচ্ছিক)
                        </label>
                        <input
                          type="text"
                          disabled={!activeLink}
                          value={jomaNoteInput}
                          onChange={(e) => setJomaNoteInput(e.target.value)}
                          placeholder="জমা বাবদ নগদ প্রদান"
                          className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!activeLink || submittingDraft}
                        onClick={handleSubmitJomaReceipt}
                        className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        জমার রশিদ তৈরি করুন
                      </button>
                    </div>
                  ) : entryInputMode === 'list' ? (
                    /* -------- MODE A: পণ্য লিস্ট -------- */
                    <div className="space-y-3.5">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            পণ্য লিস্ট থেকে নির্বাচন করুন
                          </label>
                          <select
                            disabled={!activeLink}
                            value={selectedProductId}
                            onChange={(e) =>
                              handleSelectCatalogProduct(e.target.value)
                            }
                            className="w-full min-h-[46px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-[#155DFC] disabled:opacity-50"
                          >
                            {sortedProductCatalog.map((prod) => {
                              const isPinned =
                                customerPinnedIds.includes(prod.id) ||
                                customerPinnedIds.includes(prod.name);
                              return (
                                <option key={prod.id} value={prod.id}>
                                  {isPinned ? `📌 ${prod.name}` : prod.name}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Pin Selected Product Button */}
                        {selectedProductObj && (
                          <button
                            type="button"
                            disabled={!activeLink}
                            onClick={() =>
                              handleTogglePinProduct(selectedProductObj)
                            }
                            className={`min-h-[46px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50 ${
                              isSelectedProductPinned
                                ? 'bg-amber-50 border-amber-300 text-amber-800'
                                : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                            <span>
                              {isSelectedProductPinned ? 'পিন করা' : 'পিন করুন'}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* লিস্টের নিচে শুধু পিন করা পণ্যগুলোই Grid আকারে দেখাবে — long press করলে আনপিন করার icon আসবে */}
                      {pinnedOnlyProducts.length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1">
                              <Pin className="w-3 h-3 text-amber-600" />
                              পিন করা নিয়মিত পণ্য ({toBanglaNumber(pinnedOnlyProducts.length)})
                            </span>
                            <span className="text-[10px] text-slate-400">
                              আনপিন করতে চেপে ধরুন
                            </span>
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {pinnedOnlyProducts.map((prod) => {
                              const isSelected = selectedProductId === prod.id;
                              const showUnpinIcon = unpinTargetId === prod.id;
                              return (
                                <div
                                  key={prod.id}
                                  onTouchStart={() => {
                                    didLongPressRef.current = false;
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                    }
                                    longPressTimerRef.current = window.setTimeout(() => {
                                      didLongPressRef.current = true;
                                      setUnpinTargetId((prev) =>
                                        prev === prod.id ? null : prod.id
                                      );
                                    }, 500);
                                  }}
                                  onTouchEnd={() => {
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                    }
                                  }}
                                  onTouchCancel={() => {
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                    }
                                  }}
                                  onMouseDown={() => {
                                    didLongPressRef.current = false;
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                    }
                                    longPressTimerRef.current = window.setTimeout(() => {
                                      didLongPressRef.current = true;
                                      setUnpinTargetId((prev) =>
                                        prev === prod.id ? null : prod.id
                                      );
                                    }, 500);
                                  }}
                                  onMouseUp={() => {
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    if (longPressTimerRef.current) {
                                      window.clearTimeout(longPressTimerRef.current);
                                      longPressTimerRef.current = null;
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setUnpinTargetId((prev) =>
                                      prev === prod.id ? null : prod.id
                                    );
                                  }}
                                  onClick={() => {
                                    if (didLongPressRef.current) {
                                      didLongPressRef.current = false;
                                      return;
                                    }
                                    handleSelectCatalogProduct(prod.id);
                                  }}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-1.5 cursor-pointer select-none transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 border-[#155DFC] text-[#0F3878]'
                                      : 'bg-amber-50/40 border-amber-200 text-slate-800 hover:bg-amber-50'
                                  }`}
                                >
                                  <span className="text-xs font-bold break-words">
                                    {prod.name}
                                  </span>
                                  {showUnpinIcon && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTogglePinProduct(prod);
                                        setUnpinTargetId(null);
                                      }}
                                      title="আনপিন করুন"
                                      className="p-1 rounded-lg text-rose-600 bg-rose-100 hover:bg-rose-200 shrink-0"
                                    >
                                      <PinOff className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">
                          নিয়মিত কেনা পণ্যগুলো নিচে গ্রিড আকারে রাখতে উপরের &ldquo;পিন করুন&rdquo; বাটনে চাপ দিন।
                        </p>
                      )}

                      {/* Auto-filled Price, Quantity & Total */}
                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            মূল্য (দাম ৳)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemUnitPrice}
                            onChange={(e) => setItemUnitPrice(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-extrabold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            পরিমান
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemQty}
                            onChange={(e) => setItemQty(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-extrabold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            মোট টাকা
                          </label>
                          <div className="min-h-[44px] px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-extrabold tabular-nums text-[#0F3878] flex items-center">
                            {formatTaka(currentFormLineTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* -------- MODE B: কাস্টম পণ্য -------- */
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          বিবরণ (পণ্যের নাম) *
                        </label>
                        <input
                          type="text"
                          disabled={!activeLink}
                          value={itemDesc}
                          onChange={(e) => setItemDesc(e.target.value)}
                          placeholder="যেমন: পোলাও চাল বা অন্য পণ্য"
                          className="w-full min-h-[46px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC] disabled:opacity-50"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            দাম (৳) *
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemUnitPrice}
                            onChange={(e) => setItemUnitPrice(e.target.value)}
                            placeholder="১০০"
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            পরিমান *
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemQty}
                            onChange={(e) => setItemQty(e.target.value)}
                            placeholder="১"
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            মোট টাকা
                          </label>
                          <div className="min-h-[44px] px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-extrabold tabular-nums text-[#0F3878] flex items-center">
                            {formatTaka(currentFormLineTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Button: পণ্য লিস্ট বা কাস্টম পণ্য মোডে "যুক্ত করুন" থাকবে */}
                  {entryInputMode !== 'joma' && (
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={!activeLink}
                        onClick={() => handleAddDraftItem()}
                        className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border-2 border-[#155DFC] bg-blue-50/70 hover:bg-blue-100 disabled:opacity-50 text-[#155DFC] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4" />
                        যুক্ত করুন
                      </button>
                    </div>
                  )}

                  {/* একটি যুক্ত হলে নিচে থাকবে খসড়া তালিকা ও "রশিদ তৈরি করুন" */}
                  {draftItems.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700 flex items-center gap-1.5">
                          <ShoppingBag className="w-4 h-4 text-[#155DFC]" />
                          যুক্ত করা পণ্য ({toBanglaNumber(draftItems.length)}{' '}
                          টি)
                        </span>
                        <span className="text-sm font-extrabold text-[#0F3878] tabular-nums">
                          খসড়া মোট: {formatTaka(draftTotalAmount)}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                        {draftItems.map((it, idx) => (
                          <div
                            key={it.id}
                            className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between text-xs sm:text-sm"
                          >
                            <div>
                              <span className="font-bold text-slate-900">
                                {toBanglaNumber(idx + 1)}. {it.itemName}
                              </span>
                              <span className="text-slate-500 ml-2 tabular-nums text-xs">
                                ({toBanglaNumber(it.quantity)} ×{' '}
                                {formatTaka(it.unitPrice)})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 tabular-nums">
                                {formatTaka(it.lineTotal)}
                              </span>
                              <button
                                onClick={() => handleRemoveDraftItem(it.id)}
                                className="text-rose-600 p-1 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={!activeLink || submittingDraft}
                        onClick={handleSubmitDraftAndCreateInvoice}
                        className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        রশিদ তৈরি করুন ({formatTaka(draftTotalAmount)})
                      </button>
                    </div>
                  )}
                </section>
              </div>
            ) : (
              /* ---------------- SHOPKEEPER HOMEPAGE ---------------- */
              <div className="space-y-5">
                {shopActiveSection === null && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
                        <span className="text-xs text-slate-500">
                          মোট বাকী পরিমান
                        </span>
                        <p className="text-2xl font-extrabold text-rose-700 tabular-nums">
                          {formatTaka(totals.totalBaki)}
                        </p>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
                        <span className="text-xs text-slate-500">
                          মোট জমা পরিমান
                        </span>
                        <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">
                          {formatTaka(totals.totalAgrim)}
                        </p>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-1">
                        <span className="text-xs text-slate-500">
                          দৈনিক মোট বিক্রি
                        </span>
                        <p className="text-2xl font-extrabold text-slate-900 tabular-nums">
                          {formatTaka(totals.dailyTotalSales)}
                        </p>
                      </div>
                    </div>

                    <VerificationCenter
                      activeRole="shopkeeper"
                      pendingTransactions={totals.pendingToVerify}
                      onViewInvoice={(tx) => setActiveInvoiceTx(tx)}
                      onShopkeeperApprove={handleShopkeeperApprove}
                      onShopkeeperModify={handleShopkeeperModify}
                      onCustomerApproveCorrection={handleCustomerApproveCorrection}
                      onRejectTransaction={handleRejectTransaction}
                    />
                  </>
                )}

                {/* দোকানদারের পণ্য তালিকা ও নতুন পণ্য যোগ করার সেকশন (শুধুমাত্র মেনুবার থেকে আনলে দেখাবে, হোম পেইজে থাকবে না) */}
                {shopActiveSection === 'product_list' && (
                  <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                          <PackagePlus className="w-5 h-5 text-[#155DFC]" />
                          পণ্য তালিকা ({toBanglaNumber(rawShopProducts.length)})
                        </h2>
                        <p className="text-xs text-slate-500">
                          দাম সহ নতুন পণ্য যোগ করুন — লিংক করা কাস্টমারের অ্যাপে এই পণ্য লিস্ট চলে যাবে
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShopActiveSection(null)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                      >
                        হোমে ফিরুন
                      </button>
                    </div>

                    <form
                      onSubmit={handleShopkeeperAddProductSubmit}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                    >
                      <input
                        type="text"
                        required
                        value={newProdName}
                        onChange={(e) => setNewProdName(e.target.value)}
                        placeholder="পণ্যের নাম (যেমন: মিনিকেট চাল ১ কেজি)"
                        className="sm:col-span-1 min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={newProdPrice}
                        onChange={(e) => setNewProdPrice(e.target.value)}
                        placeholder="দাম (৳)"
                        className="min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold tabular-nums text-slate-900 focus:outline-none focus:border-[#155DFC]"
                      />
                      <button
                        type="submit"
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4" />
                        পণ্য লিস্টে যুক্ত করুন
                      </button>
                    </form>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pt-1">
                      {rawShopProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 break-words">
                              {prod.name}
                            </p>
                            <p className="text-[11px] font-extrabold text-[#155DFC] tabular-nums">
                              {formatTaka(prod.unitPrice)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleShopkeeperDeleteProduct(prod.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded shrink-0"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Shopkeeper Custom Entry / Receipt Creation */}
                {(shopActiveSection === null ||
                  shopActiveSection === 'new_receipt') && (
                  <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          নতুন রশিদ তৈরি করুন
                        </h2>
                        <p className="text-xs text-slate-500">
                          প্রথমে কাস্টমার সিলেক্ট করুন, এরপর পণ্য লিস্ট, কাস্টম পণ্য অথবা জমা নির্বাচন করুন
                        </p>
                      </div>

                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setEntryInputMode('list')}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold ${
                            entryInputMode === 'list'
                              ? 'bg-[#155DFC] text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          পণ্য লিস্ট
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEntryInputMode('custom');
                            setItemDesc('');
                            setItemUnitPrice('');
                            setItemQty('1');
                          }}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${
                            entryInputMode === 'custom'
                              ? 'bg-[#155DFC] text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          কাস্টম পণ্য
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryInputMode('joma')}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold ${
                            entryInputMode === 'joma'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          জমা
                        </button>
                      </div>
                    </div>

                    {/* নতুন রশিদ তৈরির ক্ষেত্রে আগে কাস্টমার সিলেক্ট করতে হবে */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <UserIcon className="w-4 h-4 text-[#155DFC]" />
                          কাস্টমার সিলেক্ট করুন *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddCustomerModal(true)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-[#155DFC] text-[11px] font-bold text-[#155DFC] flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" />
                          নতুন কাস্টমার যোগ
                        </button>
                      </div>

                      {allLinks.length === 0 ? (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
                          কোনো কাস্টমার যুক্ত নেই। রশিদ তৈরি করতে উপরের &ldquo;নতুন কাস্টমার যোগ&rdquo; বাটনে ক্লিক করে কাস্টমার যুক্ত করুন।
                        </div>
                      ) : (
                        <select
                          value={selectedLinkId}
                          onChange={(e) => {
                            setSelectedLinkId(e.target.value);
                            setDraftItems([]);
                          }}
                          className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-[#155DFC]"
                        >
                          <option value="">-- আগে কাস্টমার সিলেক্ট করুন --</option>
                          {allLinks.map((link) => (
                            <option key={link.id} value={link.id}>
                              {link.customerName}
                              {link.customerPhone
                                ? ` (${toBanglaDigitsPlain(link.customerPhone)})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      )}

                      {!activeLink && allLinks.length > 0 && (
                        <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          নতুন রশিদ তৈরির ক্ষেত্রে আগে উপরের তালিকা থেকে একজন কাস্টমার সিলেক্ট করুন।
                        </p>
                      )}

                      {activeLink && (
                        <div className="px-3 py-2 rounded-lg bg-blue-50/80 border border-blue-200 flex items-center justify-between text-xs">
                          <span className="font-extrabold text-[#0F3878]">
                            নির্বাচিত কাস্টমার: {activeLink.customerName}
                            {activeLink.customerPhone
                              ? ` · ${toBanglaDigitsPlain(activeLink.customerPhone)}`
                              : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLinkId('');
                              setDraftItems([]);
                            }}
                            className="text-[11px] font-bold text-rose-600 hover:underline"
                          >
                            পরিবর্তন করুন
                          </button>
                        </div>
                      )}
                    </div>

                  {entryInputMode === 'joma' ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={!activeLink}
                        value={jomaAmountInput}
                        onChange={(e) => setJomaAmountInput(e.target.value)}
                        placeholder="জমার পরিমান (৳) *"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold disabled:opacity-50"
                      />
                      <input
                        type="text"
                        disabled={!activeLink}
                        value={jomaNoteInput}
                        onChange={(e) => setJomaNoteInput(e.target.value)}
                        placeholder="বিবরণ (ঐচ্ছিক)"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={!activeLink || submittingDraft}
                        onClick={handleSubmitJomaReceipt}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5"
                      >
                        <FileText className="w-4 h-4" />
                        জমার রশিদ তৈরি করুন
                      </button>
                    </div>
                  ) : entryInputMode === 'list' ? (
                    <div className="space-y-3">
                      <select
                        disabled={!activeLink}
                        value={selectedProductId}
                        onChange={(e) =>
                          handleSelectCatalogProduct(e.target.value)
                        }
                        className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 disabled:opacity-50"
                      >
                        {sortedProductCatalog.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.name}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            মূল্য (দাম ৳)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemUnitPrice}
                            onChange={(e) => setItemUnitPrice(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-extrabold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            পরিমান
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!activeLink}
                            value={itemQty}
                            onChange={(e) => setItemQty(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-extrabold tabular-nums text-slate-900 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            মোট টাকা
                          </label>
                          <div className="min-h-[44px] px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-extrabold tabular-nums text-[#0F3878] flex items-center">
                            {formatTaka(currentFormLineTotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input
                        type="text"
                        disabled={!activeLink}
                        value={itemDesc}
                        onChange={(e) => setItemDesc(e.target.value)}
                        placeholder="বিবরণ (পণ্যের নাম) *"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm disabled:opacity-50"
                      />
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!activeLink}
                          value={itemUnitPrice}
                          onChange={(e) => setItemUnitPrice(e.target.value)}
                          placeholder="দাম (৳)"
                          className="min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold disabled:opacity-50"
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!activeLink}
                          value={itemQty}
                          onChange={(e) => setItemQty(e.target.value)}
                          placeholder="পরিমান"
                          className="min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold disabled:opacity-50"
                        />
                        <div className="min-h-[44px] px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm font-extrabold tabular-nums text-[#0F3878] flex items-center">
                          {formatTaka(currentFormLineTotal)}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-bold text-[#0F3878] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveCustomToCatalog}
                          onChange={(e) =>
                            setSaveCustomToCatalog(e.target.checked)
                          }
                          className="rounded border-slate-300"
                        />
                        <span>এই পণ্যটি দোকানের পণ্য লিস্টে যুক্ত করুন</span>
                      </label>
                    </div>
                  )}

                  {entryInputMode !== 'joma' && (
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={!activeLink}
                        onClick={() => handleAddDraftItem()}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-[#155DFC] bg-blue-50/70 hover:bg-blue-100 disabled:opacity-50 text-[#155DFC] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <PlusCircle className="w-4 h-4" />
                        যুক্ত করুন
                      </button>
                    </div>
                  )}

                  {draftItems.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700 flex items-center gap-1.5">
                          <ShoppingBag className="w-4 h-4 text-[#155DFC]" />
                          যুক্ত করা পণ্য ({toBanglaNumber(draftItems.length)} টি)
                        </span>
                        <span className="text-sm font-extrabold text-[#0F3878] tabular-nums">
                          খসড়া মোট: {formatTaka(draftTotalAmount)}
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                        {draftItems.map((it, idx) => (
                          <div
                            key={it.id}
                            className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between text-xs sm:text-sm"
                          >
                            <div>
                              <span className="font-bold text-slate-900">
                                {toBanglaNumber(idx + 1)}. {it.itemName}
                              </span>
                              <span className="text-slate-500 ml-2 tabular-nums text-xs">
                                ({toBanglaNumber(it.quantity)} ×{' '}
                                {formatTaka(it.unitPrice)})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 tabular-nums">
                                {formatTaka(it.lineTotal)}
                              </span>
                              <button
                                onClick={() => handleRemoveDraftItem(it.id)}
                                className="text-rose-600 p-1 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        disabled={!activeLink || submittingDraft}
                        onClick={handleSubmitDraftAndCreateInvoice}
                        className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        রশিদ তৈরি করুন ({formatTaka(draftTotalAmount)})
                      </button>
                    </div>
                  )}
                  </section>
                )}

                {/* Customer List (শুধুমাত্র মেনুবার থেকে আনলে দেখাবে, হোম পেইজে থাকবে না) */}
                {shopActiveSection === 'customer_list' && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          কাস্টমারের তালিকা ({toBanglaNumber(allLinks.length)})
                        </h2>
                        <p className="text-xs text-slate-500">
                          কাস্টমারের নাম ও টাকার পরিমাণ
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShopActiveSection(null)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                        >
                          হোমে ফিরুন
                        </button>
                        <button
                          onClick={() => setShowAddCustomerModal(true)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#155DFC] text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          কাস্টমার যোগ
                        </button>
                      </div>
                    </div>

                    {allLinks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        কোনো কাস্টমার যুক্ত নেই। সেটিংস থেকে আপনার দোকানের কিউআর দেখান বা &ldquo;কাস্টমার যোগ&rdquo; করুন।
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {allLinks.map((link) => {
                          const bal = ledgerSettlement.linkBalancesMap.get(
                            link.id
                          ) || {
                            remainingBaki: link.totalBaki,
                            remainingJoma: link.totalAgrim,
                          };
                          return (
                            <div
                              key={link.id}
                              onClick={() => {
                                setSelectedLinkId(link.id);
                                setActiveTab('len_den');
                              }}
                              className="py-3.5 px-2 hover:bg-slate-50 rounded-xl flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  {link.customerName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {link.customerPhone || 'কিউআর সংযুক্ত'}
                                </p>
                              </div>
                              <div className="text-right space-y-0.5">
                                {bal.remainingBaki > 0 && (
                                  <p className="text-sm font-extrabold text-rose-700 tabular-nums">
                                    বাকী: {formatTaka(bal.remainingBaki)}
                                  </p>
                                )}
                                {bal.remainingJoma > 0 && (
                                  <p className="text-xs font-extrabold text-emerald-700 tabular-nums">
                                    জমা: {formatTaka(bal.remainingJoma)}
                                  </p>
                                )}
                                {bal.remainingBaki === 0 &&
                                  bal.remainingJoma === 0 && (
                                    <p className="text-xs font-bold text-slate-500">
                                      পরিশোধিত (৳ ০)
                                    </p>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* =================================================================== */}
        {/* TAB 2: লেনদেন (TRANSACTIONS & RECEIPTS BY DATE)                      */}
        {/* "উপরে ড্রাফট ঠিক আছে, সকল লেনদেন তারিখ এবং এই তারিখে কত বাকী বা অগ্রমি দেওয়া তা দেখাবে। বাকী থাকলে -৫০০ অগ্রীম থাকলে +৫০০ এমন আরকি। সেটার উপরে ক্লিক করলে এই তারিখের সকল রশিদ দেখাবে। কয়টা রশিদ হয়ছে আরকি।" */}
        {/* =================================================================== */}
        {activeTab === 'len_den' && (
          <div className="space-y-5">
            {/* ১. উপরে খসড়া (ড্রাফট) হিসাব */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    খসড়া (ড্রাফট) রশিদ ({toBanglaNumber(draftItems.length)} টি পণ্য)
                  </h2>
                  <p className="text-xs text-slate-500">
                    সাবমিট করার আগে খসড়া পণ্যের তালিকা
                  </p>
                </div>
                {draftItems.length > 0 && (
                  <span className="text-base font-extrabold text-[#0F3878] tabular-nums">
                    {formatTaka(draftTotalAmount)}
                  </span>
                )}
              </div>

              {draftItems.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                  বর্তমানে খসড়ায় কোনো পণ্য নেই। হোম পেজ থেকে পণ্য যোগ করুন।
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {draftItems.map((it, idx) => (
                      <div
                        key={it.id}
                        className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between text-xs sm:text-sm"
                      >
                        <span>
                          {toBanglaNumber(idx + 1)}. {it.itemName} (
                          {toBanglaNumber(it.quantity)} ×{' '}
                          {formatTaka(it.unitPrice)})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold tabular-nums">
                            {formatTaka(it.lineTotal)}
                          </span>
                          <button
                            onClick={() => handleRemoveDraftItem(it.id)}
                            className="text-rose-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmitDraftAndCreateInvoice}
                    disabled={submittingDraft}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-extrabold flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    রশিদ তৈরি করুন ({formatTaka(draftTotalAmount)})
                  </button>
                </>
              )}
            </div>

            {/* ২. তারিখ অনুযায়ী সকল লেনদেন (ক্লিক করলে ওই তারিখের সকল রশিদ দেখাবে) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  তারিখ অনুযায়ী সকল লেনদেন
                </h2>
                <p className="text-xs text-slate-500">
                  যেকোনো তারিখের উপর ক্লিক করলে ওই তারিখের সকল রশিদ দেখা যাবে
                </p>
              </div>

              {dateGroupedLedger.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  এখনো কোনো লেনদেন বা রশিদ তৈরি হয়নি।
                </div>
              ) : (
                <div className="space-y-3">
                  {dateGroupedLedger.map((group) => {
                    const isExpanded = expandedTxDate === group.date;
                    const isNetBaki = group.netBakiOrAgrim > 0;
                    const isNetAgrim = group.netBakiOrAgrim < 0;

                    return (
                      <div
                        key={group.date}
                        className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50"
                      >
                        {/* Date Header Row (Click to toggle this date's receipts) */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTxDate((prev) =>
                              prev === group.date ? null : group.date
                            )
                          }
                          className="w-full p-4 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 text-left transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#155DFC] flex items-center justify-center shrink-0">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm sm:text-base font-extrabold text-slate-900">
                                {formatBanglaDate(group.date)}
                              </p>
                              <p className="text-xs font-semibold text-slate-500">
                                মোট {toBanglaNumber(group.txs.length)} টি রশিদ হয়েছে
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span
                                className={`text-base sm:text-lg font-extrabold tabular-nums block ${
                                  isNetBaki
                                    ? 'text-rose-700'
                                    : isNetAgrim
                                    ? 'text-emerald-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {formatSignedBalance(group.netBakiOrAgrim)}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500">
                                {isNetBaki
                                  ? 'বাকী'
                                  : isNetAgrim
                                  ? 'জমা'
                                  : 'পরিশোধিত'}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* Expanded List of Receipts for this Date */}
                        {isExpanded && (
                          <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between px-1 text-xs font-bold text-[#0F3878]">
                              <span>
                                এই তারিখের রশিদসমূহ ({toBanglaNumber(group.txs.length)} টি রশিদ)
                              </span>
                              <span>বিস্তারিত দেখতে রশিদে ক্লিক করুন</span>
                            </div>

                            <div className="space-y-2">
                              {group.txs.map((tx, idx) => {
                                const parsedInv = parseInvoiceDescription(
                                  tx.description,
                                  tx.amount,
                                  tx.id
                                );
                                const isPaidBaki =
                                  tx.type === 'baki' &&
                                  ledgerSettlement.paidBakiTxIds.has(tx.id);
                                const txSigned =
                                  tx.type === 'baki'
                                    ? `-${toBanglaNumber(tx.amount)}`
                                    : tx.type === 'joma'
                                    ? `+${toBanglaNumber(tx.amount)}`
                                    : toBanglaNumber(tx.amount);

                                return (
                                  <div
                                    key={tx.id}
                                    onClick={() => setActiveInvoiceTx(tx)}
                                    className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-[#155DFC] space-y-2 cursor-pointer shadow-2xs transition-colors"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0 space-y-0.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <p className="text-xs sm:text-sm font-extrabold text-slate-900">
                                            {toBanglaDigitsPlain(idx + 1)}. রশিদ নং{' '}
                                            {parsedInv.invoiceNo} ·{' '}
                                            {activeRole === 'shopkeeper'
                                              ? tx.customerName
                                              : tx.shopName}
                                          </p>
                                          {isPaidBaki ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-extrabold">
                                              <span className="line-through text-rose-500">
                                                বাকী
                                              </span>
                                              <span className="text-emerald-700">
                                                পরিশোধিত
                                              </span>
                                            </span>
                                          ) : tx.type === 'baki' ? (
                                            <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-extrabold">
                                              বাকী
                                            </span>
                                          ) : tx.type === 'joma' ? (
                                            <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-extrabold">
                                              জমা
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="text-xs text-slate-600 break-words">
                                          {parsedInv.summaryText}
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                          পণ্য সংখ্যা:{' '}
                                          {toBanglaNumber(parsedInv.items.length)} টি · সময়:{' '}
                                          {parsedInv.items[0]?.time || '১০:৩০'}
                                        </p>
                                      </div>

                                      <div className="text-right shrink-0 space-y-1">
                                        <p
                                          className={`text-sm font-extrabold tabular-nums ${
                                            tx.status === 'rejected'
                                              ? 'text-slate-400 line-through'
                                              : isPaidBaki
                                              ? 'text-emerald-700'
                                              : tx.type === 'baki'
                                              ? 'text-rose-700'
                                              : 'text-emerald-700'
                                          }`}
                                        >
                                          {txSigned}
                                        </p>
                                        <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-[#155DFC] text-[11px] font-bold">
                                          রশিদ দেখুন →
                                        </span>
                                      </div>
                                    </div>

                                    {tx.status === 'rejected' && (
                                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-900">
                                        বাতিলের কারণঃ {tx.editReason || 'হিসাব গরমিল থাকায় বাতিল করা হয়েছে'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: অনুমোদন (APPROVAL & VERIFICATION)                             */}
        {/* =================================================================== */}
        {activeTab === 'onumodon' && (
          <div className="space-y-5">
            <VerificationCenter
              activeRole={activeRole}
              pendingTransactions={activePendingList}
              approvedTransactions={totals.approvedList}
              rejectedTransactions={totals.rejectedList}
              showFullTabView={true}
              onViewInvoice={(tx) => setActiveInvoiceTx(tx)}
              onShopkeeperApprove={handleShopkeeperApprove}
              onShopkeeperModify={handleShopkeeperModify}
              onCustomerApproveCorrection={handleCustomerApproveCorrection}
              onRejectTransaction={handleRejectTransaction}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: সেটিংস (SETTINGS)                                            */}
        {/* =================================================================== */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
            {/* ১. প্রথমেই থাকবে প্রোফাইল অংশ: ছবি, নাম (কাস্টমার), নামের নিচে মোবাইল নং (কমা ছাড়া), তার নিচে ঠিকানা। চাপ দিলেই এগুলো পরিবর্তনের অপশন আসবে (প্রোফাইল এডিট) */}
            <button
              type="button"
              onClick={openProfileEditModal}
              className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 flex items-center justify-between gap-3.5 text-left transition-colors group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative shrink-0">
                  {currentAccount?.photoDataUrl ? (
                    <img
                      src={currentAccount.photoDataUrl}
                      alt={profile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-2 border-[#155DFC]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#0F3878] text-white flex items-center justify-center font-extrabold text-2xl">
                      {profile.displayName.slice(0, 1)}
                    </div>
                  )}
                  <span className="w-6 h-6 rounded-full bg-[#155DFC] text-white flex items-center justify-center absolute -bottom-0.5 -right-0.5 shadow-xs">
                    <Edit3 className="w-3 h-3" />
                  </span>
                </div>

                <div className="min-w-0 space-y-0.5">
                  {activeRole === 'shopkeeper' ? (
                    <>
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 break-words">
                        দোকানের নাম:{' '}
                        {currentAccount?.shopName ||
                          profile.shopName ||
                          myShop?.shopName ||
                          'আমার দোকান'}
                      </h2>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 break-words">
                        প্রোফাইটর: {profile.displayName}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">
                        মোবাইল: {toBanglaDigitsPlain(profile.phone)}
                      </p>
                      <p className="text-xs text-slate-600 break-words">
                        ঠিকানা:{' '}
                        {currentAccount?.shopAddress ||
                          currentAccount?.address ||
                          'প্রধান সড়ক, সদর'}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 break-words">
                        {profile.displayName}{' '}
                        <span className="text-xs font-bold text-[#155DFC]">
                          (কাস্টমার)
                        </span>
                      </h2>
                      <p className="text-xs sm:text-sm font-bold text-slate-700">
                        মোবাইল নং: {toBanglaDigitsPlain(profile.phone)}
                      </p>
                      <p className="text-xs text-slate-600 break-words">
                        ঠিকানা:{' '}
                        {currentAccount?.address ||
                          currentAccount?.shopAddress ||
                          'প্রধান সড়ক, সদর'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 group-hover:border-[#155DFC] text-xs font-extrabold text-[#155DFC] shrink-0">
                এডিট করুন
              </span>
            </button>

            <div className="space-y-3">
              {/* ২. তার নিচে থাকবে কিউআর কোড স্ক্যান করে দোকানদার এড করুন। আর যদি এড করা থাকে তাহলে সেখানে দেখাবে দোকানের নাম */}
              <button
                type="button"
                onClick={() =>
                  setQrModalState({
                    open: true,
                    mode:
                      activeRole === 'shopkeeper'
                        ? 'show_shop_qr'
                        : 'scan_to_link',
                  })
                }
                className="w-full min-h-[54px] px-4 py-3.5 rounded-2xl bg-blue-50/70 hover:bg-blue-100 border border-blue-200 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#155DFC] text-white flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    {activeRole === 'customer' ? (
                      allLinks.length > 0 && activeLink ? (
                        <>
                          <p className="text-sm font-extrabold text-[#0F3878] break-words">
                            বর্তমানে এই দোকানের সাথে লিংক করা: {activeLink.shopName}
                          </p>
                          <p className="text-xs text-slate-600">
                            কিউআর কোড স্ক্যান করে অন্য দোকানদার এড বা পরিবর্তন করুন
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-extrabold text-slate-900">
                            কিউআর কোড স্ক্যান করে দোকানদার এড করুন
                          </p>
                          <p className="text-xs text-slate-600">
                            দোকানের সাথে লিংক করলে ওই দোকানের পণ্য লিস্ট চলে আসবে
                          </p>
                        </>
                      )
                    ) : (
                      <>
                        <p className="text-sm font-extrabold text-slate-900">
                          আমার দোকানের কিউআর কোড ({profile.shopName})
                        </p>
                        <p className="text-xs text-slate-600">
                          কাস্টমারকে যুক্ত করতে কিউআর কোড দেখান
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-xs font-extrabold text-[#155DFC] shrink-0 ml-2">
                  {activeRole === 'customer' && allLinks.length > 0
                    ? 'পরিবর্তন →'
                    : 'স্ক্যান করুন →'}
                </span>
              </button>

              {/* ৩. সুরক্ষা: চালু করলে মোবাইলে দেওয়া ফিঙ্গারপ্রিন্ট বা পিন দিয়েই সরাসরি খুলবে */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Fingerprint className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      সুরক্ষা
                    </p>
                    <p className="text-xs text-slate-500">
                      চালু থাকলে অ্যাপ ক্লোজ করে পুনরায় প্রবেশে পিন বা বায়োমেট্রিক চাইবে; বন্ধ থাকলে সরাসরি প্রবেশ করবে
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentAccount) return;
                    const currentlyOn = Boolean(
                      currentAccount.pinBioExitLockEnabled
                    );
                    const next = !currentlyOn;

                    setFingerprintEnabled(next);
                    localStorage.setItem(
                      FINGERPRINT_ENABLED_KEY,
                      next ? 'true' : 'false'
                    );

                    const updated: StoredAccount = {
                      ...currentAccount,
                      pinBioExitLockEnabled: next,
                    };
                    const others = loadStoredAccounts().filter(
                      (a) => a.phone !== updated.phone
                    );
                    saveStoredAccounts([updated, ...others]);
                    setCurrentAccount(updated);
                    saveActiveSession({
                      accountPhone: updated.phone,
                      isLocked: false,
                    });
                    void syncAccountToFirestore(updated);

                    if (next) {
                      showToast(
                        'সুরক্ষা চালু হয়েছে! লগইন অবস্থায় অ্যাপ ক্লোজ করে পুনরায় প্রবেশ করলে পিন বা বায়োমেট্রিক চাইবে।'
                      );
                    } else {
                      showToast(
                        'সুরক্ষা বন্ধ করা হয়েছে। এখন অ্যাপ ক্লোজ করে পুনরায় প্রবেশ করলে সরাসরি অ্যাপের ভেতরে প্রবেশ করবে।'
                      );
                    }
                  }}
                  className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-extrabold shrink-0 transition-colors ${
                    currentAccount?.pinBioExitLockEnabled
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  {currentAccount?.pinBioExitLockEnabled
                    ? 'চালু আছে'
                    : 'বন্ধ আছে'}
                </button>
              </div>

              {/* ৪. তার নিচে পিন সেট করার অপশন থাকবে। পিন সেট করা থাকলে পরিবর্তন করার অপশন থাকবে */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#0F3878] flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      {currentAccount?.quickLockPin
                        ? 'সুরক্ষা পিন সেট করা আছে'
                        : 'সুরক্ষা পিন সেট করুন'}
                    </p>
                    <p className="text-xs text-slate-500">
                      অ্যাপ থেকে বের হয়ে গেলে পুনরায় দ্রুত খোলার পিন
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPinChangeModal(true)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-[#155DFC] text-xs font-extrabold text-[#155DFC] shrink-0"
                >
                  {currentAccount?.quickLockPin ? 'পিন পরিবর্তন' : 'পিন সেট করুন'}
                </button>
              </div>

              {/* ৫. তার নিচে লগইন পাসওয়ার্ড পরিবর্তনের অপশন থাকবে */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      লগইন পাসওয়ার্ড পরিবর্তন
                    </p>
                    <p className="text-xs text-slate-500">
                      আপনার অ্যাকাউন্টের মূল লগইন পাসওয়ার্ড পরিবর্তন করুন
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLoginPinModal(true)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-[#155DFC] text-xs font-extrabold text-[#155DFC] shrink-0"
                >
                  পরিবর্তন করুন
                </button>
              </div>

              {/* ৬. তার নিচে এপ শেয়ারের অপশন থাকবে */}
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="w-full min-h-[54px] px-4 py-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      অ্যাপ শেয়ার করুন
                    </p>
                    <p className="text-xs text-slate-500">
                      আমার হিসাব অ্যাপ অন্যদের সাথে শেয়ার করুন
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-700 shrink-0">
                  শেয়ার →
                </span>
              </button>

              {/* অটো অফলাইন ফায়ারবেজ আপলোড ও ওয়াইফাই সিঙ্ক স্ট্যাটাস কার্ড */}
              <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs text-slate-700">
                  <Wifi className="w-4 h-4 text-[#155DFC] shrink-0" />
                  <span>
                    অটো সিঙ্ক সক্রিয়: ইন্টারনেট না থাকলে অফলাইনে সেভ থাকে এবং ইন্টারনেট বা দোকানদারের ওয়াইফাই পেলে স্বয়ংক্রিয়ভাবে চলে যায়।
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOfflineModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-bold text-[#155DFC] shrink-0"
                >
                  বিস্তারিত
                </button>
              </div>

              {/* পিন লক করে বের হোন / লগআউট */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (currentAccount) {
                      saveActiveSession({
                        accountPhone: currentAccount.phone,
                        isLocked: true,
                      });
                    }
                    setSessionUnlocked(false);
                    setQuickPin('');
                    setAuthScreen('quick_unlock');
                  }}
                  className="min-h-[44px] px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-4 h-4 text-amber-700" />
                  পিন/ফিঙ্গার লক করুন
                </button>

                <button
                  type="button"
                  onClick={() => {
                    saveActiveSession(null);
                    setCurrentAccount(null);
                    setSessionUnlocked(false);
                    setLoginPin('');
                    setAuthScreen('login');
                  }}
                  className="min-h-[44px] px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  লগআউট করুন
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Navigation in Pure Bangla: হোম | লেনদেন | অনুমোদন | সেটিংস */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 items-center h-16">
        <button
          onClick={() => {
            setActiveTab('home');
            setShopActiveSection(null);
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            activeTab === 'home' ? 'text-[#155DFC]' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] font-bold mt-0.5">হোম</span>
        </button>

        <button
          onClick={() => setActiveTab('len_den')}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            activeTab === 'len_den' ? 'text-[#155DFC]' : 'text-slate-500'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[11px] font-bold mt-0.5">
            লেনদেন
            {draftItems.length > 0
              ? ` (${toBanglaNumber(draftItems.length)})`
              : ''}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('onumodon')}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            activeTab === 'onumodon' ? 'text-[#155DFC]' : 'text-slate-500'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-[11px] font-bold mt-0.5">
            অনুমোদন
            {activePendingList.length > 0
              ? ` (${toBanglaNumber(activePendingList.length)})`
              : ''}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] flex flex-col items-center justify-center ${
            activeTab === 'settings' ? 'text-[#155DFC]' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-bold mt-0.5">সেটিংস</span>
        </button>
      </footer>

      {/* Profile Edit Modal (ছবি, নাম, মোবাইল নং, ঠিকানা পরিবর্তনের অপশন) */}
      {showProfileEditModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              প্রোফাইল তথ্য পরিবর্তন করুন
            </h3>

            <form onSubmit={handleSaveProfileEdit} className="space-y-3.5">
              {activeRole === 'customer' && (
                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div
                    onClick={() => profileEditPhotoRef.current?.click()}
                    className="w-16 h-16 rounded-full bg-blue-100 border-2 border-dashed border-[#155DFC] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                  >
                    {editPhotoDataUrl ? (
                      <img
                        src={editPhotoDataUrl}
                        alt="Profile"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-5 h-5 text-[#155DFC]" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-800">
                      প্রোফাইল ছবি
                    </p>
                    <input
                      ref={profileEditPhotoRef}
                      type="file"
                      accept="image/*"
                      onChange={handleProfileEditPhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => profileEditPhotoRef.current?.click()}
                      className="mt-1 px-3 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-[#155DFC]"
                    >
                      ছবি পরিবর্তন করুন
                    </button>
                  </div>
                </div>
              )}

              {activeRole === 'shopkeeper' ? (
                <>
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>দোকানের নাম</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Lock className="w-3 h-3" /> লক করা
                      </span>
                    </label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        disabled
                        readOnly
                        value={
                          currentAccount?.shopName ||
                          profile.shopName ||
                          myShop?.shopName ||
                          'আমার দোকান'
                        }
                        className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>প্রোফাইটর</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Lock className="w-3 h-3" /> লক করা
                      </span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        disabled
                        readOnly
                        value={profile.displayName}
                        className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                      <span>মোবাইল</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                        <Lock className="w-3 h-3" /> লক করা
                      </span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        disabled
                        readOnly
                        value={toBanglaDigitsPlain(profile.phone)}
                        className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ঠিকানা *
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={editAddressInput}
                        onChange={(e) => setEditAddressInput(e.target.value)}
                        placeholder="আপনার দোকানের ঠিকানা লিখুন"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      নাম (কাস্টমার) *
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={editNameInput}
                        onChange={(e) => setEditNameInput(e.target.value)}
                        placeholder="আপনার নাম"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      মোবাইল নং *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        value={editPhoneInput}
                        onChange={(e) => setEditPhoneInput(e.target.value)}
                        placeholder="মোবাইল নম্বর"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      ঠিকানা *
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={editAddressInput}
                        onChange={(e) => setEditAddressInput(e.target.value)}
                        placeholder="আপনার ঠিকানা লিখুন"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileEditModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#155DFC] text-white text-xs font-extrabold"
                >
                  সেভ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Lock PIN Set / Change Modal */}
      {showPinChangeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              {currentAccount?.quickLockPin
                ? 'সুরক্ষা পিন পরিবর্তন করুন'
                : 'নতুন সুরক্ষা পিন সেট করুন'}
            </h3>
            <p className="text-xs text-slate-500">
              অ্যাপ থেকে বের হয়ে গেলে পুনরায় পিন বা ফিঙ্গারপ্রিন্ট দিয়ে প্রবেশের জন্য পিন দিন:
            </p>
            <form onSubmit={handleUpdatePin} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                required
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="নতুন পিন (৪-৬ সংখ্যা)"
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="password"
                inputMode="numeric"
                required
                value={newPinConfirmInput}
                onChange={(e) => setNewPinConfirmInput(e.target.value)}
                placeholder="কনফার্ম নতুন পিন"
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinChangeModal(false)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-1.5 rounded-xl bg-[#155DFC] text-white text-xs font-bold"
                >
                  পিন সেভ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Login Password Change Modal ("লগইন পাসওয়ার্ড পরিবর্তনের অপশন") */}
      {showLoginPinModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              লগইন পাসওয়ার্ড পরিবর্তন করুন
            </h3>
            <form onSubmit={handleUpdateLoginPin} className="space-y-3">
              <input
                type="password"
                required
                value={currentLoginPinInput}
                onChange={(e) => setCurrentLoginPinInput(e.target.value)}
                placeholder="বর্তমান লগইন পাসওয়ার্ড"
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="password"
                required
                value={newLoginPinInput}
                onChange={(e) => setNewLoginPinInput(e.target.value)}
                placeholder="নতুন লগইন পাসওয়ার্ড (কমপক্ষে ৪ সংখ্যা)"
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="password"
                required
                value={newLoginPinConfirmInput}
                onChange={(e) => setNewLoginPinConfirmInput(e.target.value)}
                placeholder="কনফার্ম নতুন লগইন পাসওয়ার্ড"
                className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginPinModal(false)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-1.5 rounded-xl bg-[#155DFC] text-white text-xs font-bold"
                >
                  পাসওয়ার্ড পরিবর্তন করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Customer Modal (Shopkeeper Only) */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-extrabold text-slate-900">
              নতুন কাস্টমার যোগ করুন
            </h3>
            <form onSubmit={handleAddCustomerManually} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কাস্টমারের নাম *
                </label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="যেমন: মো: করিম"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  মোবাইল নাম্বার
                </label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="০১৮XXXXXXXX"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={addingCustomer}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#155DFC] text-white text-xs font-bold"
                >
                  {addingCustomer ? 'যুক্ত হচ্ছে...' : 'যোগ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt (রশিদ) Modal */}
      <InvoiceModal
        transaction={activeInvoiceTx}
        isPaid={Boolean(
          activeInvoiceTx && ledgerSettlement.paidBakiTxIds.has(activeInvoiceTx.id)
        )}
        shopCode={profile.shopCode}
        shopOwnerName={activeModalShopOwnerName}
        shopPhone={activeModalShopPhone}
        shopAddress={activeModalShopAddress}
        customerPhone={activeModalCustomerPhone}
        customerAddress={
          currentAccount?.address ||
          currentAccount?.shopAddress ||
          'প্রধান সড়ক, সদর'
        }
        onClose={() => setActiveInvoiceTx(null)}
      />

      {/* QR Modal */}
      <QrModal
        isOpen={qrModalState.open}
        onClose={() => setQrModalState({ ...qrModalState, open: false })}
        mode={qrModalState.mode}
        activeRole={activeRole}
        linkedShopName={
          activeRole === 'customer' && allLinks.length > 0 && activeLink
            ? activeLink.shopName
            : undefined
        }
        myShop={myShop}
        availableShops={availableRegisteredShops}
        shopProducts={rawShopProducts}
        currentUserId={profile.uid}
        customerName={profile.displayName}
        onLinkShopById={handleLinkShopById}
      />

      {/* Offline WiFi/Bluetooth Sync Modal */}
      <OfflineSyncModal
        isOpen={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        isOnline={isOnline}
        simulatedOffline={simulatedOffline}
        onToggleSimulatedOffline={() => setSimulatedOffline((prev) => !prev)}
        offlineQueue={offlineQueue}
        onSyncAllOnline={handleSyncAllOnline}
        onImportOfflinePacket={handleImportOfflinePacket}
      />

      {/* App Share Modal */}
      <AppShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shopName={profile.shopName}
        shopCode={profile.shopCode}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AmarHishabContent />
    </ErrorBoundary>
  );
}
