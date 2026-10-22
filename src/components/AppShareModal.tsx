import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Check, X, Smartphone } from 'lucide-react';

interface AppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName?: string;
  shopCode?: string;
}

export const AppShareModal: React.FC<AppShareModalProps> = ({
  isOpen,
  onClose,
  shopName,
  shopCode,
}) => {
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState('');

  if (!isOpen) return null;

  const appUrl = window.location.origin;
  const shareText = shopName
    ? `আমার হিসাব (com.wic.amarhishab) অ্যাপে "${shopName}"-এর সাথে আপনার বাকী ও অগ্রিমের ডিজিটাল হিসাব যুক্ত করুন। শপ কোড: ${shopCode || ''} — লিংক: ${appUrl}`
    : `আমার হিসাব (com.wic.amarhishab) — দোকানদার ও কাস্টমারের ডিজিটাল বাকী-অগ্রিমের খাতা। অ্যাপ লিংক: ${appUrl}`;

  const handleNativeShare = async () => {
    setShareNote('');
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'আমার হিসাব (com.wic.amarhishab)',
          text: shareText,
          url: appUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await handleCopyLink();
    setShareNote('শেয়ার লিংক ও মেসেজ কপি করা হয়েছে!');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${shareText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-stone-200 shadow-xl overflow-hidden">
        <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto mt-3 sm:hidden" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-5 h-5 text-emerald-700" />
            <h2 className="text-lg font-bold text-slate-900">
              অ্যাপ শেয়ার করুন
            </h2>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 transition-colors"
            aria-label="বন্ধ করুন"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center space-y-5">
          <div className="space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mx-auto mb-2 font-bold text-lg">
              আ
            </div>
            <h3 className="text-xl font-bold text-slate-900">আমার হিসাব</h3>
            <p className="text-xs font-mono text-slate-500">
              প্যাকেজ: com.wic.amarhishab
            </p>
            <p className="text-xs text-slate-600 pt-1">
              দোকানদার ও কাস্টমারের স্বচ্ছ হিসাবের জন্য অ্যাপটি কাস্টমার বা পরিচিত দোকানদারকে শেয়ার করুন
            </p>
          </div>

          <div className="inline-flex p-4 bg-white border border-stone-200 rounded-2xl shadow-sm">
            <QRCodeSVG value={appUrl} size={170} level="M" />
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 text-left space-y-1.5">
            <p className="text-xs text-slate-500">আমন্ত্রণ বার্তা ও লিংক:</p>
            <p className="text-xs text-slate-800 leading-relaxed break-words">
              {shareText}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={handleNativeShare}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              সরাসরি শেয়ার করুন
            </button>
            <button
              onClick={handleCopyLink}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  লিংক কপি হয়েছে
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  লিংক কপি করুন
                </>
              )}
            </button>
          </div>

          {shareNote && (
            <p className="text-xs text-emerald-800 font-medium">{shareNote}</p>
          )}
        </div>
      </div>
    </div>
  );
};
