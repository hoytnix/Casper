import { z } from 'zod';
import type { ImageAttachment } from '@/types';

// Centralized image-attachment policy for Casper chat (dependency-first:
// types → this validator → client UI → route handler). Pure Zod + pure
// helpers only — no window, no document, no Node Buffer — so this module is
// safe to import from both the browser bundle and the Node route handler.

export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 7 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1600;
export const IMAGE_JPEG_QUALITY = 0.82;

export const SUPPORTED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

const DATA_URL_RE =
  /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export const imageAttachmentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  mimeType: z.enum(SUPPORTED_IMAGE_MIMES),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
  width: z.number().int().positive().max(16384).optional(),
  height: z.number().int().positive().max(16384).optional(),
  dataUrl: z.string().min(1).max(10 * 1024 * 1024).regex(DATA_URL_RE),
  createdAt: z.number().int().positive(),
});

export const chatImagesSchema = z
  .array(imageAttachmentSchema)
  .max(MAX_IMAGES_PER_MESSAGE)
  .refine(
    (imgs) => imgs.reduce((acc, img) => acc + img.sizeBytes, 0) <= MAX_TOTAL_BYTES,
    { message: `Total image payload exceeds ${MAX_TOTAL_BYTES} bytes` }
  );

export const compileImagesInputSchema = z.object({
  promptText: z.string().trim().min(1).max(20000),
  images: chatImagesSchema.optional().default([]),
});

export function isSupportedMime(mime: unknown): boolean {
  return (
    typeof mime === 'string' &&
    (SUPPORTED_IMAGE_MIMES as readonly string[]).includes(mime)
  );
}

export function parseDataUrl(
  dataUrl: string
): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const match = header.match(/^data:(image\/(?:png|jpeg|webp|gif));base64$/);
  if (!match || base64.length === 0) return null;
  return { mimeType: match[1], base64 };
}

export function estimateBase64Bytes(dataUrlOrBase64: string): number {
  if (typeof dataUrlOrBase64 !== 'string' || dataUrlOrBase64.length === 0) return 0;
  const comma = dataUrlOrBase64.indexOf(',');
  const b64 =
    dataUrlOrBase64.startsWith('data:') && comma !== -1
      ? dataUrlOrBase64.slice(comma + 1)
      : dataUrlOrBase64;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function sumImageBytes(images: Pick<ImageAttachment, 'sizeBytes'>[]): number {
  return images.reduce((acc, img) => acc + (img.sizeBytes || 0), 0);
}

/**
 * Token uplift for one image. Tile-based estimate (width×height/750, in the
 * spirit of provider vision pricing) with a byte-derived fallback when
 * dimensions are unknown. Deliberately NOT base64/4 — that counts raw bytes
 * as tokens and would overstate a 1MB screenshot by ~250×.
 */
export function estimateImageTokens(img: {
  width?: number;
  height?: number;
  base64Chars?: number;
}): number {
  if (
    typeof img.width === 'number' &&
    typeof img.height === 'number' &&
    img.width > 0 &&
    img.height > 0
  ) {
    return Math.max(64, Math.ceil((img.width * img.height) / 750));
  }
  const chars = typeof img.base64Chars === 'number' ? img.base64Chars : 0;
  return Math.max(64, Math.ceil(chars / 2000));
}

export function estimateImagesTokens(
  images: Pick<ImageAttachment, 'width' | 'height' | 'dataUrl'>[]
): number {
  return images.reduce(
    (acc, img) =>
      acc +
      estimateImageTokens({
        width: img.width,
        height: img.height,
        base64Chars: (img.dataUrl.split(',')[1] || '').length,
      }),
    0
  );
}

// --- Provider-native multimodal mappers (pure; shared by the route) ---

export function toGeminiInlineParts(
  images: Pick<ImageAttachment, 'mimeType' | 'dataUrl'>[]
): { inlineData: { mimeType: string; data: string } }[] {
  const parts: { inlineData: { mimeType: string; data: string } }[] = [];
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl);
    if (!parsed) continue;
    parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } });
  }
  return parts;
}

