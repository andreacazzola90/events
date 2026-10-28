import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { jsx } from 'react/jsx-runtime';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { getBuildInfo } from './build-info.ts';

test('each commit changes the displayed version without modifying the release number', () => {
  assert.equal(getBuildInfo('0.3.4', 'abcdef1234567890').version, '0.3.4+abcdef1');
  assert.equal(getBuildInfo('0.3.4', '1234567890abcdef').version, '0.3.4+1234567');
  assert.equal(getBuildInfo('0.3.4', 'ABCDEF1234567890').commit, 'abcdef1234567890');
});

test('missing or malformed metadata never invents a deploy timestamp or commit', () => {
  for (const [commit, timestamp] of [['', ''], ['not-a-sha', 'not-a-date'], ['<script>', '2026-10-28']]) {
    const info = getBuildInfo('0.3.4', commit, timestamp);
    assert.equal(info.version, '0.3.4');
    assert.equal(info.commit, undefined);
    assert.equal(info.builtAt, undefined);
    assert.equal(info.builtAtLabel, undefined);
  }
});

test('build timestamp is immutable and formatted in Rome across daylight saving', () => {
  const winter = getBuildInfo('0.3.4', 'abcdef1', '2026-12-01T12:34:56Z');
  const summer = getBuildInfo('0.3.4', 'abcdef1', '2026-07-01T12:34:56Z');
  assert.equal(winter.builtAt, '2026-12-01T12:34:56.000Z');
  assert.match(winter.builtAtLabel, /01\/12\/2026.*13:34:56/);
  assert.match(summer.builtAtLabel, /01\/07\/2026.*14:34:56/);
  assert.deepEqual(winter, getBuildInfo('0.3.4', 'abcdef1', '2026-12-01T12:34:56Z'));
});

const phases = {
  PHASE_PRODUCTION_BUILD: 'phase-production-build',
  PHASE_DEVELOPMENT_SERVER: 'phase-development-server',
  PHASE_PRODUCTION_SERVER: 'phase-production-server',
};
const configSource = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const compilerOptions = {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
};
const compiledConfig = ts.transpileModule(configSource, { compilerOptions }).outputText;

