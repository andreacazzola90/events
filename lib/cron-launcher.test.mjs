import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function launcher(fetchImpl) {
  const states = [];
  let hook = 0;
  const calls = [];
  function load(path) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const context = {
      exports: {}, Error,
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
        };
        if (name === 'react/jsx-runtime') return require(name);
        if (name.endsWith('/cron-jobs')) return load('./cron-jobs.ts');
        throw new Error(`Unexpected dependency: ${name}`);
      },
    };
    vm.runInNewContext(compiled, context);
    return context.exports;
  }
  const Component = load('../app/cron/CronJobLauncher.tsx').default;
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
    return {
      nodes,
      button: nodes.find((node) => node.type === 'button'),
      checkboxes: nodes.filter((node) => node.type === 'input'),
      fieldset: nodes.find((node) => node.type === 'fieldset'),
    };
  }
  return { calls, render };
}

test('one checkbox per cron, nothing preselected, and empty selection disables manual launch', () => {
  const view = launcher().render();
  assert.equal(view.checkboxes.length, 5);
  assert.ok(view.checkboxes.every((node) => node.props.type === 'checkbox' && !node.props.checked));
  assert.equal(view.button.props.disabled, true);
});

test('toggling checkboxes submits only the chosen jobs and blocks another launch while pending', async () => {
  let finish;
  const ui = launcher(() => new Promise((resolve) => { finish = resolve; }));
  ui.render().checkboxes[0].props.onChange({ target: { checked: true } });
  ui.render().checkboxes[2].props.onChange({ target: { checked: true } });
  ui.render().checkboxes[0].props.onChange({ target: { checked: false } });
  assert.equal(ui.render().button.props.disabled, false);
  ui.render().button.props.onClick();
  const running = ui.render();
  assert.equal(running.fieldset.props.disabled, true);
  assert.equal(running.button.props.disabled, true);
  running.button.props.onClick();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].url, '/api/admin/run-cron');
  assert.equal(ui.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(ui.calls[0].init.body), { jobs: ['instagram-story'] });
  finish(Response.json({ status: 'success', jobs: [{ key: 'instagram-story', ok: true, data: { status: 'skipped' } }] }));
  await new Promise((resolve) => setImmediate(resolve));
  const done = ui.render();
  assert.equal(done.button.props.disabled, false);
  assert.equal(done.fieldset.props.disabled, false);
  assert.ok(done.nodes.some((node) => node.type === 'p' && JSON.stringify(node.props.children).includes('Saltato')));
});

test('a failed job is visible alongside completed jobs and permits a retry', async () => {
  const ui = launcher(async () => Response.json({
    status: 'partial-error',
    jobs: [{ key: 'google-calendar', ok: false, error: 'Timed out' }, { key: 'instagram-scan', ok: true }],
  }));
  ui.render().checkboxes[1].props.onChange({ target: { checked: true } });
  ui.render().checkboxes[3].props.onChange({ target: { checked: true } });
  ui.render().button.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  const done = ui.render();
  const paragraphs = done.nodes.filter((node) => node.type === 'p').map((node) => JSON.stringify(node.props.children)).join(' ');
  assert.match(paragraphs, /Fallito/);
  assert.match(paragraphs, /Timed out/);
  assert.match(paragraphs, /Completato/);
  assert.match(paragraphs, /Alcuni cron/);
  assert.equal(done.button.props.disabled, false);
});

test('HTTP and network failures are displayed and release the controls', async () => {
  for (const fetchImpl of [
    async () => Response.json({ error: 'Sessione scaduta' }, { status: 401 }),
    async () => { throw new Error('Network down'); },
  ]) {
    const ui = launcher(fetchImpl);
    ui.render().checkboxes[0].props.onChange({ target: { checked: true } });
    ui.render().button.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    const done = ui.render();
    assert.equal(done.button.props.disabled, false);
    assert.ok(done.nodes.some((node) => node.type === 'p' && /Sessione scaduta|Network down/.test(String(node.props.children))));
  }
});
