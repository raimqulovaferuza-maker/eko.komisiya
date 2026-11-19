import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataUrlImage, isValidImageUrlInput } from './uploads.js';

test('parseDataUrlImage accepts valid PNG data URL with PNG magic bytes', () => {
  // Minimal valid 1x1 PNG bytes
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const res = parseDataUrlImage(`data:image/png;base64,${pngBase64}`);
  assert.equal(res.valid, true);
  assert.equal(res.ext, 'png');
  assert.ok(res.buffer.length > 0);
});

test('parseDataUrlImage rejects spoofed non-PNG payload claiming image/png', () => {
  const fakeBase64 = Buffer.from('not really a png file at all').toString('base64');
  const res = parseDataUrlImage(`data:image/png;base64,${fakeBase64}`);
  assert.equal(res.valid, false);
});

test('parseDataUrlImage rejects unsupported MIME types like SVG or script', () => {
  const svgBase64 = Buffer.from('<svg></svg>').toString('base64');
  const res = parseDataUrlImage(`data:image/svg+xml;base64,${svgBase64}`);
  assert.equal(res.valid, false);
});

test('isValidImageUrlInput allows http/https and /uploads/ paths only', () => {
  assert.equal(isValidImageUrlInput('/uploads/school-1.png'), true);
  assert.equal(isValidImageUrlInput('https://example.com/photo.jpg'), true);
  assert.equal(isValidImageUrlInput('javascript:alert(1)'), false);
  assert.equal(isValidImageUrlInput(''), false);
});
