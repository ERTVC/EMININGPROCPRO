import { VALIDATION_LIMITS } from '../types';
import {
  ERTVC_CREST_FALLBACK_DATA_URL,
  KENYA_COAT_OF_ARMS_FALLBACK_DATA_URL,
} from './headerAssets';

export const ERTVC_LOGO_PATH = '/assets/aistudio/images_6692f763.jpg';
export const ERTVC_CREST_PATH = '/assets/aistudio/ertvc_crest.png';
export const ERTVC_COAT_OF_ARMS_PATH = '/assets/aistudio/kenya_coat_of_arms.png';
export const ERTVC_BUILDING_PATH = '/assets/aistudio/ERTVCBuilding_f08d2c46.jpg';
export const DEFAULT_INSTITUTION_NAME = 'Eldama Ravine Technical & Vocational College';

export const LEGACY_CORRUPT_LOGO_PREFIX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwY';

export const APP_LOGO_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAADoElEQVR4nOWbBVsUQRyH52OIIiKNCBJKo2CAwmN3d3d3d7fYnTQWZSuggopdIPBJfj5zsjKc3LI7M3Ix7/PsB3jfvZub/84eISbpN7gW/YbUou/QX+g7jF41SBleg5QR1UgeWY3kUT/RZ/RP9BnzA73H/kDvcd/Ra/x39JrwDT3pNfErkiZ9RdLkL0ic8gWJUz8jcdpn9Jj+CT1mfEL3mR8tV8KsD0iY/QHxc94jfu57xM2rQtz8KsQueIfYhe8Qs+gtYhbT6w2il7xB9NJKRC2rhFmfFkkbUI/UgXVIHVQHR5ePWl6ByBUViFz5Gt1WvUa31a/4g6T1r4ezy3ddQ6+XiFj70lwIV5OPWFeO8PXlxiK4qnz4hjKEbyzTj+Dq8mGbShG2ubT5CKrIh255gdCtL/6NoJJ8l23PobQ8vUK2P2uMoKJ8yA42gILywTufNgZQUT54V0MAVeU7736CznuegKgsH7T3MYjK8kH7aACF5Tvtf0QDyJG3B6LylgDOKq8hIt/pwEMQZ5bX4JUPPPgQhFfeETErH3joAYiryGuYkQ84/ADEjLwzYUQ+4EgJiCvKa7Qk73+0BMTZFjyjGJH3P1YMwrPJcWSMfOw1eb/jxSC8OzxHxKy834kiENHtrSNgdMGzlvdNLwKRsbd3Vnnf9EIQWYMNL3SwsZe8z8lCEHvI6011ZhGR9zlVACJjpDUCz0hrBBF579MFIDLmeVvozfMU6zuvN9XpBuCU9z5zH0TGwwwWvYcZ1rB33hq9waZJAAF577M0gIQnORZxG09y9GA/9nrYGmwoIvJe5+6B/K/HWEZgv/NGEF3wrOW9ztMAEuXNYnbBY5Eh3/HCXRAZ8rywCx4vIvIdLzYEaO07r8Gu9ryIyHtevAMi4zsvEkBb7bkDCMh7XqIBWmnBaw4jv/MtISLf4fJtEBmHFtwBmN957gAC8h2u0AASTmx4YTc5vIjIe1zNB5FxXMUdgNnh8Qfgl/e4RgNIOKvjxdb21gwi8u2v54HIOKjkDsBsb7kDCMi3v0EDSDil5YXd2/MiIu9+MxdExhE1dwCrwYYrgIC8+y0aQML5PC/sYMMdQEC+XUYODSD+coJQgIapjhcReUsAe72ZIXOk5ZVvl5kNorJ826xsEJXl22Zn/XlXUGl5SwAF5d1ymAAqyrvlZjIBFJRvk5fZ9D8DSstTVJJvk5/R/P+GlJb/G0FleQ2l5TWUlmdxdnlucVs4urxZn9/ifUuZWDnpcQAAAABJRU5ErkJggg==';

const dataUrlCache = new Map<string, string>();

const OFFICIAL_ASSET_FALLBACKS: Record<string, string> = {
  [ERTVC_COAT_OF_ARMS_PATH]: KENYA_COAT_OF_ARMS_FALLBACK_DATA_URL,
  [ERTVC_CREST_PATH]: ERTVC_CREST_FALLBACK_DATA_URL,
};

