import React, { useState } from 'react';
import {
  Share2,
  Check,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  BookOpen,
  FileDown,
} from 'lucide-react';
import { LedgerTransaction } from '../types';
import {
  formatTaka,
  toBanglaNumber,
  toBanglaDigitsPlain,
  formatBanglaDateFull,
  parseInvoiceDescription,
} from '../utils/format';
import { shareOrDownloadReceiptPdf } from '../utils/pdfShare';

interface InvoiceModalProps {
  transaction: LedgerTransaction | null;
  shopCode?: string;
  shopOwnerName?: string;
  shopPhone?: string;
  shopAddress?: string;
  customerPhone?: string;
  customerAddress?: string;
  isPaid?: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  transaction,
  shopOwnerName,
  shopPhone,
  shopAddress,
  customerPhone,
  customerAddress,
  isPaid = false,
  onClose,
}) => {
  const [sharingPdf, setSharingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState('');

  if (!transaction) return null;

  const parsedInvoice = parseInvoiceDescription(
    transaction.description,
    transaction.amount,
    transaction.id
  );

  const sealTitle =
    transaction.type === 'baki'
      ? isPaid
        ? 'পরিশোধিত'
        : 'বাকী'
      : transaction.type === 'joma'
      ? 'জমা'
      : 'নগদ';

  const isBaki = transaction.type === 'baki';

  const statusText =
    transaction.status === 'approved'
      ? 'অনুমোদিত'
      : transaction.status === 'pending_shopkeeper'
      ? 'অপেক্ষমাণ (দোকানদার)'
      : transaction.status === 'pending_customer_approval'
      ? 'অপেক্ষমাণ (কাস্টমার)'
      : 'বাতিল';

  const displayOwnerName =
    shopOwnerName?.trim() || transaction.shopName || 'দোকানদার';
  const displayShopPhone = shopPhone?.trim() || '০১৭১১-২২৩৩৪৪';
  const displayShopAddress = shopAddress?.trim() || 'প্রধান বাজার, সদর';
  const displayCustomerPhone = customerPhone?.trim() || '০১৮১২-৩৪৫৬৭৮';
  const displayCustomerAddress = customerAddress?.trim() || 'প্রধান সড়ক, সদর';
  const formattedDate = formatBanglaDateFull(transaction.txDate);

  const handleSharePdf = async () => {
    setSharingPdf(true);
    setPdfFeedback('');
    try {
      const res = await shareOrDownloadReceiptPdf({
        transaction,
        shopOwnerName: displayOwnerName,
        shopPhone: displayShopPhone,
        shopAddress: displayShopAddress,
        customerPhone: displayCustomerPhone,
        customerAddress: displayCustomerAddress,
        isPaid,
      });
      setPdfFeedback(
        res === 'shared'
          ? 'রশিদ পিডিএফ (PDF) শেয়ার সম্পন্ন হয়েছে!'
          : 'রশিদ পিডিএফ (PDF) ডাউনলোড হয়েছে!'
      );
      setTimeout(() => setPdfFeedback(''), 3000);
    } finally {
      setSharingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="bg-[#0F3878] text-white px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm sm:text-base font-extrabold">
              ডিজিটাল রশিদ
            </span>
          </div>
          <button
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable / Shareable Receipt Paper */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
            {/* ১. প্রথমে একটু বড় করে দোকানের নাম, মালিকের নাম (প্রোঃ), মোবাইল নম্বার (কমা ছাড়া), ঠিকানাঃ */}
            <div className="text-center border-b-2 border-dashed border-slate-200 pb-3.5 space-y-1">
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#0F3878]">
                {transaction.shopName}
              </h3>
              <p className="text-xs sm:text-sm font-bold text-slate-800">
                প্রোঃ {displayOwnerName}
              </p>
              <p className="text-xs font-semibold text-slate-700">
                মোবাইল নম্বারঃ {toBanglaDigitsPlain(displayShopPhone)}
              </p>
              <p className="text-xs text-slate-600">
                ঠিকানাঃ {displayShopAddress}
              </p>
            </div>

            {/* ২. রশিদ নং (১২৩৩ এমন স্ট্যাম্প নাম্বারিং) ও ডান পাশে তারিখ */}
            {/* ৩. নিচে নাম ও ডান সাইটে মোবাইল নং (কমা ছাড়া) */}
            {/* ৪. তার নিচে ঠিকানা */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 space-y-2.5 text-xs sm:text-sm">
              {/* Row 1: রশিদ নং (Left, সাধারণ টেক্সট, বর্ডার ছাড়া) | তারিখ (Right) */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                <div>
                  <span className="font-bold text-slate-700">রশিদ নং: </span>
                  <span className="font-extrabold text-slate-900">
                    {parsedInvoice.invoiceNo}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-700">তারিখঃ </span>
                  <span className="font-extrabold text-slate-900">
                    {formattedDate}
                  </span>
                </div>
              </div>

              {/* Row 2: নাম (Left) | মোবাইল নং (Right, কমা ছাড়া) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-700">নামঃ </span>
                  <span className="font-extrabold text-slate-900">
                    {transaction.customerName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-700">মোবাইল নংঃ </span>
                  <span className="font-bold text-slate-900">
                    {toBanglaDigitsPlain(displayCustomerPhone)}
                  </span>
                </div>
              </div>

              {/* Row 3: তার নিচে ঠিকানা */}
              <div className="pt-0.5 border-t border-slate-200/60">
                <span className="font-bold text-slate-700">ঠিকানাঃ </span>
                <span className="text-slate-800">{displayCustomerAddress}</span>
              </div>
            </div>

            {/* ৫. পণ্যের টেবিল: ক্রমিক নং | সময় (এন্ট্রি সময়) | বিবরণ | পরিমান | দর | মোট */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-100 px-2.5 py-2.5 text-[11px] sm:text-xs font-extrabold text-slate-700 border-b border-slate-200">
                <div className="col-span-2 text-center">ক্রমিক নং</div>
                <div className="col-span-2 text-center">সময়</div>
                <div className="col-span-3">বিবরণ</div>
                <div className="col-span-1 text-center">পরিমান</div>
                <div className="col-span-2 text-right">দর</div>
                <div className="col-span-2 text-right">মোট</div>
              </div>

              <div className="divide-y divide-slate-100">
                {parsedInvoice.items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="grid grid-cols-12 items-center px-2.5 py-2.5 text-[11px] sm:text-xs"
                  >
                    <div className="col-span-2 text-center font-bold text-slate-600 tabular-nums">
                      {toBanglaDigitsPlain(index + 1)}
                    </div>
                    <div className="col-span-2 text-center text-slate-600 font-semibold tabular-nums">
                      {item.time || '১০:৩০'}
                    </div>
                    <div className="col-span-3 font-bold text-slate-900 pr-1 break-words">
                      {item.itemName}
                    </div>
                    <div className="col-span-1 text-center font-bold text-slate-700 tabular-nums">
                      {toBanglaDigitsPlain(item.quantity)}
                    </div>
                    <div className="col-span-2 text-right font-semibold text-slate-700 tabular-nums">
                      {toBanglaNumber(item.unitPrice)}
                    </div>
                    <div className="col-span-2 text-right font-extrabold text-slate-900 tabular-nums">
                      {toBanglaNumber(item.lineTotal)}
                    </div>
                  </div>
                ))}
              </div>

              {/* ৬. একদম নিচে: বাম সাইটে অবস্থা | মাঝে স্ট্যাম্পের মত একটু বাঁকা করে বাকী বা নগদ | ডান সাইটে মোট টাকা */}
              <div className="bg-slate-50 px-3.5 py-4 border-t-2 border-slate-200 grid grid-cols-3 items-center gap-2">
                {/* বাম সাইটে: অবস্থা */}
                <div className="text-left space-y-0.5">
                  <span className="text-[11px] font-bold text-slate-500 block">
                    অবস্থা
                  </span>
                  <div className="text-xs font-extrabold flex items-center gap-1">
                    {transaction.status === 'approved' && (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{statusText}</span>
                      </span>
                    )}
                    {(transaction.status === 'pending_shopkeeper' ||
                      transaction.status === 'pending_customer_approval') && (
                      <span className="text-amber-700 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{statusText}</span>
                      </span>
                    )}
                    {transaction.status === 'rejected' && (
                      <span className="text-rose-700 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{statusText}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* মাঝে: স্ট্যাম্পের মত একটু বাঁকা করে বাকী / পরিশোধিত / জমা / নগদ */}
                <div className="flex justify-center">
                  <div
                    className={`px-3.5 py-1 rounded-lg border-2 border-double font-extrabold text-sm sm:text-base tracking-wider -rotate-12 shadow-xs select-none text-center ${
                      isBaki && !isPaid
                        ? 'border-rose-600 text-rose-700 bg-rose-50/90'
                        : 'border-emerald-600 text-emerald-700 bg-emerald-50/90'
                    }`}
                  >
                    {isBaki && isPaid ? (
                      <div className="leading-tight">
                        <span className="block text-[11px] font-bold text-rose-500 line-through">
                          বাকী
                        </span>
                        <span className="block text-sm sm:text-base font-extrabold text-emerald-700">
                          পরিশোধিত
                        </span>
                      </div>
                    ) : (
                      sealTitle
                    )}
                  </div>
                </div>

                {/* ডান সাইটে: মোট টাকা */}
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 block">
                    মোট টাকা
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold text-[#0F3878] tabular-nums">
                    {formatTaka(transaction.amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* বাতিল থাকলে রশিদের নিচে বাতিলের কারণ উল্লেখ থাকবে */}
            {transaction.status === 'rejected' && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <span className="font-extrabold">বাতিলের কারণঃ </span>
                <span>
                  {transaction.editReason || 'হিসাবে গরমিল থাকায় বাতিল করা হয়েছে'}
                </span>
              </div>
            )}

            {/* সংশোধিত প্রস্তাব থাকলে */}
            {transaction.status === 'pending_customer_approval' &&
              transaction.proposedAmount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <p className="font-bold text-amber-900">
                    দোকানদারের প্রস্তাবিত সংশোধিত মোট:{' '}
                    <span className="tabular-nums text-sm">
                      {formatTaka(transaction.proposedAmount)}
                    </span>
                  </p>
                  {transaction.editReason && (
                    <p className="text-amber-800">
                      কারণঃ {transaction.editReason}
                    </p>
                  )}
                </div>
              )}
          </div>

          {pdfFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>{pdfFeedback}</span>
            </div>
          )}

          {/* ৭. তার নিচে শেয়ার অপশন যার মাধ্যমে রশিদটা PDF শেয়ার করা যাবে */}
          <button
            type="button"
            disabled={sharingPdf}
            onClick={handleSharePdf}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-colors"
          >
            {sharingPdf ? (
              <>
                <FileDown className="w-4 h-4 animate-bounce" />
                <span>পিডিএফ (PDF) তৈরি হচ্ছে...</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>রশিদ পিডিএফ (PDF) শেয়ার করুন</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
