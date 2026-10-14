import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSiteFeedbackAttachment, validateSiteFeedbackText } from './site-feedback.ts';

test('requires bounded title and message text', () => {
  assert.equal(validateSiteFeedbackText('Bug mappa', 'La mappa non si carica.'), null);
  assert.match(validateSiteFeedbackText('', 'Messaggio'), /titolo/i);
  assert.match(validateSiteFeedbackText('Titolo', ' '), /messaggio/i);
  assert.match(validateSiteFeedbackText('x'.repeat(121), 'Messaggio'), /lungo/i);
});

test('accepts only supported attachment signatures', () => {
  assert.equal(validateSiteFeedbackAttachment('application/pdf', new TextEncoder().encode('%PDF-1.7')), true);
  assert.equal(validateSiteFeedbackAttachment('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff])), true);
  assert.equal(validateSiteFeedbackAttachment('image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(validateSiteFeedbackAttachment('application/pdf', new TextEncoder().encode('not a pdf')), false);
  assert.equal(validateSiteFeedbackAttachment('text/html', new TextEncoder().encode('<script>')), false);
});