// Normalized image payload for the repo's Muse transport, which is
// OpenAI-compatible (chat/completions + Responses `input`), NOT Anthropic
// `source: { type: 'base64' }` blocks — hence this neutral shape, mapped to
// `image_url` / `input_image` parts inside lib/muse-stream.ts builders.
export function toMuseImageParts(
  images: Pick<ImageAttachment, 'mimeType' | 'dataUrl'>[]
): { mimeType: string; data: string }[] {
  const parts: { mimeType: string; data: string }[] = [];
  for (const img of images) {
    const parsed = parseDataUrl(img.dataUrl);
    if (!parsed) continue;
    parts.push({ mimeType: parsed.mimeType, data: parsed.base64 });
  }
  return parts;
}

// --- Browser-only ingestion (called from client components only) ---

function probeImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: probe.naturalWidth || 0, height: probe.naturalHeight || 0 });
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      probe.src = url;
    } catch {
      resolve({ width: 0, height: 0 });
    }
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Downscales + JPEG-recompresses oversized images entirely in-browser
// (createImageBitmap + OffscreenCanvas, HTMLCanvasElement fallback).
// Returns the original file when it already fits. No Node sharp, no fs.
export async function downscaleImageFile(file: File): Promise<File> {
  const dims = await probeImageDimensions(file);
  const needsResize =
    file.size > MAX_IMAGE_BYTES ||
    dims.width > MAX_IMAGE_DIMENSION ||
    dims.height > MAX_IMAGE_DIMENSION;
  if (!needsResize) return file;
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(1, dims.width),
    MAX_IMAGE_DIMENSION / Math.max(1, dims.height)
  );
  const targetW = Math.max(1, Math.round((dims.width || MAX_IMAGE_DIMENSION) * scale));
  const targetH = Math.max(1, Math.round((dims.height || MAX_IMAGE_DIMENSION) * scale));
  try {
    const bitmap = await createImageBitmap(file);
    const w = Math.min(bitmap.width, targetW);
    const h = Math.min(bitmap.height, targetH);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: IMAGE_JPEG_QUALITY });
      if (typeof bitmap.close === 'function') bitmap.close();
      return new File([blob], file.name.replace(/\.[a-z]+$/i, '.jpg'), { type: 'image/jpeg' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (typeof bitmap.close === 'function') bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_JPEG_QUALITY)
    );
    if (!blob) throw new Error('canvas encode failed');
    return new File([blob], file.name.replace(/\.[a-z]+$/i, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  if (!isSupportedMime(file.type)) {
    throw new Error(`Unsupported image type: ${file.type || 'unknown'}. Use PNG, JPEG, WebP, or GIF.`);
  }
  const fitted = await downscaleImageFile(file);
  if (fitted.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name} exceeds 5MB even after downscaling.`);
  }
  const dataUrl = await readFileAsDataUrl(fitted);
  if (!DATA_URL_RE.test(dataUrl)) {
    throw new Error(`${file.name} could not be encoded as a supported image.`);
  }
  const dims = await probeImageDimensions(fitted);
  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.slice(0, 128) || 'pasted-image',
    mimeType: (isSupportedMime(fitted.type) ? fitted.type : file.type) as ImageAttachment['mimeType'],
    sizeBytes: fitted.size,
    width: dims.width > 0 ? dims.width : undefined,
    height: dims.height > 0 ? dims.height : undefined,
    dataUrl,
    createdAt: Date.now(),
  };
}

// Accepts a paste/drop DataTransferItemList (or array) and returns only the
// image Files, so text/HTML clipboard payloads keep their default behavior.
export function clipboardItemsToFiles(
  items: DataTransferItemList | DataTransferItem[] | undefined | null
): File[] {
  if (!items) return [];
  const list: DataTransferItem[] = Array.isArray(items) ? items : Array.from(items);
  const files: File[] = [];
  for (const item of list) {
    if (item.kind !== 'file') continue;
    if (!item.type || !item.type.startsWith('image/')) continue;
    const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
    if (file) files.push(file);
  }
  return files;
}
