import { LedgerTransaction } from '../types';
import {
  formatTaka,
  toBanglaNumber,
  toBanglaDigitsPlain,
  formatBanglaDateFull,
  parseInvoiceDescription,
} from './format';

/**
 * Wraps a JPEG data URL into a valid single-page PDF 1.4 binary Blob (application/pdf).
 * Using Canvas -> JPEG -> PDF ensures 100% accurate Bangla Unicode rendering on all devices.
 */
function jpegDataUrlToPdfBlob(
  jpegDataUrl: string,
  widthPx: number,
  heightPx: number
): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const imgBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    imgBytes[i] = binaryStr.charCodeAt(i);
  }

  const pdfW = Math.round(widthPx * 0.5);
  const pdfH = Math.round(heightPx * 0.5);

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushText = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushText(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushText(`\nendobj\n`);
  };

  pushText(`%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`);

  // 1: Catalog
  startObj(1);
  pushText(`<< /Type /Catalog /Pages 2 0 R >>`);
  endObj();

  // 2: Pages
  startObj(2);
  pushText(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  endObj();

  // 3: Page
  startObj(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${pdfW} ${pdfH}] /Contents 5 0 R >>`
  );
  endObj();

  // 4: Image XObject (DCTDecode = JPEG)
  startObj(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
  );
  pushBytes(imgBytes);
  pushText(`\nendstream`);
  endObj();

  // 5: Page Content Stream
  const contentStream = `q\n${pdfW} 0 0 ${pdfH} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText(`endstream`);
  endObj();

  // Xref
  const xrefStart = currentOffset;
  pushText(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i]).padStart(10, '0');
    pushText(`${off} 00000 n \n`);
  }

  pushText(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  );

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

export interface ReceiptPdfMeta {
  transaction: LedgerTransaction;
  shopOwnerName: string;
  shopPhone: string;
  shopAddress: string;
  customerPhone: string;
  customerAddress: string;
  isPaid?: boolean;
}

/**
 * Renders the Bangla receipt to a high-DPI canvas and generates a real PDF File,
 * then shares it via Web Share API (or downloads it as a PDF).
 */
