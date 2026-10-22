import React, { useState } from 'react';
import {
  Check,
  X,
  Edit3,
  AlertTriangle,
  ArrowRight,
  FileText,
  User,
} from 'lucide-react';
import { LedgerTransaction, UserRole } from '../types';
import {
  formatTaka,
  formatBanglaDate,
  parseBanglaOrEnglishNumber,
  parseInvoiceDescription,
  toBanglaNumber,
} from '../utils/format';

interface VerificationCenterProps {
  activeRole: UserRole;
  pendingTransactions: LedgerTransaction[];
  approvedTransactions?: LedgerTransaction[];
  rejectedTransactions?: LedgerTransaction[];
  showFullTabView?: boolean;
  onViewInvoice: (tx: LedgerTransaction) => void;
  onShopkeeperApprove: (tx: LedgerTransaction) => Promise<void>;
  onShopkeeperModify: (
    tx: LedgerTransaction,
    newAmount: number,
    newDescription: string,
    reason: string
  ) => Promise<void>;
  onCustomerApproveCorrection: (tx: LedgerTransaction) => Promise<void>;
  onRejectTransaction: (tx: LedgerTransaction, reason: string) => Promise<void>;
}

export const VerificationCenter: React.FC<VerificationCenterProps> = ({
  activeRole,
  pendingTransactions,
  approvedTransactions = [],
  rejectedTransactions = [],
  showFullTabView = false,
  onViewInvoice,
  onShopkeeperApprove,
  onShopkeeperModify,
  onCustomerApproveCorrection,
  onRejectTransaction,
}) => {
  const [subTab, setSubTab] = useState<'pending' | 'approved' | 'rejected'>(
    'pending'
  );
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [rejectingTxId, setRejectingTxId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [proposedAmtInput, setProposedAmtInput] = useState('');
  const [proposedDescInput, setProposedDescInput] = useState('');
  const [editReasonInput, setEditReasonInput] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (!showFullTabView && pendingTransactions.length === 0) {
    return null;
  }

  const startEditing = (tx: LedgerTransaction) => {
    const parsed = parseInvoiceDescription(tx.description, tx.amount, tx.id);
    setRejectingTxId(null);
    setEditingTxId(tx.id);
    setProposedAmtInput(String(tx.amount));
    setProposedDescInput(parsed.summaryText);
    setEditReasonInput('');
  };

  const startRejecting = (tx: LedgerTransaction) => {
    setEditingTxId(null);
    setRejectingTxId(tx.id);
    setRejectReasonInput('');
  };

  const submitModification = async (tx: LedgerTransaction) => {
    const parsedAmt = parseBanglaOrEnglishNumber(proposedAmtInput);
    if (parsedAmt <= 0) return;
    setProcessingId(tx.id);
    try {
      await onShopkeeperModify(
        tx,
        parsedAmt,
        proposedDescInput.trim() || tx.description,
        editReasonInput.trim() || 'হিসাবে গরমিল থাকায় সংশোধন করা হয়েছে'
      );
      setEditingTxId(null);
    } finally {
      setProcessingId(null);
    }
  };

  const submitRejection = async (tx: LedgerTransaction) => {
    setProcessingId(tx.id);
    try {
      const defaultReason =
        activeRole === 'shopkeeper'
          ? 'দোকানদার হিসাবের গরমিল থাকায় বাতিল করেছেন'
          : 'কাস্টমার সংশোধিত হিসাব বাতিল করেছেন';
      await onRejectTransaction(
        tx,
        rejectReasonInput.trim() || defaultReason
      );
      setRejectingTxId(null);
      setRejectReasonInput('');
    } finally {
      setProcessingId(null);
    }
  };

  const getTypeLabel = (type: LedgerTransaction['type']) => {
    if (type === 'baki') return 'বাকী ক্রয়';
    if (type === 'joma') return 'জমা';
    return 'নগদ ক্রয়';
  };

  const listToRender =
    subTab === 'pending'
      ? pendingTransactions
      : subTab === 'approved'
      ? approvedTransactions
      : rejectedTransactions;

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xs">
      {/* Header & 3 Sub-Tabs: অপেক্ষমাণ, অনুমোদিত, বাতিল */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            অনুমোদন কেন্দ্র
          </h2>
          <p className="text-xs text-slate-500">
            {activeRole === 'shopkeeper'
              ? 'কাস্টমারের রশিদ যাচাই, অনুমোদন, সংশোধন বা বাতিল করুন'
              : 'রশিদের বর্তমান অনুমোদন অবস্থা ও সংশোধিত হিসাব যাচাই'}
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setSubTab('pending')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              subTab === 'pending'
                ? 'bg-white text-[#155DFC] shadow-xs'
                : 'text-slate-600'
            }`}
          >
            অপেক্ষমাণ ({toBanglaNumber(pendingTransactions.length)})
          </button>
          {showFullTabView && (
            <>
              <button
                onClick={() => setSubTab('approved')}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  subTab === 'approved'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                অনুমোদিত ({toBanglaNumber(approvedTransactions.length)})
              </button>
              <button
                onClick={() => setSubTab('rejected')}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  subTab === 'rejected'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                বাতিল ({toBanglaNumber(rejectedTransactions.length)})
              </button>
            </>
          )}
        </div>
      </div>

      {listToRender.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          {subTab === 'pending'
            ? 'বর্তমানে কোনো অপেক্ষমাণ রশিদ নেই।'
            : subTab === 'approved'
            ? 'অনুমোদিত কোনো রশিদ পাওয়া যায়নি।'
            : 'বাতিল কোনো রশিদ পাওয়া যায়নি।'}
        </div>
      ) : (
        <div className="space-y-3">
          {listToRender.map((tx) => {
            const isEditing = editingTxId === tx.id;
            const isRejecting = rejectingTxId === tx.id;
            const isBusy = processingId === tx.id;
            const parsedInv = parseInvoiceDescription(
              tx.description,
              tx.amount,
              tx.id
            );

            return (
              <div
                key={tx.id}
                className="bg-slate-50/70 rounded-2xl border border-slate-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#155DFC] text-white flex items-center justify-center shrink-0 font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-slate-900 break-words">
                        {activeRole === 'shopkeeper'
                          ? tx.customerName
                          : tx.shopName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getTypeLabel(tx.type)} · রশিদ নং {parsedInv.invoiceNo}
                      </p>
                      <p className="text-base font-extrabold text-[#0F3878] tabular-nums">
                        {formatTaka(tx.amount)}
                      </p>
                      <p className="text-xs text-slate-600 break-words">
                        {parsedInv.summaryText}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-2">
                    <p className="text-xs text-slate-500">
                      {formatBanglaDate(tx.txDate)}
                    </p>
                    <button
                      onClick={() => onViewInvoice(tx)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-[11px] font-bold text-[#155DFC] inline-flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      রশিদ দেখুন
                    </button>
                  </div>
                </div>

                {/* বাতিল থাকলে রশিদের নিচে বাতিলের কারণ উল্লেখ থাকবে */}
                {tx.status === 'rejected' && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    <span className="font-extrabold">বাতিলের কারণঃ </span>
                    <span>
                      {tx.editReason || 'হিসাবে গরমিল থাকায় বাতিল করা হয়েছে'}
                    </span>
                  </div>
                )}

                {/* Shopkeeper Actions on Pending Entry */}
                {activeRole === 'shopkeeper' &&
                  tx.status === 'pending_shopkeeper' && (
                    <>
                      {!isEditing && !isRejecting ? (
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80">
                          <button
                            disabled={isBusy}
                            onClick={async () => {
                              setProcessingId(tx.id);
                              try {
                                await onShopkeeperApprove(tx);
                              } finally {
                                setProcessingId(null);
                              }
                            }}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Check className="w-4 h-4 text-emerald-600" />
                            অনুমোদন
                          </button>

                          <button
                            disabled={isBusy}
                            onClick={() => startEditing(tx)}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#155DFC] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                            সংশোধন
                          </button>

                          <button
                            disabled={isBusy}
                            onClick={() => startRejecting(tx)}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <X className="w-4 h-4 text-rose-600" />
                            বাতিল
                          </button>
                        </div>
                      ) : isEditing ? (
                        <div className="p-3.5 rounded-xl bg-white border border-blue-200 space-y-3">
                          <p className="text-xs font-bold text-slate-800">
                            সংশোধিত হিসাব দিন (কাস্টমারের অনুমোদনের জন্য পাঠানো হবে):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                সংশোধিত টাকার পরিমাণ (৳)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={proposedAmtInput}
                                onChange={(e) =>
                                  setProposedAmtInput(e.target.value)
                                }
                                className="w-full min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                সংশোধিত বিবরণ
                              </label>
                              <input
                                type="text"
                                value={proposedDescInput}
                                onChange={(e) =>
                                  setProposedDescInput(e.target.value)
                                }
                                className="w-full min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              সংশোধনের কারণ
                            </label>
                            <input
                              type="text"
                              value={editReasonInput}
                              onChange={(e) =>
                                setEditReasonInput(e.target.value)
                              }
                              placeholder="যেমন: পণ্যের দর পরিবর্তন হয়েছে"
                              className="w-full min-h-[40px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingTxId(null)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                            >
                              ফিরে যান
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => submitModification(tx)}
                              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#155DFC] text-white text-xs font-bold"
                            >
                              কাস্টমারের অনুমোদনে পাঠান
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2.5">
                          <label className="block text-xs font-bold text-rose-900">
                            বাতিলের কারণ লিখুন:
                          </label>
                          <input
                            type="text"
                            value={rejectReasonInput}
                            onChange={(e) =>
                              setRejectReasonInput(e.target.value)
                            }
                            placeholder="যেমন: পণ্যটি ফেরত দেওয়া হয়েছে বা ভুল এন্ট্রি"
                            className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-rose-300 rounded-xl text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setRejectingTxId(null)}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                            >
                              ফিরে যান
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => submitRejection(tx)}
                              className="min-h-[36px] px-4 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                            >
                              বাতিল নিশ্চিত করুন
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                {/* Customer Counter-Approval on Shopkeeper's Correction */}
                {activeRole === 'customer' &&
                  tx.status === 'pending_customer_approval' && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          দোকানদার আপনার রশিদ সংশোধন করেছেন — আপনার অনুমোদন প্রয়োজন:
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 bg-white p-3 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            আপনার সাবমিট করা বিল
                          </span>
                          <span className="text-sm font-semibold text-slate-400 line-through tabular-nums">
                            {formatTaka(tx.amount)}
                          </span>
                        </div>
                        <div className="hidden sm:flex justify-center">
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="sm:text-right">
                          <span className="text-[11px] text-[#155DFC] font-bold block">
                            দোকানদারের সংশোধিত বিল
                          </span>
                          <span className="text-base font-extrabold text-[#0F3878] tabular-nums">
                            {formatTaka(tx.proposedAmount)}
                          </span>
                        </div>
                      </div>

                      {tx.editReason && (
                        <p className="text-xs text-slate-700">
                          <span className="font-bold">সংশোধনের কারণ:</span>{' '}
                          {tx.editReason}
                        </p>
                      )}

                      {!isRejecting ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            disabled={isBusy}
                            onClick={async () => {
                              setProcessingId(tx.id);
                              try {
                                await onCustomerApproveCorrection(tx);
                              } finally {
                                setProcessingId(null);
                              }
                            }}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4" />
                            অনুমোদন দিন
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => startRejecting(tx)}
                            className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <X className="w-4 h-4" />
                            বাতিল করুন
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-white border border-rose-200 space-y-2">
                          <label className="block text-xs font-bold text-rose-900">
                            বাতিলের কারণ লিখুন:
                          </label>
                          <input
                            type="text"
                            value={rejectReasonInput}
                            onChange={(e) =>
                              setRejectReasonInput(e.target.value)
                            }
                            placeholder="বাতিলের কারণ..."
                            className="w-full min-h-[38px] px-3 py-1.5 bg-slate-50 border border-rose-300 rounded-xl text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setRejectingTxId(null)}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                            >
                              ফিরে যান
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => submitRejection(tx)}
                              className="min-h-[36px] px-4 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold"
                            >
                              বাতিল নিশ্চিত করুন
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
