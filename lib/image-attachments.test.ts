import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_BYTES,
  computeTargetSize,
  chatImagesSchema,
  compileImagesInputSchema,
  estimateBase64Bytes,
  estimateImageTokens,
  isSupportedMime,
  parseDataUrl,
  toGeminiInlineParts,
  toMuseImageParts,
} from './image-attachments.ts';

// 1x1 PNG stub — no real blobs in fixtures.
const STUB_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const validAttachment = (overrides = {}) => ({
  id: 'img-1',
  name: 'screenshot.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  width: 800,
  height: 600,
  dataUrl: STUB_PNG,
  createdAt: 123,
  ...overrides,
});

test('chatImagesSchema accepts a valid attachment list', () => {
  const parsed = chatImagesSchema.safeParse([validAttachment()]);
  assert.ok(parsed.success);
});

test('chatImagesSchema rejects more than 4 images', () => {
  const imgs = Array.from({ length: MAX_IMAGES_PER_MESSAGE + 1 }, (_, i) =>
    validAttachment({ id: `img-${i}` })
  );
  const parsed = chatImagesSchema.safeParse(imgs);
  assert.ok(!parsed.success);
});

test('chatImagesSchema rejects a single image over 5MB', () => {
  const parsed = chatImagesSchema.safeParse([
    validAttachment({ sizeBytes: MAX_IMAGE_BYTES + 1 }),
  ]);
  assert.ok(!parsed.success);
});

test('chatImagesSchema rejects a total payload over 7MB', () => {
  const imgs = Array.from({ length: 4 }, (_, i) =>
    validAttachment({ id: `img-${i}`, sizeBytes: Math.ceil(MAX_TOTAL_BYTES / 4) + 1 })
  );
  const parsed = chatImagesSchema.safeParse(imgs);
  assert.ok(!parsed.success);
});

test('chatImagesSchema rejects unsupported mime types', () => {
  const parsed = chatImagesSchema.safeParse([
    validAttachment({
      mimeType: 'image/svg+xml',
      dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    }),
  ]);
  assert.ok(!parsed.success);
});

test('chatImagesSchema rejects malformed data URLs', () => {
  const parsed = chatImagesSchema.safeParse([
    validAttachment({ dataUrl: 'https://example.com/evil.png' }),
  ]);
  assert.ok(!parsed.success);
});

test('compileImagesInputSchema requires a non-empty prompt', () => {
  assert.ok(!compileImagesInputSchema.safeParse({ promptText: '  ', images: [] }).success);
  const parsed = compileImagesInputSchema.safeParse({ promptText: 'fix it', images: [] });
  assert.ok(parsed.success);
});

test('isSupportedMime guards the union', () => {
  assert.ok(isSupportedMime('image/webp'));
  assert.ok(!isSupportedMime('image/svg+xml'));
  assert.ok(!isSupportedMime(undefined));
});

test('parseDataUrl splits mime and base64, null on garbage', () => {
  const parsed = parseDataUrl(STUB_PNG);
  assert.ok(parsed);
  assert.equal(parsed.mimeType, 'image/png');
  assert.ok(parsed.base64.length > 0);
  assert.equal(parseDataUrl('not-a-data-url'), null);
  assert.equal(parseDataUrl('data:image/png;base64,'), null);
});

test('estimateBase64Bytes decodes padding math', () => {
  assert.equal(estimateBase64Bytes('TQ=='), 1);
  assert.equal(estimateBase64Bytes('TWE='), 2);
  assert.equal(estimateBase64Bytes('TWFu'), 3);
  assert.equal(estimateBase64Bytes(''), 0);
});

test('estimateImageTokens is deterministic and sane', () => {
  const a = estimateImageTokens({ width: 1600, height: 1200 });
  const b = estimateImageTokens({ width: 1600, height: 1200 });
  assert.equal(a, b);
  assert.equal(a, Math.ceil((1600 * 1200) / 750));
  // A 1MB screenshot must NOT approach byte/4 territory (~250k).
  const fallback = estimateImageTokens({ base64Chars: 1400000 });
  assert.ok(fallback < 5000);
});

test('toGeminiInlineParts strips the data prefix and skips invalid', () => {
  const parts = toGeminiInlineParts([
    { mimeType: 'image/png', dataUrl: STUB_PNG },
    { mimeType: 'image/png', dataUrl: 'garbage' },
  ]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].inlineData.mimeType, 'image/png');
  assert.ok(!parts[0].inlineData.data.includes('data:'));
});

test('toMuseImageParts returns neutral mime+base64 payloads', () => {
  const parts = toMuseImageParts([{ mimeType: 'image/png', dataUrl: STUB_PNG }]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].mimeType, 'image/png');
  assert.ok(parts[0].data.length > 0);
});

test('computeTargetSize caps the long edge preserving aspect', () => {
  assert.deepEqual(computeTargetSize(3200, 2000), { width: 1600, height: 1000 });
  assert.deepEqual(computeTargetSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(computeTargetSize(0, 0), { width: 1600, height: 1600 });
  assert.deepEqual(computeTargetSize(100, 4000), { width: 40, height: 1600 });
});