export async function shareOrDownloadReceiptPdf(
  meta: ReceiptPdfMeta
): Promise<'shared' | 'downloaded'> {
  const {
    transaction,
    shopOwnerName,
    shopPhone,
    shopAddress,
    customerPhone,
    customerAddress,
    isPaid = false,
  } = meta;

  const parsed = parseInvoiceDescription(
    transaction.description,
    transaction.amount,
    transaction.id
  );

  const dateStr = formatBanglaDateFull(transaction.txDate);
  const sealTitle =
    transaction.type === 'baki'
      ? isPaid
        ? 'পরিশোধিত'
        : 'বাকী'
      : transaction.type === 'joma'
      ? 'জমা'
      : 'নগদ';

  const statusText =
    transaction.status === 'approved'
      ? 'অনুমোদিত'
      : transaction.status === 'pending_shopkeeper'
      ? 'অপেক্ষমাণ (দোকানদার)'
      : transaction.status === 'pending_customer_approval'
      ? 'অপেক্ষমাণ (কাস্টমার)'
      : 'বাতিল';

  const scale = 2;
  const width = 660;
  const rowCount = Math.max(1, parsed.items.length);
  const extraRejectionHeight =
    transaction.status === 'rejected' && transaction.editReason ? 70 : 0;
  const height = 470 + rowCount * 42 + extraRejectionHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer border
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // 1. Shop Header (দোকানের নাম, প্রোঃ, মোবাইল নাম্বার কমা ছাড়া, ঠিকানা)
  ctx.fillStyle = '#0F3878';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(transaction.shopName || 'আমার হিসাব স্টোর', width / 2, 58);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`প্রোঃ ${shopOwnerName || 'দোকানদার'}`, width / 2, 84);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(
    `মোবাইল নম্বারঃ ${toBanglaDigitsPlain(shopPhone || '০১৭১১-২২৩৩৪৪')}`,
    width / 2,
    106
  );
  ctx.fillText(`ঠিকানাঃ ${shopAddress || 'প্রধান বাজার, সদর'}`, width / 2, 126);

  // Dashed divider
  ctx.strokeStyle = '#CBD5E1';
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(32, 142);
  ctx.lineTo(width - 32, 142);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Plain Receipt No (Left, no border) & Date (Right)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`রশিদ নং: ${parsed.invoiceNo}`, 36, 172);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`তারিখঃ ${dateStr}`, width - 36, 172);

  // 3. Customer Name (Left) & Mobile (Right, without commas)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`নামঃ ${transaction.customerName}`, 36, 204);

  ctx.textAlign = 'right';
  ctx.fillText(
    `মোবাইল নংঃ ${toBanglaDigitsPlain(customerPhone || '০১৮১২-৩৪৫৬৭৮')}`,
    width - 36,
    204
  );

  // 4. Customer Address below
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = '13px sans-serif';
  ctx.fillText(`ঠিকানাঃ ${customerAddress || 'প্রধান সড়ক, সদর'}`, 36, 228);

  // 5. Table Header: ক্রমিক নং | সময় | বিবরণ | পরিমান | দর | মোট
  const tableTop = 248;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(32, tableTop, width - 64, 34);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(32, tableTop, width - 64, 34);

  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ক্রমিক নং', 68, tableTop + 22);
  ctx.fillText('সময়', 135, tableTop + 22);
  ctx.textAlign = 'left';
  ctx.fillText('বিবরণ', 185, tableTop + 22);
  ctx.textAlign = 'center';
  ctx.fillText('পরিমান', 415, tableTop + 22);
  ctx.textAlign = 'right';
  ctx.fillText('দর', 515, tableTop + 22);
  ctx.fillText('মোট', width - 44, tableTop + 22);

  // Table Rows
  let y = tableTop + 34;
  parsed.items.forEach((item, idx) => {
    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(32, y, width - 64, 40);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(toBanglaDigitsPlain(idx + 1), 68, y + 25);

    ctx.fillStyle = '#475569';
    ctx.font = '12px sans-serif';
    ctx.fillText(item.time || '১০:৩০', 135, y + 25);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(item.itemName, 185, y + 25);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#334155';
    ctx.fillText(toBanglaDigitsPlain(item.quantity), 415, y + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.fillText(toBanglaNumber(item.unitPrice), 515, y + 25);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(toBanglaNumber(item.lineTotal), width - 44, y + 25);

    y += 40;
  });

  // 6. Bottom Footer: Left = অবস্থা, Center = Tilted Stamp (বাকী / নগদ), Right = মোট টাকা
  const footerTop = y + 18;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(32, footerTop, width - 64, 80);
  ctx.strokeStyle = '#CBD5E1';
  ctx.strokeRect(32, footerTop, width - 64, 80);

  // Left: অবস্থা
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('অবস্থাঃ', 48, footerTop + 32);
  ctx.fillStyle =
    transaction.status === 'approved'
      ? '#047857'
      : transaction.status === 'rejected'
      ? '#BE123C'
      : '#B45309';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(statusText, 48, footerTop + 54);

  // Center: Tilted Stamp Seal (বাকী / পরিশোধিত / জমা / নগদ)
  ctx.save();
  ctx.translate(width / 2, footerTop + 40);
  ctx.rotate((-12 * Math.PI) / 180);
  const stampColor =
    transaction.type === 'baki' && !isPaid ? '#BE123C' : '#047857';
  ctx.strokeStyle = stampColor;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-64, -24, 128, 48);
  ctx.lineWidth = 1;
  ctx.strokeRect(-60, -20, 120, 40);
  ctx.fillStyle = stampColor;
  ctx.textAlign = 'center';

  if (transaction.type === 'baki' && isPaid) {
    // Draw crossed-out "বাকী" above and "পরিশোধিত" below
    ctx.fillStyle = '#E11D48';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('বাকী', 0, -5);
    ctx.strokeStyle = '#E11D48';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-22, -9);
    ctx.lineTo(22, -9);
    ctx.stroke();

    ctx.fillStyle = '#047857';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('পরিশোধিত', 0, 13);
  } else {
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(sealTitle, 0, 7);
  }
  ctx.restore();

  // Right: মোট টাকা
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('মোট টাকা', width - 48, footerTop + 30);
  ctx.fillStyle = '#0F3878';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(formatTaka(transaction.amount), width - 48, footerTop + 56);

  // If rejected, show rejection reason below
  if (transaction.status === 'rejected' && transaction.editReason) {
    const rejTop = footerTop + 92;
    ctx.fillStyle = '#FFF1F2';
    ctx.fillRect(32, rejTop, width - 64, 44);
    ctx.strokeStyle = '#FECDD3';
    ctx.strokeRect(32, rejTop, width - 64, 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#BE123C';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(
      `বাতিলের কারণঃ ${transaction.editReason}`,
      46,
      rejTop + 27
    );
  }

  const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
  const pdfBlob = jpegDataUrlToPdfBlob(jpegUrl, width * scale, height * scale);
  const fileName = `রশিদ-${parsed.invoiceNo}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  // Try native Web Share API with PDF file
  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({
        title: `রশিদ নং ${parsed.invoiceNo}`,
        text: `${transaction.shopName} — রশিদ নং: ${parsed.invoiceNo}, মোট টাকা: ${formatTaka(
          transaction.amount
        )}`,
        files: [pdfFile],
      });
      return 'shared';
    } catch {
      // If user cancels or share fails in iframe, fall through to download
    }
  }

  // Fallback: trigger direct PDF download
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
