import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitPdfPromptText, MAX_PDF_PROMPT_TEXT_LENGTH } from './pdf-text.ts';

test('keeps short PDF text intact', () => {
  assert.deepEqual(limitPdfPromptText('  Testo breve  '), { text: 'Testo breve', truncated: false });
});

test('bounds long PDF text and reports truncation', () => {
  const result = limitPdfPromptText('x'.repeat(MAX_PDF_PROMPT_TEXT_LENGTH + 100));
  assert.equal(result.text.length, MAX_PDF_PROMPT_TEXT_LENGTH);
  assert.equal(result.truncated, true);
});