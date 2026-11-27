import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const keys = [
  'visitpedemontana',
  'google-calendar',
  'instagram-story',
  'instagram-scan',
  'crop-learning-cleanup',
  'personal-telegram-cleanup',
  'event-creation',
];

function launcher(fetchImpl) {
  const states = [];
  let hook = 0;
  let mounted = false;
  const calls = [];
  const source = readFileSync(new URL('../app/cron/CronScheduleSettings.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const context = {
    exports: {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
    require(name) {
      if (name === 'react') return {
        useState(initial) {
          const index = hook++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (next) => {
            states[index] = typeof next === 'function' ? next(states[index]) : next;
          }];
        },
        useEffect(effect) {
          if (!mounted) effect();
        },
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('/cron-jobs')) {
        const jobs = { exports: {} };
        const source = readFileSync(new URL('../lib/cron-jobs.ts', import.meta.url), 'utf8');
        vm.runInNewContext(ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText, jobs);
        return jobs.exports;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  const Component = context.exports.default;
  function render() {
    hook = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(Component());
    mounted = true;
    return {
      nodes,
      button: nodes.find((node) => node.type === 'button' && node.props.children !== 'Riprova'),
      checkboxes: nodes.filter((node) => node.type === 'input'),
      fieldset: nodes.find((node) => node.type === 'fieldset'),
    };
  }
  return { calls, render };
}

const allEnabled = () => Response.json({ jobs: keys.map((key) => ({ key, enabled: true })) });

test('schedule settings load all jobs enabled and persist an empty selection', async () => {
  const ui = launcher(async (_url, init) => init?.method === 'PUT'
    ? Response.json({ jobs: keys.map((key) => ({ key, enabled: false })) })
    : allEnabled());
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  const loaded = ui.render();
  assert.equal(loaded.checkboxes.length, keys.length);
  assert.ok(loaded.checkboxes.every((checkbox) => checkbox.props.checked));

  loaded.checkboxes.forEach((checkbox) => checkbox.props.onChange({ target: { checked: false } }));
  const ready = ui.render();
  assert.equal(ready.button.props.disabled, false);
  ready.button.props.onClick();
  const saving = ui.render();
  assert.equal(saving.fieldset.props.disabled, true);
  await new Promise((resolve) => setImmediate(resolve));

  const saved = ui.render();
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[0].url, '/api/admin/cron-settings');
  assert.equal(ui.calls[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(ui.calls[1].init.body), { jobs: [] });
  assert.ok(saved.nodes.some((node) => node.type === 'p'
    && JSON.stringify(node.props.children).includes('Impostazioni salvate')));
});

test('schedule settings show save errors without showing a success message', async () => {
  const ui = launcher(async (_url, init) => init?.method === 'PUT'
    ? Response.json({ error: 'Impossibile salvare' }, { status: 503 })
    : allEnabled());
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  ui.render().button.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));

  const failed = ui.render();
  const messages = failed.nodes
    .filter((node) => node.type === 'p')
    .map((node) => JSON.stringify(node.props.children)).join(' ');
  assert.match(messages, /Impossibile salvare/);
  assert.doesNotMatch(messages, /Impostazioni salvate/);
  assert.equal(failed.button.props.disabled, false);
});

test('a failed initial load blocks saving and permits retrying without overwriting settings', async () => {
  let attempts = 0;
  const ui = launcher(async () => ++attempts === 1
    ? Response.json({ error: 'Impostazioni non disponibili' }, { status: 503 })
    : allEnabled());
  ui.render();
  await new Promise((resolve) => setImmediate(resolve));
  const failed = ui.render();
  assert.equal(failed.button.props.disabled, true);
  assert.equal(failed.checkboxes.length, 0);
  assert.ok(failed.nodes.some((node) => node.type === 'p'
    && node.props.children === 'Impostazioni non disponibili'));
  failed.nodes.find((node) => node.type === 'button' && node.props.children === 'Riprova').props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  const recovered = ui.render();
  assert.equal(recovered.button.props.disabled, false);
  assert.equal(recovered.checkboxes.length, keys.length);
  assert.ok(ui.calls.every(({ init }) => init.method !== 'PUT'));
});
