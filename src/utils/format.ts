import { DraftLineItem, VALIDATION_LIMITS } from '../types';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const INVOICE_SEQ_KEY = 'amar_hishab_invoice_seq_v3';

/**
 * Converts digits 0-9 to Bengali digits ০-৯ WITHOUT adding any commas.
 * Use this for phone numbers, receipt numbers, and years.
 */
export function toBanglaDigitsPlain(val: number | string): string {
  return String(val).replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);
}

/**
 * Formats currency/quantities with standard comma grouping in Bengali digits.
 */
export function toBanglaNumber(val: number | string): string {
  const num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) {
    return toBanglaDigitsPlain(val);
  }
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(Math.round(num));
  return formatted.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);
}

export function formatTaka(val: number): string {
  return `৳ ${toBanglaNumber(val)}`;
}

export function formatSignedBalance(netBakiOrAgrim: number): string {
  const absVal = Math.abs(Math.round(netBakiOrAgrim));
  if (netBakiOrAgrim > 0) {
    return `-${toBanglaNumber(absVal)}`;
  }
  if (netBakiOrAgrim < 0) {
    return `+${toBanglaNumber(absVal)}`;
  }
  return `০`;
}

export function parseBanglaOrEnglishNumber(input: string): number {
  const normalized = input
    .replace(/[০-৯]/g, (ch) => String(BENGALI_DIGITS.indexOf(ch)))
    .replace(/[^0-9.]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentBanglaTime(): string {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hStr = String(hours).padStart(2, '0');
  return toBanglaDigitsPlain(`${hStr}:${minutes}`);
}

export function formatBanglaDateFull(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const months = [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ];
  const mIdx = parseInt(parts[1], 10) - 1;
  const dayBn = toBanglaDigitsPlain(parseInt(parts[2], 10));
  const yearBn = toBanglaDigitsPlain(parts[0]);
  return `${dayBn} ${months[mIdx] || parts[1]} ${yearBn}`;
}

export function formatBanglaDate(isoDate: string): string {
  if (!isoDate) return '';
  const today = getTodayIsoDate();
  const full = formatBanglaDateFull(isoDate);
  if (isoDate === today) return `${full} (আজ)`;
  return full;
}

export function sanitizeString(str: string, maxLen: number): string {
  return str.trim().slice(0, maxLen);
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36);
  const raw = `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '');
  return raw.slice(0, VALIDATION_LIMITS.ID_MAX_LEN);
}

export function generateShopCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(0, 6) || 'SHP001';
  return `SHP-${suffix}`;
}

/**
 * Generates a sequential receipt number in Bangla digits (১, ২, ৩, ৪, ...)
 * with no fixed digit length.
 */
export function generateInvoiceNumber(): string {
  try {
    const raw = localStorage.getItem(INVOICE_SEQ_KEY);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = Number.isFinite(current) && current >= 0 ? current + 1 : 1;
    localStorage.setItem(INVOICE_SEQ_KEY, String(next));
    return toBanglaDigitsPlain(next);
  } catch {
    return '১';
  }
}

/**
 * Normalizes any stored invoice string into a plain sequential Bangla number
 * without forcing a fixed number of digits.
 */
export function normalizeReceiptNo(rawInv: string, fallbackId?: string): string {
  const englishDigits = rawInv
    .replace(/[০-৯]/g, (ch) => String(BENGALI_DIGITS.indexOf(ch)))
    .replace(/[^0-9]/g, '');
  if (englishDigits.length > 0) {
    const num = parseInt(englishDigits, 10);
    if (Number.isFinite(num) && num > 0) {
      return toBanglaDigitsPlain(num);
    }
    return toBanglaDigitsPlain(englishDigits);
  }
  if (fallbackId) {
    let hash = 0;
    for (let i = 0; i < fallbackId.length; i++) {
      hash = (hash * 31 + fallbackId.charCodeAt(i)) % 100;
    }
    return toBanglaDigitsPlain(Math.max(1, Math.abs(hash)));
  }
  return '১';
}

export interface ParsedInvoiceDescription {
  invoiceNo: string;
  summaryText: string;
  items: DraftLineItem[];
}

const INVOICE_MARKER = ' ||INV_DATA:';

export function serializeInvoiceDescription(
  invoiceNo: string,
  items: DraftLineItem[]
): string {
  const nowTime = getCurrentBanglaTime();
  const cleanNo = normalizeReceiptNo(invoiceNo);
  const summaryText = items
    .map((it) =>
      it.quantity > 1
        ? `${it.itemName} (${toBanglaDigitsPlain(it.quantity)} × ${toBanglaNumber(
            it.unitPrice
          )})`
        : it.itemName
    )
    .join(', ');
  const compactItems = items.map((it) => ({
    n: it.itemName.slice(0, 80),
    q: it.quantity,
    u: it.unitPrice,
    t: it.lineTotal,
    tm: it.time || nowTime,
  }));
  const payload = JSON.stringify({ inv: cleanNo, items: compactItems });
  const combined = `${summaryText}${INVOICE_MARKER}${payload}`;
  if (combined.length <= VALIDATION_LIMITS.DESC_MAX_LEN) {
    return combined;
  }
  return sanitizeString(summaryText, VALIDATION_LIMITS.DESC_MAX_LEN);
}

export function parseInvoiceDescription(
  rawDesc: string,
  fallbackAmount: number,
  fallbackId?: string
): ParsedInvoiceDescription {
  const defaultInv = normalizeReceiptNo('', fallbackId);
  const defaultTime = getCurrentBanglaTime();

  if (!rawDesc) {
    return {
      invoiceNo: defaultInv,
      summaryText: 'সাধারণ লেনদেন',
      items: [
        {
          id: '1',
          itemName: 'সাধারণ লেনদেন',
          quantity: 1,
          unitPrice: fallbackAmount,
          lineTotal: fallbackAmount,
          time: defaultTime,
        },
      ],
    };
  }

  const markerIdx = rawDesc.indexOf(INVOICE_MARKER);
  if (markerIdx !== -1) {
    const summaryText = rawDesc.slice(0, markerIdx).trim();
    const jsonPart = rawDesc.slice(markerIdx + INVOICE_MARKER.length);
    try {
      const parsed = JSON.parse(jsonPart);
      if (parsed && Array.isArray(parsed.items)) {
        const items: DraftLineItem[] = parsed.items.map(
          (
            it: {
              n?: string;
              q?: number;
              u?: number;
              t?: number;
              tm?: string;
            },
            idx: number
          ) => ({
            id: String(idx + 1),
            itemName: String(it.n || 'পণ্য'),
            quantity: Number(it.q) || 1,
            unitPrice: Number(it.u) || fallbackAmount,
            lineTotal: Number(it.t) || fallbackAmount,
            time: it.tm || defaultTime,
          })
        );
        const cleanInv = normalizeReceiptNo(String(parsed.inv || ''), fallbackId);
        return {
          invoiceNo: cleanInv,
          summaryText: summaryText || items.map((i) => i.itemName).join(', '),
          items,
        };
      }
    } catch {
      // Fallback below
    }
  }

  return {
    invoiceNo: defaultInv,
    summaryText: rawDesc,
    items: [
      {
        id: '1',
        itemName: rawDesc,
        quantity: 1,
        unitPrice: fallbackAmount,
        lineTotal: fallbackAmount,
        time: defaultTime,
      },
    ],
  };
}
