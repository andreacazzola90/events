import { MessagingError } from '../../../lib/personal-messaging.ts';
import type { MessagingCommand, Platform } from '../../../lib/personal-messaging.ts';

export type Source = {
  id: string; title: string; kind: 'broadcast' | 'newsletter' | 'group'; reference?: string;
  active?: boolean; consentedAt?: string; verifiedAt?: string; revision?: number;
  groupType?: 'basic' | 'supergroup'; accessHash?: string; baselineMessageId?: number; cursorMessageId?: number; pendingCursorMessageId?: number;
};
export type SourceList = Source[] & { truncated?: boolean };
export type Update = { status?: 'code' | 'password' | 'qr' | 'connected' | 'disconnected' | 'restoring'; session?: string; qr?: string };
export type PersonalMessage = { id: number; text: string; photo?: string };
export interface Adapter {
  start(phone?: string): Promise<void>;
  submit(kind: 'code' | 'password', value: string): Promise<void>;
  restore(session: string): Promise<void>;
  status?(): Promise<void>;
  list(): Promise<SourceList>;
  verify(source: string): Promise<Source>;
  poll?(source: Source, after: number, limit: number): Promise<{ cursor: number; messages: PersonalMessage[]; discarded: number; readCount: number }>;
  close(remote: boolean): Promise<boolean>;
}
export type Account = { owner: number; platform: Platform; revision: number; status: string; session?: string; sources: Source[]; expiresAt?: number; attempts: number; error?: string; remoteRemoved?: boolean };
export interface Store { read(owner: number, platform: Platform): Promise<Account | undefined>; write(account: Account): Promise<void> }
export type Factory = (platform: Platform, emit: (update: Update) => Promise<void>) => Adapter;
type Entry = { account: Account; pending?: Account; adapter?: Adapter; qr?: string; qrExpiresAt?: number; busy: boolean; starts: number[]; writes: Promise<void>; disconnecting?: Promise<ReturnType<MessagingEngine['snapshot']>>; retryAt?: number };
export async function bounded<T>(promise: Promise<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new MessagingError('worker_unavailable', 503)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export class MessagingEngine {
  store: Store;
  factory: Factory;
  entries = new Map<string, Entry>();
  loading = new Map<string, Promise<Entry>>();
  scanning = new Set<string>();
  now: () => number;
  constructor(store: Store, factory: Factory, now = Date.now) { this.store = store; this.factory = factory; this.now = now; }
  async entry(owner: number, platform: Platform): Promise<Entry> {
    const key = `${owner}:${platform}`;
    const existing = this.entries.get(key);
    if (existing) return existing;
    const loading = this.loading.get(key);
    if (loading) return loading;
    if (this.entries.size >= 1000) throw new MessagingError('rate_limited', 429);
    const task = (async () => {
      const saved = await this.store.read(owner, platform);
      const account: Account = saved || { owner, platform, revision: 0, status: 'disconnected', sources: [], attempts: 0 };
      if (account.owner !== owner || account.platform !== platform) throw new MessagingError('session_corrupt', 503);
      account.revision++;
      if (account.remoteRemoved === false) { delete account.session; account.status = 'disconnected'; }
      if (account.status === 'connected') account.status = 'restoring';
      if (account.status !== 'restoring') { delete account.session; account.status = 'disconnected'; account.sources = account.sources.map(source => ({ ...source, active: false })); }
      const entry: Entry = { account, busy: false, starts: [], writes: Promise.resolve() };
      await this.store.write(account);
      this.entries.set(key, entry);
      return entry;
    })();
    this.loading.set(key, task);
    try { return await task; } finally { this.loading.delete(key); }
  }
  snapshot(entry: Entry) {
    const account = entry.account;
    return { platform: account.platform, status: account.status, error: account.error, revision: account.revision, expiresAt: account.expiresAt, remoteRemoved: account.remoteRemoved,
      qr: entry.qrExpiresAt && entry.qrExpiresAt > this.now() ? entry.qr : undefined, qrExpiresAt: entry.qrExpiresAt,
      listing: account.platform === 'whatsapp' ? 'unsupported' : 'joined-groups-and-administered-public',
      sources: account.sources.map(source => this.publicSource(source)) };
  }
  publicSource(source: Source) {
    const {
      accessHash: _accessHash, baselineMessageId: _baselineMessageId,
      cursorMessageId: _cursorMessageId, pendingCursorMessageId: _pendingCursorMessageId, ...visible
    } = source;
    return visible;
  }
  write(entry: Entry, account: Account, admit = () => {}) {
    const snapshot = structuredClone(account);
    const task = entry.writes.catch(() => {}).then(() => { admit(); return this.store.write(snapshot); });
    entry.writes = task;
    return task;
  }
  candidate(entry: Entry) { return structuredClone(entry.pending?.revision === entry.account.revision ? entry.pending : entry.account); }
  async publish(entry: Entry, candidate: Account, admit = () => {}) {
    entry.pending = structuredClone(candidate);
    await this.write(entry, candidate, () => {
      admit();
      if (candidate.revision !== entry.account.revision) throw new MessagingError('operation_cancelled', 409);
    });
    admit();
    if (candidate.revision !== entry.account.revision) throw new MessagingError('operation_cancelled', 409);
    entry.account = structuredClone(candidate);
    if (entry.pending === undefined || entry.pending.revision !== candidate.revision) return;
    if (JSON.stringify(entry.pending) === JSON.stringify(candidate)) entry.pending = undefined;
  }
  revoke(entry: Entry, status: string) {
    const previous = entry.adapter;
    entry.adapter = undefined;
    entry.qr = undefined;
    entry.qrExpiresAt = undefined;
    entry.pending = undefined;
    entry.account = { ...entry.account, revision: entry.account.revision + 1, status,
      sources: entry.account.sources.map(source => ({ ...source, active: false, revision: (source.revision || 0) + 1 })) };
    delete entry.account.session;
    delete entry.account.expiresAt;
    return previous;
  }
  async invalidate(entry: Entry, status: string) {
    const previous = this.revoke(entry, status);
    void previous?.close(false).catch(() => {});
    await this.write(entry, entry.account);
    return previous;
  }
  async offline(entry: Entry) {
    const previous = entry.adapter;
    entry.adapter = undefined; entry.pending = undefined; entry.qr = undefined; entry.qrExpiresAt = undefined;
    entry.account = { ...entry.account, revision: entry.account.revision + 1, status: 'restoring', error: 'provider_unavailable' };
    entry.retryAt = this.now() + 5000;
    void previous?.close(false).catch(() => {});
    await this.write(entry, entry.account);
  }
  disconnect(entry: Entry, platform: Platform) {
    if (entry.disconnecting) return entry.disconnecting;
    const saved = entry.account.session;
    const uncertain = { ...this.candidate(entry), remoteRemoved: false };
    const previous = entry.adapter;
    const wasUncertain = entry.account.remoteRemoved === false;
    const marker = this.write(entry, uncertain);
    this.revoke(entry, 'disconnected');
    entry.account.remoteRemoved = false;
    const revision = entry.account.revision;
    const erased = this.write(entry, entry.account);
    const cleanup = async () => {
      let remote = previous; let removed = false;
      try {
        if (!remote && saved) { remote = this.factory(platform, async () => {}); await bounded(remote.restore(saved), 5000); }
        removed = remote ? await bounded(remote.close(true), 4000) : !wasUncertain && !saved;
      } catch { removed = false; }
      finally { void remote?.close(false).catch(() => {}); }
      return removed;
    };
    const cleaned = cleanup();
    const task = (async () => {
      const results = await Promise.allSettled([marker, erased, cleaned]);
      if (results[0].status === 'rejected' || results[1].status === 'rejected') throw new MessagingError('provider_unavailable', 503);
      if (revision !== entry.account.revision) throw new MessagingError('operation_cancelled', 409);
      const candidate = this.candidate(entry); candidate.remoteRemoved = results[2].status === 'fulfilled' && results[2].value;
      await this.publish(entry, candidate);
      return this.snapshot(entry);
    })();
    entry.disconnecting = task;
    void task.finally(() => { if (entry.disconnecting === task) entry.disconnecting = undefined; }).catch(() => {});
    return task;
  }
  attach(entry: Entry): Adapter {
    const revision = entry.account.revision;
    const adapter = this.factory(entry.account.platform, async update => {
      if (entry.account.revision !== revision || entry.adapter !== adapter) return;
      if (entry.account.expiresAt && entry.account.expiresAt <= this.now()) return;
      if (update.status === 'disconnected') {
        entry.account.error = 'provider_unavailable';
        await this.invalidate(entry, 'disconnected');
        return;
      }
      if (update.status === 'restoring') { await this.offline(entry); return; }
      const candidate = this.candidate(entry);
      if (update.session !== undefined) candidate.session = update.session;
      if (update.status === 'connected') {
        if (!candidate.session) throw new MessagingError('not_connected');
        candidate.status = 'connected'; delete candidate.expiresAt; delete candidate.error;
      } else if (update.status) candidate.status = update.status;
      try { await this.publish(entry, candidate); }
      catch (error) {
        if (entry.account.revision === revision) { try { await this.invalidate(entry, 'disconnected'); } catch {} }
        throw error;
      }
      if (update.status === 'connected') { entry.qr = undefined; entry.qrExpiresAt = undefined; }
      if (update.qr) { entry.qr = update.qr; entry.qrExpiresAt = Math.min(this.now() + 45000, entry.account.expiresAt || this.now()); }
    });
    entry.adapter = adapter;
    return adapter;
  }
  async execute(owner: number, command: MessagingCommand, signal?: AbortSignal) {
    if (!Number.isSafeInteger(owner) || owner < 1) throw new MessagingError('invalid_payload');
    if (command.action === 'authorize' && command.consent !== true) throw new MessagingError('consent_required');
    const checkSignal = () => { if (signal?.aborted) throw new MessagingError('worker_unavailable', 503); };
    checkSignal();
    const entry = await this.entry(owner, command.platform); checkSignal();
    if (command.action === 'disconnect') return this.disconnect(entry, command.platform);
    if (entry.disconnecting) throw new MessagingError('operation_cancelled', 409);
    if (entry.account.expiresAt && entry.account.expiresAt <= this.now()) {
      entry.account.error = 'login_expired';
      await this.invalidate(entry, 'expired');
    }
    if (command.action === 'pause') {
      entry.account = structuredClone(entry.account); entry.pending = undefined;
      const source = entry.account.sources.find(source => source.id === command.source);
      if (!source) throw new MessagingError('source_unavailable');
      const previous = entry.adapter;
      entry.account.revision++; entry.adapter = undefined;
      void previous?.close(false).catch(() => {});
      source.active = false; source.revision = (source.revision || 0) + 1;
      await this.write(entry, entry.account); checkSignal();
      return this.snapshot(entry);
    }
    if (entry.busy) { if (command.action === 'status') return this.snapshot(entry); throw new MessagingError('rate_limited', 429); }
    entry.busy = true;
    let revision = entry.account.revision;
    let started = false; let cancelled = false;
    const cancel = () => {
      cancelled = true;
      if (revision !== entry.account.revision || command.action === 'sources') return;
      if (command.action === 'start' && !started) return;
      const task = ['start', 'code', 'password'].includes(command.action) ? this.invalidate(entry, 'disconnected') : this.offline(entry);
      void task.catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const ensureCurrent = () => { checkSignal(); if (revision !== entry.account.revision) throw new MessagingError('operation_cancelled', 409); };
    const wait = async <Value>(promise: Promise<Value>) => { const result = await bounded(promise); ensureCurrent(); return result; };
    try {
      if (command.action === 'start') {
        entry.starts = entry.starts.filter(time => time > this.now() - 600000);
        if (entry.starts.length >= 3) throw new MessagingError('rate_limited', 429);
        entry.starts.push(this.now());
        revision++;
        started = true;
        await this.invalidate(entry, 'connecting'); ensureCurrent();
        const candidate = this.candidate(entry);
        candidate.attempts = 0; delete candidate.error; delete candidate.remoteRemoved;
        candidate.expiresAt = this.now() + 300000;
        await this.publish(entry, candidate, ensureCurrent);
        ensureCurrent();
        await wait(this.attach(entry).start(command.phone));
        ensureCurrent();
      } else {
        if (command.action === 'status' && ['connected', 'restoring'].includes(entry.account.status) && !entry.adapter && entry.account.session && (!entry.retryAt || entry.retryAt <= this.now())) {
          const adapter = this.attach(entry);
          try { await wait(adapter.restore(entry.account.session)); }
          catch (error) { if (revision === entry.account.revision) await this.offline(entry); throw error; }
        }
        if (command.action === 'status' && entry.account.status === 'connected' && entry.adapter?.status) await wait(entry.adapter.status());
        if (command.action === 'code' || command.action === 'password') {
          if (entry.account.status !== command.action || !entry.adapter) throw new MessagingError('login_expired');
          if (++entry.account.attempts > 5) { await this.invalidate(entry, 'expired'); throw new MessagingError('rate_limited', 429); }
          await wait(entry.adapter.submit(command.action, command[command.action]!));
          ensureCurrent();
        }
        if (command.action === 'sources' || command.action === 'authorize') {
          if (entry.account.status !== 'connected' || !entry.adapter) throw new MessagingError('not_connected');
          if (command.action === 'sources') {
            const listed = await wait(entry.adapter.list());
            const availableSources = listed.filter(source => command.platform === 'telegram'
              ? ['broadcast', 'group'].includes(source.kind)
              : source.kind === 'newsletter').slice(0, 600);
            return {
              ...this.snapshot(entry), availableSources: availableSources.map(source => this.publicSource(source)),
              availableSourcesTruncated: Boolean(listed.truncated) || listed.length > 600,
            };
          }
          const verified = await wait(entry.adapter.verify(command.source!));
          if (!(command.platform === 'telegram'
            ? ['broadcast', 'group'].includes(verified.kind)
            : verified.kind === 'newsletter')) throw new MessagingError('source_unavailable');
          const candidate = this.candidate(entry);
          const existing = candidate.sources.find(source => source.id === verified.id);
          if (!existing && candidate.sources.length >= 50) throw new MessagingError('source_limit');
          const consentedAt = new Date(this.now()).toISOString();
          const source: Source = {
            id: verified.id.slice(0, 200), title: verified.title.slice(0, 200), kind: verified.kind,
            reference: verified.reference?.slice(0, 200), active: true, consentedAt, verifiedAt: consentedAt,
            revision: (existing?.revision || 0) + 1,
          };
          if (verified.kind === 'group' || verified.kind === 'newsletter') {
            if ((verified.kind === 'group' && !['basic', 'supergroup'].includes(verified.groupType || '')) ||
              !Number.isSafeInteger(verified.baselineMessageId) || verified.baselineMessageId! < 0 || verified.baselineMessageId! > 2147483647) {
              throw new MessagingError('source_unavailable');
            }
            source.groupType = verified.groupType;
            source.accessHash = verified.accessHash;
            source.baselineMessageId = verified.baselineMessageId || 0;
            source.cursorMessageId = source.baselineMessageId;
          }
          if (existing) { delete existing.pendingCursorMessageId; Object.assign(existing, source); } else candidate.sources.push(source);
          await this.publish(entry, candidate, ensureCurrent);
        }
      }
      ensureCurrent();
      return this.snapshot(entry);
    } catch (error) {
      if (revision === entry.account.revision && !cancelled && ((command.action === 'start' && started) || !(error instanceof MessagingError) || error.code === 'worker_unavailable')) {
        entry.account.error = error instanceof MessagingError ? error.code : 'provider_unavailable';
        try {
          if (['start', 'code', 'password'].includes(command.action)) await this.invalidate(entry, 'disconnected');
          else if (command.action !== 'sources') await this.offline(entry);
        } catch {}
      }
      if (error instanceof MessagingError) throw error;
      throw new MessagingError('provider_unavailable', 503);
    } finally { signal?.removeEventListener('abort', cancel); entry.busy = false; }
  }
  async expire() {
    for (const entry of this.entries.values()) if (entry.account.expiresAt && entry.account.expiresAt <= this.now()) {
      await this.invalidate(entry, 'expired');
    }
  }
  async scan(owner: number, sourceId: string, sourceRevision: number, options: { dryRun?: boolean; limit?: number; platform?: Platform } = {}) {
    const key = `${owner}:${options.platform ?? 'telegram'}`;
    if (this.scanning.has(key)) throw new MessagingError('rate_limited', 429);
    this.scanning.add(key);
    try { return await this.scanAccount(owner, sourceId, sourceRevision, options); }
    finally { this.scanning.delete(key); }
  }
  private async scanAccount(owner: number, sourceId: string, sourceRevision: number, options: { dryRun?: boolean; limit?: number; platform?: Platform }) {
    const platform = options.platform ?? 'telegram';
    const kind = platform === 'telegram' ? 'group' : 'newsletter';
    if (!['telegram', 'whatsapp'].includes(platform)) throw new MessagingError('invalid_payload');
    if (!Number.isSafeInteger(owner) || owner < 1 || typeof sourceId !== 'string' || sourceId.length > 200 ||
      !Number.isSafeInteger(sourceRevision) || sourceRevision < 1) throw new MessagingError('invalid_payload');
    const limit = Math.max(1, Math.min(30, Math.floor(options.limit || 20)));
    if (options.dryRun) {
      const live = this.entries.get(`${owner}:${platform}`);
      if (live?.busy || live?.disconnecting) throw new MessagingError('rate_limited', 429);
      if (live) live.busy = true;
      try {
      const saved = await this.store.read(owner, platform);
      if (!saved || saved.owner !== owner || saved.platform !== platform || !saved.session || !['connected', 'restoring'].includes(saved.status)) {
        return { sourceId, sourceRevision, cursor: 0, messages: [], dryRun: true, status: 'not_connected' };
      }
      const source = saved.sources.find(item => item.id === sourceId && item.kind === kind && item.active && item.consentedAt && item.revision === sourceRevision);
      if (!source) return { sourceId, sourceRevision, cursor: 0, messages: [], dryRun: true, status: 'source_unavailable' };
      const activeAdapter = live?.account.status === 'connected' ? live.adapter : undefined;
      const adapter = activeAdapter ?? this.factory(platform, async () => {});
      try {
        if (!activeAdapter) await bounded(adapter.restore(saved.session), 10000);
        if (!adapter.poll) throw new MessagingError('source_unavailable');
        const page = await bounded(adapter.poll(source, source.cursorMessageId || 0, limit), 30000);
        const current = await this.store.read(owner, platform);
        if (!current || current.revision !== saved.revision || !current.sources.some(item => item.id === sourceId && item.active && item.revision === sourceRevision)) throw new MessagingError('operation_cancelled', 409);
        return { sourceId, sourceRevision, ...page, dryRun: true, status: 'success' };
      } finally { if (!activeAdapter) await adapter.close(false).catch(() => {}); }
      } finally { if (live) live.busy = false; }
    }
    const entry = await this.entry(owner, platform);
    if (entry.account.status !== 'connected' || !entry.adapter) {
      await this.execute(owner, { action: 'status', platform });
    }
    const currentEntry = this.entries.get(`${owner}:${platform}`);
    if (!currentEntry || currentEntry.account.status !== 'connected' || !currentEntry.adapter?.poll) {
      return { sourceId, sourceRevision, cursor: 0, messages: [], dryRun: false, status: 'not_connected' };
    }
    if (currentEntry.busy) throw new MessagingError('rate_limited', 429);
    currentEntry.busy = true;
    try {
      const revision = currentEntry.account.revision;
      const source = currentEntry.account.sources.find(item =>
        item.id === sourceId && item.kind === kind && item.active && item.consentedAt && item.revision === sourceRevision);
      if (!source) return { sourceId, sourceRevision, cursor: 0, messages: [], dryRun: false, status: 'source_unavailable' };
      const page = await bounded(currentEntry.adapter.poll(source, source.cursorMessageId || 0, limit), 30000);
      const ensureCurrent = () => {
        if (currentEntry.account.revision !== revision || !currentEntry.account.sources.some(item =>
          item.id === sourceId && item.active && item.revision === sourceRevision)) {
          throw new MessagingError('operation_cancelled', 409);
        }
      };
      ensureCurrent();
      if (page.cursor > (source.cursorMessageId || 0)) {
        const candidate = this.candidate(currentEntry);
        const candidateSource = candidate.sources.find(item => item.id === sourceId)!;
        candidateSource.pendingCursorMessageId = Math.max(candidateSource.pendingCursorMessageId || 0, page.cursor);
        await this.publish(currentEntry, candidate, ensureCurrent);
      }
      return { sourceId, sourceRevision, ...page, dryRun: false, status: 'success' };
    } finally { currentEntry.busy = false; }
  }
  async acknowledge(owner: number, sourceId: string, sourceRevision: number, cursor: number, platform: Platform = 'telegram') {
    if (!['telegram', 'whatsapp'].includes(platform)) throw new MessagingError('invalid_payload');
    if (!Number.isSafeInteger(owner) || owner < 1 || typeof sourceId !== 'string' || sourceId.length > 200 ||
      !Number.isSafeInteger(sourceRevision) || sourceRevision < 1 ||
      !Number.isSafeInteger(cursor) || cursor < 0) throw new MessagingError('invalid_payload');
    const entry = await this.entry(owner, platform);
    if (entry.busy || entry.disconnecting) throw new MessagingError('rate_limited', 429);
    entry.busy = true;
    try {
      const candidate = structuredClone(entry.account);
      const revision = entry.account.revision;
      const source = candidate.sources.find(item =>
        item.id === sourceId && item.kind === (platform === 'telegram' ? 'group' : 'newsletter') && item.active && item.consentedAt && item.revision === sourceRevision);
      if (!source) throw new MessagingError('source_unavailable');
      if (cursor <= (source.cursorMessageId || 0)) return { status: 'acknowledged' };
      if (cursor !== (source.pendingCursorMessageId || 0)) throw new MessagingError('source_unavailable');
      source.cursorMessageId = cursor;
      delete source.pendingCursorMessageId;
      await this.publish(entry, candidate, () => {
        if (entry.account.revision !== revision) throw new MessagingError('operation_cancelled', 409);
      });
      return { status: 'acknowledged' };
    } finally { entry.busy = false; }
  }
}