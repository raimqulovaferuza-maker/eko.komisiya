import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../uploads');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export function hasValidImageMagicBytes(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (ext === 'png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (ext === 'jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === 'webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export function parseDataUrlImage(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return { valid: false, error: 'Rasm fayli yuborilmadi.' };
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return {
      valid: false,
      error: 'Faqat PNG, JPG yoki WEBP formatidagi rasm fayllariga ruxsat beriladi.',
    };
  }

  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'Rasm hajmi 4 MB dan oshmasligi kerak.',
    };
  }

  if (!hasValidImageMagicBytes(buffer, ext)) {
    return {
      valid: false,
      error: "Yuklangan fayl haqiqiy rasm formatiga mos kelmadi.",
    };
  }

  return { valid: true, buffer, ext };
}

export function saveUploadedImage(dataUrl, prefix = 'img') {
  const parsed = parseDataUrlImage(dataUrl);
  if (!parsed.valid) {
    return parsed;
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const safePrefix = String(prefix).replace(/[^a-z0-9_-]/gi, '') || 'img';
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${parsed.ext}`;
  const fullPath = path.join(uploadsDir, filename);
  fs.writeFileSync(fullPath, parsed.buffer);

  return {
    valid: true,
    url: `/uploads/${filename}`,
    filename,
  };
}

export function isValidImageUrlInput(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
