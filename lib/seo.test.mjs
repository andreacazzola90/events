import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SITE_URL, getSiteUrl, siteUrl } from './site-url.ts';

test('one configurable HTTPS origin is used, preserving the existing domain by default', () => {
  assert.equal(getSiteUrl(''), DEFAULT_SITE_URL);
  assert.equal(getSiteUrl('https://schiodejaneiro.vercel.app/'), 'https://schiodejaneiro.vercel.app');
  assert.equal(getSiteUrl(' https://example.com/events?utm_source=test#fragment '), 'https://example.com');
  for (const invalid of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com']) {
    assert.throws(() => getSiteUrl(invalid));
  }
});

test('public URLs preserve distinct paths and never accept an external destination', () => {
  const origin = getSiteUrl();
  assert.equal(siteUrl('/eventi'), `${origin}/eventi`);
  assert.equal(siteUrl('/events/concerto-123'), `${origin}/events/concerto-123`);
  for (const invalid of ['https://other.example', '//other.example', '/\\other.example']) {
    assert.throws(() => siteUrl(invalid));
  }
});