function loadConfig(env = {}, gitResult = '1234567890abcdef\n') {
  const gitCalls = [];
  let dateCalls = 0;
  let sentryOptions;
  class BuildDate extends Date {
    constructor(...args) {
      assert.equal(args.length, 0);
      super('2026-10-28T12:34:56.000Z');
      dateCalls += 1;
    }
  }
  const context = {
    exports: {},
    Date: BuildDate,
    URL,
    process: { env, cwd: () => '/test/project' },
    require: name => {
      if (name === '@sentry/nextjs') return {
        withSentryConfig: (config, options) => {
          sentryOptions = options;
          return config;
        },
      };
      if (name === 'next/constants') return phases;
      if (name === './package.json') return { version: '0.3.4' };
      if (name === 'node:child_process') return {
        execFileSync: (...args) => {
          gitCalls.push(args);
          if (gitResult instanceof Error) throw gitResult;
          return gitResult;
        },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(compiledConfig, context);
  return {
    config: context.exports.default,
    gitCalls,
    get dateCalls() { return dateCalls; },
    sentryOptions,
  };
}

test('production build prefers valid Vercel SHA and generates its timestamp only once', () => {
  const loaded = loadConfig({
    VERCEL_GIT_COMMIT_SHA: 'ABCDEF1234567890',
    NEXT_PUBLIC_APP_VERSION: 'stale', NEXT_PUBLIC_APP_BUILT_AT: 'stale',
  });
  const first = loaded.config(phases.PHASE_PRODUCTION_BUILD);
  const second = loaded.config(phases.PHASE_PRODUCTION_BUILD);
  assert.equal(first.env.NEXT_PUBLIC_APP_VERSION, '0.3.4');
  assert.equal(first.env.NEXT_PUBLIC_APP_COMMIT_SHA, 'abcdef1234567890');
  assert.equal(first.env.NEXT_PUBLIC_APP_BUILT_AT, '2026-10-28T12:34:56.000Z');
  assert.deepEqual(second.env, first.env);
  assert.equal(loaded.dateCalls, 1);
  assert.equal(loaded.gitCalls.length, 0);
});

test('invalid or absent Vercel SHA falls back to bounded git execution without a shell', () => {
  for (const providerSha of ['', 'invalid-sha', 'abcdef1;echo bad']) {
    const loaded = loadConfig({ VERCEL_GIT_COMMIT_SHA: providerSha });
    const config = loaded.config(phases.PHASE_PRODUCTION_BUILD);
    assert.equal(config.env.NEXT_PUBLIC_APP_COMMIT_SHA, '1234567890abcdef');
    const [command, args, options] = loaded.gitCalls[0];
    assert.equal(command, 'git');
    assert.deepEqual(Array.from(args), ['rev-parse', 'HEAD']);
    assert.equal(options.cwd, '/test/project');
    assert.equal(options.encoding, 'utf8');
    assert.ok(options.timeout > 0 && options.timeout <= 1000);
    assert.equal(options.shell, undefined);
  }
});

test('missing git or malformed git output does not block the build or expose an invalid SHA', () => {
  for (const gitResult of [new Error('spawn git ENOENT'), 'not-a-commit\n']) {
    const loaded = loadConfig({}, gitResult);
    const config = loaded.config(phases.PHASE_PRODUCTION_BUILD);
    assert.equal(config.env.NEXT_PUBLIC_APP_COMMIT_SHA, '');
    assert.equal(config.env.NEXT_PUBLIC_APP_VERSION, '0.3.4');
    assert.equal(config.env.NEXT_PUBLIC_APP_BUILT_AT, '2026-10-28T12:34:56.000Z');
  }
});

test('development shows version and commit but no timestamp even with stale public env', () => {
  const loaded = loadConfig({
    NODE_ENV: 'development', NEXT_PUBLIC_APP_BUILT_AT: '2026-01-01T00:00:00Z',
  });
  const config = loaded.config(phases.PHASE_DEVELOPMENT_SERVER);
  assert.equal(config.env.NEXT_PUBLIC_APP_VERSION, '0.3.4');
  assert.equal(config.env.NEXT_PUBLIC_APP_COMMIT_SHA, '1234567890abcdef');
  assert.equal(config.env.NEXT_PUBLIC_APP_BUILT_AT, '');
  assert.equal(loaded.dateCalls, 0);
});

test('production runtime does not regenerate or reinject metadata over compiled build literals', () => {
  const build = loadConfig({ NODE_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });
  const inlineEnv = build.config(phases.PHASE_PRODUCTION_BUILD).env;
  const runtime = loadConfig({ NODE_ENV: 'production' }, new Error('git unavailable at runtime'));
  assert.equal(runtime.config(phases.PHASE_PRODUCTION_SERVER).env, undefined);
  assert.equal(runtime.dateCalls, 0);
  assert.equal(runtime.gitCalls.length, 0);

  const helperSource = readFileSync(new URL('./build-info.ts', import.meta.url), 'utf8');
  const inlinedSource = helperSource.replace(
    /process\.env\.(NEXT_PUBLIC_APP_[A-Z_]+)/g,
    (expression, key) => JSON.stringify(inlineEnv[key]),
  );
  const compiledHelper = ts.transpileModule(inlinedSource, { compilerOptions }).outputText;
  const evaluateHelper = () => {
    const context = { exports: {}, process: { env: { NODE_ENV: 'production' } } };
    vm.runInNewContext(compiledHelper, context);
    return context.exports.appBuildInfo;
  };
  const first = evaluateHelper();
  const afterRestart = evaluateHelper();
  assert.equal(first.version, '0.3.4+abcdef1');
  assert.equal(first.builtAt, '2026-10-28T12:34:56.000Z');
  assert.equal(afterRestart.version, first.version);
  assert.equal(afterRestart.builtAt, first.builtAt);
  assert.equal(afterRestart.builtAtLabel, first.builtAtLabel);
});

test('all phases preserve existing config, image hosts, headers and the Sentry wrapper', async () => {
  const loaded = loadConfig({ VERCEL: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' });
  const baseline = ts.transpileModule(configSource.slice(0, configSource.indexOf('function getCommitSha()'))
    + '\nexports.baseline = nextConfig;', { compilerOptions }).outputText;
  const context = {
    exports: {}, URL,
    process: { env: { VERCEL: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co' } },
    require: () => ({}),
  };
  vm.runInNewContext(baseline, context);
  for (const phase of Object.values(phases)) {
    const config = loaded.config(phase);
    const { env, ...existing } = config;
    assert.deepEqual(JSON.parse(JSON.stringify(existing)), JSON.parse(JSON.stringify(context.exports.baseline)));
    assert.deepEqual(JSON.parse(JSON.stringify(await config.headers())), JSON.parse(JSON.stringify(await context.exports.baseline.headers())));
    assert.equal(config.output, 'standalone');
    assert.ok(config.images.remotePatterns.some(pattern => pattern.hostname === 'test.supabase.co'));
    assert.equal(config.images.remotePatterns.length, 6);
    assert.equal(config.serverExternalPackages.length, 7);
    assert.equal(config.compress, true);
    assert.deepEqual(Array.from(config.allowedDevOrigins), ['127.0.0.1']);
    assert.ok(config.turbopack);
    assert.equal(Boolean(env), phase !== phases.PHASE_PRODUCTION_SERVER);
  }
  assert.equal(loaded.sentryOptions.silent, true);
  assert.equal(loadConfig().config(phases.PHASE_DEVELOPMENT_SERVER).output, undefined);
});

function renderBuildViews(info, nodeEnv) {
  const renderComponent = (path, props = {}) => {
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { ...compilerOptions, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const context = {
      exports: {}, process: { env: { NODE_ENV: nodeEnv } },
      require: name => {
        if (name === 'react/jsx-runtime') return jsxRuntime;
        if (name.endsWith('/build-info')) return { appBuildInfo: info };
        if (name.endsWith('/seo-metadata')) return {
          publicPageMetadata: ({ title, description }) => ({ title, description }),
        };
        if (name.endsWith('/release-notes')) return { releaseNotes: [
          { version: '0.3.4', date: '28/10/2026', title: 'Release', groups: [] },
        ] };
        if (name.endsWith('/TransitionLink')) return {
          TransitionLink: props => jsx('a', props),
        };
        if (name === 'next-auth/react') return { useSession: () => ({ data: null }) };
        throw new Error(`Unexpected import ${name}`);
      },
    };
    vm.runInNewContext(compiled, context);
    return renderToStaticMarkup(jsx(context.exports.default, props));
  };
  return {
    footer: renderComponent('../app/components/Footer.tsx', info),
    page: renderComponent('../app/versioni/page.tsx'),
  };
}

test('footer and version page render matching semantic production build timestamps', () => {
  const info = getBuildInfo('0.3.4', 'abcdef1234567890', '2026-10-28T12:34:56Z');
  const { footer, page } = renderBuildViews(info, 'production');
  for (const html of [footer, page]) {
    assert.ok(html.includes('0.3.4+abcdef1'));
    assert.ok(html.includes(`Build del deploy: <time dateTime="${info.builtAt}">${info.builtAtLabel}</time>`));
  }
  assert.match(page, /<h2[^>]*>v0\.3\.4<\/h2>/);
});

test('unknown production metadata renders an explicit fallback without a time element', () => {
  const { footer, page } = renderBuildViews(getBuildInfo('0.3.4'), 'production');
  for (const html of [footer, page]) {
    assert.ok(html.includes('Data build non disponibile'));
    assert.equal(html.includes('<time'), false);
    assert.equal(html.includes('Sviluppo locale'), false);
  }
});