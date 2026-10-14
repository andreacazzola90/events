import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicPdfAddress, validatePublicPdfUrl } from './pdf-url.ts';

test('allows public addresses and blocks private or reserved networks', () => {
  assert.equal(isPublicPdfAddress('8.8.8.8'), true);
  assert.equal(isPublicPdfAddress('2001:4860:4860::8888'), true);
  assert.equal(isPublicPdfAddress('127.0.0.1'), false);
  assert.equal(isPublicPdfAddress('10.12.0.5'), false);
  assert.equal(isPublicPdfAddress('::1'), false);
  assert.equal(isPublicPdfAddress('::ffff:192.168.1.2'), false);
});

test('rejects local PDF URLs before attempting a download', async () => {
  await assert.rejects(validatePublicPdfUrl('http://127.0.0.1/secret.pdf'), /server pubblico/);
  await assert.rejects(validatePublicPdfUrl('http://localhost/internal.pdf'), /server pubblico/);
  await assert.rejects(validatePublicPdfUrl('javascript:alert(1)'), /URL PDF pubblico valido/);
});