import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const componentPath = '../app/cron/CronSourceRunStatus.tsx';

function loadComponent() {
  const source = readFileSync(new URL(componentPath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports.default;
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  return textContent(node.props?.children);
}

const source = { id: 42, name: 'Teatro Civico', isActive: true };

test('shows per-site scan status, timestamps, summary, errors, and link log details', () => {
  const Component = loadComponent();
  const tree = Component({
    source,
    aggregateRun: { status: 'completed', startedAt: '2026-11-06T08:55:00Z' },
    run: {
      jobKey: 'scrape-source:42',
      status: 'failed',
      startedAt: '2026-11-06T09:00:00Z',
      finishedAt: '2026-11-06T09:01:00Z',
      resultJson: JSON.stringify({
        status: 'partial-error',
        found: 4,
        new: 2,
        errors: [{ url: 'https://example.test/event', error: 'Timeout' }],
        links: [{ url: 'https://example.test/event', status: 'error', error: 'HTTP 503' }],
      }),
    },
  });
  const text = textContent(tree);

  assert.match(text, /Teatro Civico/);
  assert.match(text, /Fallita|parziale/i);
  assert.match(text, /Trovati\s*:\s*4/);
  assert.match(text, /Nuovi\s*:\s*2/);
  assert.match(text, /Timeout/);
  assert.match(text, /HTTP 503/);
  assert.match(text, /example\.test\/event/);
});

test('a newer running aggregate marks a site without a current run as waiting, not as previously completed', () => {
  const Component = loadComponent();
  const tree = Component({
    source,
    aggregateRun: { status: 'running', startedAt: '2026-11-06T10:00:00Z' },
    run: {
      jobKey: 'scrape-source:42',
      status: 'completed',
      startedAt: '2026-11-05T09:00:00Z',
      finishedAt: '2026-11-05T09:01:00Z',
      resultJson: JSON.stringify({ status: 'success', message: 'Old run log' }),
    },
  });
  const text = textContent(tree);

  assert.match(text, /In attesa|non ancora avviata/i);
  assert.doesNotMatch(text, /Old run log/);
});

test('shows quota deferrals, pending count and earliest resume time', () => {
  const Component = loadComponent();
  const text = textContent(Component({
    source,
    aggregateRun: null,
    run: {
      status: 'completed', startedAt: '2026-11-06T09:00:00Z', finishedAt: '2026-11-06T09:01:00Z',
      resultJson: JSON.stringify({
        status: 'partial', deferred: 10, rateLimitRetryAt: Date.parse('2026-11-06T09:02:00Z'),
        message: 'Quota Groq temporaneamente esaurita: link conservati per il prossimo cron utile.',
        links: [{ url: 'https://example.test/event', status: 'deferred', visited: true }],
      }),
    },
  }));
  assert.match(text, /Completata parzialmente/);
  assert.match(text, /Rinviati\s*:\s*10/);
  assert.match(text, /Quota Groq temporaneamente esaurita/);
  assert.match(text, /Ripresa non prima del/);
  assert.match(text, /deferred/);
});

test('reports never-started sites and malformed stored logs explicitly', () => {
  const Component = loadComponent();
  const neverStarted = textContent(Component({ source, run: null, aggregateRun: null }));
  const malformed = textContent(Component({
    source,
    aggregateRun: null,
    run: {
      jobKey: 'scrape-source:42',
      status: 'completed',
      startedAt: '2026-11-06T09:00:00Z',
      finishedAt: '2026-11-06T09:01:00Z',
      resultJson: '{bad json',
    },
  }));

  assert.match(neverStarted, /Mai avviata/);
  assert.match(malformed, /log.*non.*legg/i);
});
