import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Bluetooth,
  RefreshCw,
  Upload,
  Check,
  Copy,
  ArrowLeft,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { OfflinePacket } from '../types';
import { formatTaka, formatBanglaDate, toBanglaNumber } from '../utils/format';

interface OfflineSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  offlineQueue: OfflinePacket[];
  onSyncAllOnline: () => Promise<void>;
  onImportOfflinePacket: (rawJson: string) => Promise<void>;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({
  isOpen,
  onClose,
  isOnline,
  simulatedOffline,
  onToggleSimulatedOffline,
  offlineQueue,
  onSyncAllOnline,
  onImportOfflinePacket,
}) => {
  const [activeTab, setActiveTab] = useState<'sync_center' | 'bluetooth'>(
    isOnline ? 'sync_center' : 'bluetooth'
  );
  const [selectedPacketIdx, setSelectedPacketIdx] = useState(0);
  const [importInput, setImportInput] = useState('');
  const [btDeviceName, setBtDeviceName] = useState('Galaxy A15 (দোকানদারের ফোন)');
  const [btConnected, setBtConnected] = useState(true);
  const [btStatus, setBtStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [copiedPacket, setCopiedPacket] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');

  if (!isOpen) return null;

  const activePacket = offlineQueue[selectedPacketIdx] || null;
  const serializedPacket = activePacket ? JSON.stringify(activePacket) : '';

  const handleBluetoothConnect = async () => {
    setBtStatus('কাছাকাছি ব্লুটুথ ডিভাইস খোঁজা হচ্ছে...');
    try {
      if ('bluetooth' in navigator) {
        // @ts-expect-error Web Bluetooth API
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
        });
        setBtDeviceName(device?.name || 'সংযুক্ত ব্লুটুথ ফোন');
        setBtConnected(true);
        setBtStatus('ডিভাইস সফলভাবে সংযুক্ত হয়েছে! ডেটা পাঠানোর জন্য প্রস্তুত।');
      } else {
        setBtConnected(true);
        setBtStatus(
          'লোকাল ওয়াইফাই / ব্লুটুথ ডাটা প্যাকেট প্রস্তুত হয়েছে। নিচের কোড বা QR স্ক্যান করে ডেটা পাঠান।'
        );
      }
    } catch {
      setBtConnected(true);
      setBtStatus(
        'নিচের ডেটা প্যাকেট বা QR কোড দিয়ে ইন্টারনেট ছাড়াই সাথে সাথে হিসাব পাঠান।'
      );
    }
  };

  const handleCopyPacket = async () => {
    if (!serializedPacket) return;
    await navigator.clipboard.writeText(serializedPacket);
    setCopiedPacket(true);
    setTimeout(() => setCopiedPacket(false), 2000);
  };

  const handleImport = async () => {
    if (!importInput.trim()) return;
    setSyncing(true);
    setImportFeedback('');
    try {
      await onImportOfflinePacket(importInput.trim());
      setImportFeedback('অফলাইন ডাটা প্যাকেট সফলভাবে গ্রহণ ও হিসাবভুক্ত করা হয়েছে!');
      setImportInput('');
    } catch (err) {
      setImportFeedback(
        err instanceof Error
          ? err.message
          : 'সঠিক অফলাইন ডাটা প্যাকেট কোড প্রদান করুন।'
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleCloudSync = async () => {
    setSyncing(true);
    setImportFeedback('');
    try {
      await onSyncAllOnline();
      setImportFeedback('সব অফলাইন এন্ট্রি সফলভাবে অনলাইনে সিঙ্ক হয়েছে!');
    } catch {
      setImportFeedback('সিঙ্ক করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করুন।');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header matching Screen 13 & 15 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            onClick={onClose}
            className="min-h-[40px] flex items-center gap-2 text-slate-900 font-bold text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              {activeTab === 'sync_center'
                ? 'সিঙ্ক কেন্দ্র'
                : 'Bluetooth ট্রান্সফার'}
            </span>
          </button>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('sync_center')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'sync_center'
                  ? 'bg-[#155DFC] text-white'
                  : 'text-slate-600'
              }`}
            >
              সিঙ্ক কেন্দ্র
            </button>
            <button
              onClick={() => setActiveTab('bluetooth')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                activeTab === 'bluetooth'
                  ? 'bg-[#155DFC] text-white'
                  : 'text-slate-600'
              }`}
            >
              Bluetooth
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Screen 13: Sync Center (Offline -> Online) */}
          {activeTab === 'sync_center' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <span className="text-xs text-slate-500 block">
                  বর্তমান অবস্থা
                </span>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <RefreshCw
                      className={`w-6 h-6 text-[#155DFC] ${
                        syncing ? 'animate-spin' : ''
                      }`}
                    />
                    <div>
                      <p className="text-base font-extrabold text-[#0F3878]">
                        {isOnline
                          ? syncing
                            ? 'সিঙ্কিং...'
                            : 'অনলাইন সিঙ্ক সক্রিয়'
                          : 'অফলাইন মোড সক্রিয়'}
                      </p>
                      <p className="text-xs text-slate-500">
                        অপেক্ষমাণ অফলাইন এন্ট্রি:{' '}
                        {toBanglaNumber(offlineQueue.length)} টি
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onToggleSimulatedOffline}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-xs font-bold text-[#155DFC]"
                  >
                    {simulatedOffline ? 'অনলাইন করুন' : 'অফলাইন টেস্ট'}
                  </button>
                </div>
              </div>

              {/* Checklist like Screen 13 */}
              <div className="space-y-3 px-1">
                <div className="flex items-center gap-3 text-sm text-slate-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    {toBanglaNumber(offlineQueue.length)} টি অফলাইন ইভেন্ট আপলোডের জন্য প্রস্তুত
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>রিয়েল-টাইম ক্লাউড ডাটাবেস সংযোগ স্থাপন</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>দ্বিপাক্ষিক ইনভয়েস ও ডেটা যাচাই সচল</span>
                </div>
              </div>

              <button
                disabled={!isOnline || offlineQueue.length === 0 || syncing}
                onClick={handleCloudSync}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors"
              >
                {syncing
                  ? 'সিঙ্ক হচ্ছে...'
                  : `এখনই সিঙ্ক করুন (${toBanglaNumber(offlineQueue.length)})`}
              </button>

              {importFeedback && (
                <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  {importFeedback}
                </p>
              )}

              <div className="p-3 rounded-xl bg-slate-100 text-center text-xs text-slate-600">
                সিঙ্ক সম্পন্ন হলে দোকানদার ও গ্রাহক নোটিফিকেশন পাবেন
              </div>
            </div>
          ) : (
            /* Screen 15: Bluetooth Transfer */
            <div className="space-y-5">
              {/* Two Phones + Bluetooth Illustration like Screen 15 */}
              <div className="py-4 flex items-center justify-center gap-4">
                <div className="w-14 h-24 rounded-2xl border-2 border-[#0F3878] bg-blue-50 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-[#0F3878]" />
                </div>
                <div className="flex items-center gap-1.5 text-[#155DFC]">
                  <span className="text-xs font-bold">→</span>
                  <div className="w-10 h-10 rounded-full bg-[#155DFC] text-white flex items-center justify-center shadow-md">
                    <Bluetooth className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold">←</span>
                </div>
                <div className="w-14 h-24 rounded-2xl border-2 border-[#0F3878] bg-blue-50 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-[#0F3878]" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-base font-extrabold text-[#0F3878]">
                  ডিভাইস খুঁজে পাওয়া গেছে
                </h3>
                <p className="text-xs text-slate-500">
                  ইন্টারনেট না থাকলেও সরাসরি Bluetooth বা WiFi QR দিয়ে ডেটা পাঠান
                </p>
              </div>

              {/* Connected Device Card like Screen 15 */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#155DFC] text-white flex items-center justify-center">
                    <Bluetooth className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {btDeviceName}
                    </p>
                    <p className="text-xs font-semibold text-emerald-600">
                      {btConnected ? 'সংযুক্ত' : 'সংযোগের অপেক্ষায়'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleBluetoothConnect}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-[#155DFC]"
                >
                  স্ক্যান
                </button>
              </div>

              {btStatus && (
                <p className="text-xs text-slate-700 bg-blue-50 border border-blue-200 rounded-xl p-3">
                  {btStatus}
                </p>
              )}

              {/* Offline Packet Share / QR */}
              {offlineQueue.length > 0 && activePacket && (
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3 text-center">
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {offlineQueue.map((pkt, idx) => (
                      <button
                        key={pkt.id}
                        onClick={() => setSelectedPacketIdx(idx)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${
                          selectedPacketIdx === idx
                            ? 'bg-[#155DFC] text-white'
                            : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {pkt.customerName} ({formatTaka(pkt.amount)})
                      </button>
                    ))}
                  </div>
                  <div className="inline-flex p-3 bg-white rounded-xl border border-slate-200">
                    <QRCodeSVG value={serializedPacket} size={130} level="L" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    {activePacket.shopName} · {formatBanglaDate(activePacket.txDate)} ·{' '}
                    {formatTaka(activePacket.amount)}
                  </p>
                </div>
              )}

              <button
                onClick={async () => {
                  if (serializedPacket) {
                    await handleCopyPacket();
                    setBtStatus(
                      'ডেটা প্যাকেট কপি ও ট্রান্সফারের জন্য প্রস্তুত! অপর ফোনে নিচে পেস্ট করে গ্রহণ করুন।'
                    );
                  } else {
                    await handleBluetoothConnect();
                  }
                }}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {copiedPacket ? (
                  <>
                    <Check className="w-4 h-4" />
                    ডেটা প্যাকেট কপি হয়েছে
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    ডেটা পাঠান
                  </>
                )}
              </button>

              {/* Receive Data Packet */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  অন্য ফোন থেকে প্রাপ্ত ডেটা গ্রহণ করুন:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder="প্রাপ্ত Bluetooth/WiFi ডেটা কোড পেস্ট করুন..."
                    className="flex-1 min-h-[42px] px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                  <button
                    disabled={syncing || !importInput.trim()}
                    onClick={handleImport}
                    className="min-h-[42px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    গ্রহণ
                  </button>
                </div>
                {importFeedback && (
                  <p className="text-xs font-medium text-emerald-700">
                    {importFeedback}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