export function sanitizeLogoDataUrl(logo?: string | null): string {
  if (!logo || typeof logo !== 'string') return ERTVC_LOGO_PATH;
  if (logo.startsWith(LEGACY_CORRUPT_LOGO_PREFIX)) return ERTVC_LOGO_PATH;
  if (logo === APP_LOGO_BASE64) return ERTVC_LOGO_PATH;
  if (logo.length > VALIDATION_LIMITS.MAX_LOGO_LENGTH) return ERTVC_LOGO_PATH;
  return logo;
}

async function resolveDataUrlForPdf(logoSrc: string): Promise<string> {
  if (logoSrc.startsWith('data:image/')) {
    return logoSrc;
  }
  const cached = dataUrlCache.get(logoSrc);
  if (cached) return cached;

  try {
    const response = await window.fetch(logoSrc, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Unexpected MIME type: ${blob.type || 'unknown'}`);
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
    if (dataUrl.startsWith('data:image/')) {
      dataUrlCache.set(logoSrc, dataUrl);
      return dataUrl;
    }
  } catch (err) {
    console.error('Failed to fetch logo URL for PDF, using embedded fallback:', err);
  }
  return OFFICIAL_ASSET_FALLBACKS[logoSrc] || APP_LOGO_BASE64;
}

export async function addLogoToPdf(
  doc: any,
  logo: string | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  const safeLogo = sanitizeLogoDataUrl(logo);
  const resolvedDataUrl = await resolveDataUrlForPdf(safeLogo);
  const preferredFallback = OFFICIAL_ASSET_FALLBACKS[safeLogo] || APP_LOGO_BASE64;

  const detectFormat = (dataUrl: string) => {
    const match = /^data:image\/([a-zA-Z0-9+.-]+);/i.exec(dataUrl);
    const mime = match ? match[1].toUpperCase() : 'PNG';
    if (mime === 'JPG') return 'JPEG';
    if (mime === 'PNG' || mime === 'JPEG' || mime === 'WEBP') return mime;
    return 'PNG';
  };

  try {
    doc.addImage(resolvedDataUrl, detectFormat(resolvedDataUrl), x, y, width, height);
  } catch (err) {
    if (resolvedDataUrl !== preferredFallback) {
      try {
        doc.addImage(preferredFallback, detectFormat(preferredFallback), x, y, width, height);
      } catch (fallbackErr) {
        console.error('Error adding fallback logo to PDF', fallbackErr);
      }
    } else {
      console.error('Error adding logo to PDF', err);
    }
  }
}

export async function addOfficialHeaderToPdf(
  doc: any,
  options?: {
    title?: string;
    subtitle?: string;
    includeGeneratedDate?: boolean;
  },
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const centerX = pageWidth / 2;

  // Left: Kenyan Coat of Arms, Right: ERTVC Crest (matching official header.pdf)
  await Promise.all([
    addLogoToPdf(doc, ERTVC_COAT_OF_ARMS_PATH, marginX, 8, 24, 22.4),
    addLogoToPdf(doc, ERTVC_CREST_PATH, pageWidth - marginX - 25, 8, 25, 22.4),
  ]);

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  doc.setFontSize(13.5);
  doc.text('ELDAMA RAVINE TECHNICAL AND', centerX, 13.5, { align: 'center' });
  doc.text('VOCATIONAL COLLEGE', centerX, 19.5, { align: 'center' });

  doc.setFontSize(9.5);
  doc.text('P.O. BOX 560-20103 - ELDAMA RAVINE', centerX, 24.8, { align: 'center' });
  doc.text('(MAJI MAZURI - MAKUTANO ROAD)', centerX, 29.3, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.text('Phone: 0729226734', centerX, 33.8, { align: 'center' });

  // EMAIL: principal@ertvc.ac.ke. WEBSITE: http://www.ertvc.ac.ke
  doc.setFontSize(8.8);
  const part1 = 'EMAIL: ';
  const part2 = 'principal@ertvc.ac.ke';
  const part3 = '. ';
  const part4 = 'WEBSITE: ';
  const part5 = 'http://www.ertvc.ac.ke';

  doc.setFont('times', 'bold');
  const w1 = doc.getTextWidth(part1);
  const w4 = doc.getTextWidth(part4);
  doc.setFont('times', 'normal');
  const w2 = doc.getTextWidth(part2);
  const w3 = doc.getTextWidth(part3);
  const w5 = doc.getTextWidth(part5);

  let cursorX = centerX - (w1 + w2 + w3 + w4 + w5) / 2;
  const contactY = 38.3;

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  doc.text(part1, cursorX, contactY);
  cursorX += w1;

  doc.setTextColor(0, 70, 190);
  doc.setFont('times', 'normal');
  doc.text(part2, cursorX, contactY);
  doc.setDrawColor(0, 70, 190);
  doc.setLineWidth(0.2);
  doc.line(cursorX, contactY + 0.7, cursorX + w2, contactY + 0.7);
  cursorX += w2;

  doc.setTextColor(0, 0, 0);
  doc.text(part3, cursorX, contactY);
  cursorX += w3;

  doc.setFont('times', 'bold');
  doc.text(part4, cursorX, contactY);
  cursorX += w4;

  doc.setTextColor(0, 70, 190);
  doc.setFont('times', 'normal');
  doc.text(part5, cursorX, contactY);
  doc.line(cursorX, contactY + 0.7, cursorX + w5, contactY + 0.7);

  // Thick solid black horizontal bar
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.1);
  doc.line(marginX, 42, pageWidth - marginX, 42);

  // Reset defaults for document body
  doc.setLineWidth(0.2);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  let nextY = 48;
  const showDate = options?.includeGeneratedDate !== false;

  if (options?.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(options.title, centerX, nextY, { align: 'center' });
    nextY += 6;
  }

  if (options?.subtitle || showDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    if (options?.subtitle) {
      doc.text(options.subtitle, marginX, nextY);
    }
    if (showDate) {
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - marginX, nextY, {
        align: 'right',
      });
    }
    doc.setTextColor(0, 0, 0);
    nextY += 5.5;
  }

  return nextY;
}

export function resizeImageToPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = String(event.target?.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDims = [256, 160, 128, 96];
        let resultDataUrl = ERTVC_LOGO_PATH;
        for (const maxDim of maxDims) {
          const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((img.width || maxDim) * scale));
          canvas.height = Math.max(1, Math.round((img.height || maxDim) * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngDataUrl = canvas.toDataURL('image/png');
          if (pngDataUrl.length <= VALIDATION_LIMITS.MAX_LOGO_LENGTH) {
            resultDataUrl = pngDataUrl;
            break;
          }
        }
        resolve(resultDataUrl);
      };
      img.onerror = () => resolve(ERTVC_LOGO_PATH);
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function readProposalFileToDataUrl(
  file: File,
): Promise<{ fileName: string; dataUrl: string }> {
  const cleanName = (file.name || 'proposal.pdf')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_PROPOSAL_FILE_NAME_LENGTH);

  const isPdf =
    file.type === 'application/pdf' || cleanName.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new Error('Please upload a PDF document or scanned image (PNG/JPG).');
  }

  if (isPdf) {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read proposal PDF.'));
      reader.readAsDataURL(file);
    });
    if (rawDataUrl.length > VALIDATION_LIMITS.MAX_PROPOSAL_DATA_URL_LENGTH) {
      throw new Error(
        'Proposal PDF exceeds the 250 KB cloud attachment limit. Please compress the PDF or upload a scanned image.',
      );
    }
    return { fileName: cleanName, dataUrl: rawDataUrl };
  }

  // Image: compress cleanly to JPEG so proposal scans stay crisp and within Firestore bounds
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = String(event.target?.result || '');
      const img = new Image();
      img.onload = () => {
        const attempts = [
          { maxDim: 1200, quality: 0.8 },
          { maxDim: 960, quality: 0.72 },
          { maxDim: 720, quality: 0.65 },
        ];
        for (const attempt of attempts) {
          const scale = Math.min(
            1,
            attempt.maxDim / Math.max(img.width || attempt.maxDim, img.height || attempt.maxDim),
          );
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((img.width || attempt.maxDim) * scale));
          canvas.height = Math.max(1, Math.round((img.height || attempt.maxDim) * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not process proposal image.'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', attempt.quality);
          if (compressed.length <= VALIDATION_LIMITS.MAX_PROPOSAL_DATA_URL_LENGTH) {
            resolve(compressed);
            return;
          }
        }
        reject(new Error('Proposal image is too large even after compression.'));
      };
      img.onerror = () => reject(new Error('Could not load selected image file.'));
      img.src = src;
    };
    reader.onerror = () => reject(new Error('Failed to read proposal image.'));
    reader.readAsDataURL(file);
  });

  return { fileName: cleanName, dataUrl: imageDataUrl };
}

