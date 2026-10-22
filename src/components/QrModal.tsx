import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsQR from 'jsqr';
import {
  QrCode,
  Camera,
  Copy,
  Check,
  ArrowLeft,
  Store,
  User,
  RefreshCw,
  Share2,
  CheckCircle2,
  ImageUp,
  SwitchCamera,
} from 'lucide-react';
import { Shop, UserRole } from '../types';
import { toBanglaNumber } from '../utils/format';

export interface QrCatalogProduct {
  id: string;
  name: string;
  unitPrice: number;
  unit: string;
}

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'show_shop_qr' | 'scan_to_link';
  activeRole?: UserRole;
  linkedShopName?: string;
  myShop: Shop | null;
  availableShops?: Shop[];
  shopProducts?: QrCatalogProduct[];
  currentUserId: string;
  customerName?: string;
  onLinkShopById: (shopIdOrPayload: string) => Promise<string | void>;
}

export const QrModal: React.FC<QrModalProps> = ({
  isOpen,
  onClose,
  mode,
  activeRole = 'customer',
  linkedShopName,
  myShop,
  availableShops = [],
  shopProducts = [],
  customerName,
  onLinkShopById,
}) => {
  const isCustomer = activeRole === 'customer';

  const [activeTab, setActiveTab] = useState<'qr' | 'scan' | 'confirmed'>(
    isCustomer ? 'scan' : mode === 'show_shop_qr' ? 'qr' : 'scan'
  );
  const [manualInput, setManualInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [linking, setLinking] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [qrNonce, setQrNonce] = useState(1);
  const [linkedShopTitle, setLinkedShopTitle] = useState('');
  const [linkedShopCode, setLinkedShopCode] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isHandlingScanRef = useRef(false);

  // Keep latest callbacks in refs so camera useEffect never restarts on parent re-renders
  const onLinkRef = useRef(onLinkShopById);
  onLinkRef.current = onLinkShopById;
  const availableShopsRef = useRef(availableShops);
  availableShopsRef.current = availableShops;

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const handleConnect = useCallback(
    async (rawPayload: string) => {
      const trimmed = rawPayload.trim();
      if (!trimmed || isHandlingScanRef.current) return;
      isHandlingScanRef.current = true;
      setLinking(true);
      setStatusMsg('');
      try {
        let parsedName = '';
        let parsedCode = '';
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.shopName || parsed.name) {
            parsedName = parsed.shopName || parsed.name;
          }
          if (parsed.shopCode || parsed.code) {
            parsedCode = parsed.shopCode || parsed.code;
          }
        } catch {
          const found = availableShopsRef.current.find(
            (s) =>
              s.ownerId === trimmed ||
              s.shopCode.toLowerCase() === trimmed.toLowerCase()
          );
          if (found) {
            parsedName = found.shopName;
            parsedCode = found.shopCode;
          }
        }
        stopCamera();
        const resolvedShopName = await onLinkRef.current(trimmed);
        setLinkedShopTitle(
          (typeof resolvedShopName === 'string' && resolvedShopName) ||
            parsedName ||
            'সংযুক্ত দোকান'
        );
        setLinkedShopCode(parsedCode);
        setManualInput('');
        setActiveTab('confirmed');
      } catch (err) {
        setStatusMsg(
          err instanceof Error
            ? err.message
            : 'দোকান খুঁজে পাওয়া যায়নি। সঠিক কিউআর কোড বা দোকান কোড দিন।'
        );
      } finally {
        setLinking(false);
        isHandlingScanRef.current = false;
      }
    },
    [stopCamera]
  );

  const startScannerLoop = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let barcodeDetector: any = null;
    if ('BarcodeDetector' in window) {
      try {
        // @ts-expect-error BarcodeDetector experimental API
        barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    scanTimerRef.current = window.setInterval(async () => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || isHandlingScanRef.current) {
        return;
      }

      // 1. Native BarcodeDetector if available
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(v);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            await handleConnect(barcodes[0].rawValue);
            return;
          }
        } catch {
          // fallback to jsQR
        }
      }

      // 2. Universal jsQR frame decoding via canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const vw = v.videoWidth || 640;
      const vh = v.videoHeight || 480;
      if (vw === 0 || vh === 0) return;

      const targetW = Math.min(640, vw);
      const targetH = Math.round((vh / vw) * targetW);
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(v, 0, 0, targetW, targetH);
      const imageData = ctx.getImageData(0, 0, targetW, targetH);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data && code.data.trim()) {
        await handleConnect(code.data);
      }
    }, 200);
  }, [handleConnect]);

  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user' = 'environment') => {
      stopCamera();
      setCameraError('');
      setStatusMsg('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'আপনার ব্রাউজারে ক্যামেরা সাপোর্ট করছে না। নিচে গ্যালারি থেকে কিউআর ছবি স্ক্যান করুন অথবা দোকান কোড লিখুন।'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 640 },
              height: { ideal: 640 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        setCameraActive(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch(() => {});
        }

        startScannerLoop();
      } catch {
        setCameraError(
          'ক্যামেরা চালু করার অনুমতি পাওয়া যায়নি। নিচে "গ্যালারি থেকে কিউআর ছবি স্ক্যান করুন" বাটনে চাপ দিন অথবা দোকান কোড লিখুন।'
        );
        setCameraActive(false);
      }
    },
    [stopCamera, startScannerLoop]
  );

  // Open / close effect — only depends on isOpen, mode, isCustomer
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    const nextTab = isCustomer
      ? 'scan'
      : mode === 'show_shop_qr'
      ? 'qr'
      : 'scan';
    setActiveTab(nextTab);
    setCameraError('');
    setStatusMsg('');

    if (nextTab === 'scan') {
      const timer = window.setTimeout(() => {
        startCamera('environment');
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, mode, isCustomer, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleToggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  // Multi-scale QR image decoding from Gallery / Screenshot
  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMsg('');
    setCameraError('');

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Try multiple scales so both small QR crops and high-res screenshots decode reliably
        const scales = [800, 1200, 500, 350];
        for (const maxDim of scales) {
          const ratio = Math.min(
            1,
            maxDim / Math.max(img.width, img.height, 1)
          );
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          canvas.width = w;
          canvas.height = h;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const decoded = jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
              inversionAttempts: 'attemptBoth',
            }
          );
          if (decoded && decoded.data && decoded.data.trim()) {
            await handleConnect(decoded.data);
            return;
          }
        }

        setStatusMsg(
          'এই ছবিতে কোনো বৈধ কিউআর কোড পাওয়া যায়নি। স্পষ্ট কিউআর কোডের ছবি দিন।'
        );
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  // Compact ASCII QR payload (~45 bytes) so QR modules are large, crisp, and scan instantaneously!
  // Full shop info & product catalog are fetched from Firestore online database using code/id.
  const qrPayload =
    !isCustomer && myShop
      ? JSON.stringify({
          app: 'ah',
          id: myShop.ownerId,
          code: myShop.shopCode,
          v: qrNonce,
        })
      : '';

  const handleCopyCode = async () => {
    if (!myShop) return;
    await navigator.clipboard.writeText(myShop.shopCode || myShop.ownerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Hidden canvas for jsQR decoding */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-w-[40px] min-h-[40px] flex items-center gap-2 text-slate-800 hover:text-blue-700 font-bold text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              {activeTab === 'qr'
                ? 'আমার দোকানের কিউআর'
                : activeTab === 'scan'
                ? 'কিউআর স্ক্যান করে দোকানদার এড করুন'
                : 'লিংক নিশ্চিতকরণ'}
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Generate Shop QR (ONLY for Shopkeeper) */}
          {!isCustomer && activeTab === 'qr' && (
            <>
              {myShop ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-xs">
                    <QRCodeSVG
                      value={qrPayload}
                      size={220}
                      level="L"
                      includeMargin={true}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-base font-extrabold text-[#0F3878] break-words">
                      দোকান কোড: {myShop.shopCode}
                    </p>
                    <h3 className="text-lg font-bold text-slate-900 break-words">
                      {myShop.shopName}
                    </h3>
                    <p className="text-xs text-slate-500 pt-1">
                      এই কিউআর স্ক্যান করলে কাস্টমার অনলাইন ডাটাবেজের মাধ্যমে আপনার দোকানের সাথে যুক্ত হবে এবং আপনার দোকানের পণ্য তালিকা ({toBanglaNumber(shopProducts.length)} টি পণ্য) কাস্টমারের মোবাইলে চলে যাবে।
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-xl">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>অনলাইন ডাটাবেজ ও পণ্য তালিকা সক্রিয়</span>
                  </div>

                  {/* Copyable Shop Link Code */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-500 block">
                        দোকান লিংক কোড:
                      </span>
                      <p className="font-mono text-xs font-bold text-slate-800 break-all">
                        {myShop.shopCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-[#155DFC] flex items-center gap-1 shrink-0"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          কপি হয়েছে
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          কপি করুন
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F3878] hover:bg-blue-950 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      কোড শেয়ার করুন
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrNonce((n) => n + 1)}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      নতুন কিউআর তৈরি
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <Store className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-sm text-slate-600">
                    আপনার দোকান প্রোফাইল সেটআপ করা নেই।
                  </p>
                </div>
              )}
            </>
          )}

          {/* Scan QR (Customer Side — ONLY Scan) */}
          {(isCustomer || activeTab === 'scan') && activeTab !== 'confirmed' && (
            <div className="space-y-4">
              {/* Show currently linked shop clearly if already linked */}
              {linkedShopName && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-800">
                      বর্তমানে এই দোকানের সাথে লিংক করা:
                    </p>
                    <p className="text-sm font-extrabold text-emerald-950 break-words">
                      {linkedShopName}
                    </p>
                  </div>
                </div>
              )}

              {/* Live Camera Scanner Box — <video> is ALWAYS mounted so ref is ready immediately */}
              <div className="bg-slate-900 rounded-2xl overflow-hidden text-center relative min-h-[240px] flex flex-col items-center justify-center p-4">
                <div
                  className={
                    cameraActive ? 'w-full space-y-3' : 'hidden'
                  }
                >
                  <div className="relative w-full h-56 rounded-xl overflow-hidden border-2 border-emerald-400 bg-black">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      autoPlay
                      muted
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-44 h-44 border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                        <span className="w-5 h-5 border-t-4 border-l-4 border-emerald-400 absolute -top-1 -left-1 rounded-tl-md" />
                        <span className="w-5 h-5 border-t-4 border-r-4 border-emerald-400 absolute -top-1 -right-1 rounded-tr-md" />
                        <span className="w-5 h-5 border-b-4 border-l-4 border-emerald-400 absolute -bottom-1 -left-1 rounded-bl-md" />
                        <span className="w-5 h-5 border-b-4 border-r-4 border-emerald-400 absolute -bottom-1 -right-1 rounded-br-md" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleFacingMode}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white inline-flex items-center gap-1.5"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      ক্যামেরা পরিবর্তন
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-xs font-bold text-white"
                    >
                      ক্যামেরা বন্ধ করুন
                    </button>
                  </div>
                </div>

                {!cameraActive && (
                  <div className="space-y-3 py-2">
                    <div className="w-32 h-32 mx-auto relative flex items-center justify-center bg-white/95 rounded-2xl p-3">
                      <span className="w-5 h-5 border-t-4 border-l-4 border-emerald-500 absolute -top-1.5 -left-1.5 rounded-tl-md" />
                      <span className="w-5 h-5 border-t-4 border-r-4 border-emerald-500 absolute -top-1.5 -right-1.5 rounded-tr-md" />
                      <span className="w-5 h-5 border-b-4 border-l-4 border-emerald-500 absolute -bottom-1.5 -left-1.5 rounded-bl-md" />
                      <span className="w-5 h-5 border-b-4 border-r-4 border-emerald-500 absolute -bottom-1.5 -right-1.5 rounded-br-md" />
                      <QrCode className="w-20 h-20 text-slate-900" />
                    </div>
                    <button
                      type="button"
                      onClick={() => startCamera('environment')}
                      className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      ক্যামেরা চালু করে কিউআর স্ক্যান করুন
                    </button>
                  </div>
                )}
              </div>

              {/* Upload QR Image from Gallery Button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleQrImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0F3878] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors"
                >
                  <ImageUp className="w-4 h-4 text-[#155DFC]" />
                  গ্যালারি থেকে কিউআর ছবি স্ক্যান করুন
                </button>
              </div>

              {cameraError && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  {cameraError}
                </p>
              )}

              {/* Manual Shop Code Input */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-700">
                  অথবা দোকানদারের কোড লিখে যুক্ত হোন:
                </label>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="দোকান কোড লিখুন (যেমন: AH-1234)..."
                  className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-[#155DFC]"
                />
              </div>

              {statusMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 text-center">
                  {statusMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={linking || !manualInput.trim()}
                  onClick={() => handleConnect(manualInput.trim())}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold"
                >
                  {linking ? 'যুক্ত হচ্ছে...' : 'যুক্ত হোন'}
                </button>
              </div>
            </div>
          )}

          {/* Link Confirmation */}
          {activeTab === 'confirmed' && (
            <div className="text-center space-y-5 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <Check className="w-9 h-9 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-emerald-700">
                  বর্তমানে এই দোকানের সাথে লিংক করা!
                </h3>
                <p className="text-xs text-slate-600 break-words">
                  আপনি এখন {linkedShopTitle}-এর সাথে সংযুক্ত এবং ওই দোকানের পণ্য লিস্ট আপনার অ্যাপে যুক্ত হয়েছে।
                </p>
              </div>

              <div className="space-y-3 text-left">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-500 block">
                      বর্তমানে এই দোকানের সাথে লিংক করা:
                    </span>
                    <p className="text-sm font-bold text-slate-900 break-words">
                      {linkedShopTitle}
                    </p>
                    {linkedShopCode && (
                      <p className="text-xs text-slate-500 break-words">
                        দোকান কোড: {linkedShopCode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#155DFC] flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-500 block">
                      কাস্টমার
                    </span>
                    <p className="text-sm font-bold text-slate-900 break-words">
                      {customerName || 'আপনার অ্যাকাউন্ট'}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#155DFC] hover:bg-blue-700 text-white text-sm font-bold transition-colors"
              >
                ঠিক আছে
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
