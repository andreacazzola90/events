import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function loadSettings(env = { NEXTAUTH_SECRET_KEY: 'test-secret' }) {
  const source = readFileSync(new URL('./instagram-story-settings.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, Buffer, process: { env }, require };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const validPayload = {
  igUserId: '17841400000000000',
  graphApiVersion: 'v22.0',
  autoPublish: true,
  publishDays: [5, 3, 3],
  accessToken: '  EAAG-long-lived-token-abcdef  ',
};

test('settings payload is validated, normalized and keeps the token optional', () => {
  const { parseInstagramSettingsPayload } = loadSettings();

  const parsed = parseInstagramSettingsPayload(validPayload);
  assert.deepEqual([...parsed.publishDays], [3, 5]);
  assert.equal(parsed.accessToken, 'EAAG-long-lived-token-abcdef');

  const keepToken = parseInstagramSettingsPayload({ ...validPayload, accessToken: undefined });
  assert.equal(keepToken.accessToken, undefined);
  const removeToken = parseInstagramSettingsPayload({ ...validPayload, accessToken: null });
  assert.equal(removeToken.accessToken, null);
  assert.equal(parseInstagramSettingsPayload({ ...validPayload, igUserId: '' }).igUserId, null);

  for (const invalid of [
    { igUserId: 'not-a-number' },
    { publishDays: [7] },
    { publishDays: 'mercoledì' },
    { autoPublish: 'yes' },
    { graphApiVersion: '22' },
    { accessToken: 'short' },
    { accessToken: 'token with spaces inside it' },
  ]) {
    assert.equal(parseInstagramSettingsPayload({ ...validPayload, ...invalid }), null, JSON.stringify(invalid));
  }
});

test('access tokens are encrypted at rest and only readable with the same key', () => {
  const settings = loadSettings();
  const encrypted = settings.encryptInstagramToken('EAAG-secret');

  assert.ok(!encrypted.includes('EAAG-secret'));
  assert.equal(settings.decryptInstagramToken(encrypted), 'EAAG-secret');

  const otherKey = loadSettings({ NEXTAUTH_SECRET_KEY: 'other-secret' });
  assert.throws(() => otherKey.decryptInstagramToken(encrypted));
  assert.throws(() => loadSettings({}).encryptInstagramToken('x'), /instagram_token_key_not_configured/);
});

test('scheduled slots follow the Europe/Rome calendar and run once per day', () => {
  const { getDueStorySlot } = loadSettings();
  const wednesday = { publishDays: [3] };

  // The daily cron runs at 18:00 UTC: Wednesday in Rome in both CET and CEST.
  assert.equal(getDueStorySlot(new Date('2026-11-04T18:00:00Z'), wednesday, null), '2026-11-04');
  assert.equal(getDueStorySlot(new Date('2026-07-01T18:00:00Z'), wednesday, null), '2026-07-01');
  // A repeated invocation on the same day does not run again.
  assert.equal(getDueStorySlot(new Date('2026-11-04T18:40:00Z'), wednesday, '2026-11-04'), null);
  // Thursday is not a publish day.
  assert.equal(getDueStorySlot(new Date('2026-11-05T18:00:00Z'), wednesday, '2026-11-04'), null);
  // 23:30 UTC on Wednesday is already Thursday in Rome.
  assert.equal(getDueStorySlot(new Date('2026-11-04T23:30:00Z'), wednesday, null), null);
});
