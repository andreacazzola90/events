import { TelegramClient, Api, Logger, password, helpers } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import makeWASocket, { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, SignalDataSet, SignalDataTypeMap, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { MessagingError } from '../../../lib/personal-messaging.ts';
import type { Adapter, Factory, Source, Update } from './engine.ts';
import { bounded } from './engine.ts';

export function assertProviderConfiguration(platform: 'telegram' | 'whatsapp', env = process.env) {
  if (platform === 'telegram' && (!Number.isSafeInteger(Number(env.PERSONAL_TELEGRAM_API_ID)) || Number(env.PERSONAL_TELEGRAM_API_ID) <= 0 || !/^[a-f0-9]{32}$/i.test(env.PERSONAL_TELEGRAM_API_HASH || ''))) throw new MessagingError('telegram_configuration_missing', 503);
}
export function providerError(error: unknown): MessagingError {
  const message = error && typeof error === 'object' && 'errorMessage' in error ? String(error.errorMessage) : '';
  if (message.includes('PHONE_CODE_EXPIRED')) return new MessagingError('code_expired');
  if (message.includes('PHONE_CODE_INVALID') || message.includes('PHONE_CODE_EMPTY')) return new MessagingError('code_invalid');
  if (message.includes('PASSWORD_HASH_INVALID')) return new MessagingError('password_invalid');
  if (message.includes('FLOOD') || message.includes('PHONE_NUMBER_FLOOD')) return new MessagingError('rate_limited', 429);
  return error instanceof MessagingError ? error : new MessagingError('provider_unavailable', 503);
}
export function metadataOnlyTelegram(client: TelegramClient) {
  client._updateLoop.stop(); client.updateManager.stop();
  client._updateLoop.start = () => {};
  client.updateManager.start = () => {};
  client.updateManager.receive = () => {};
  client.updateManager.onUpdates = () => {};
  client.updateManager.dispatch = () => {};
  client.updateManager.catchUp = async () => {};
  client.updateManager.ensureState = async () => {};
  client.updateManager.recoverIfStale = async () => {};
  client.updateManager.requestDifference = () => {};
  client.updateManager.watchChannel = async () => {};
  const invoke = client.invoke.bind(client);
  const allowed = new Set(['auth.SendCode', 'auth.ResendCode', 'auth.SignIn', 'account.GetPassword', 'auth.CheckPassword', 'auth.LogOut', 'users.GetUsers', 'contacts.ResolveUsername', 'channels.GetChannels', 'channels.GetParticipant', 'channels.GetAdminedPublicChannels', 'help.GetConfig']);
  client.invoke = (async (request: Parameters<TelegramClient['invoke']>[0], dcId?: number) => {
    if (!allowed.has(request.className)) throw new MessagingError('source_unavailable');
    return invoke(new Api.InvokeWithoutUpdates({ query: request }), dcId);
  }) as TelegramClient['invoke'];
}
function authorizationRevoked(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'errorMessage' in error ? String(error.errorMessage) : '';
  return ('code' in error && [401, 403].includes(Number(error.code))) || /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/.test(message);
}
export class TelegramAdapter implements Adapter {
  client: TelegramClient;
  session: StringSession;
  emit: (update: Update) => Promise<void>;
  phone = '';
  hash = '';
  stopped = false;
  apiId: number;
  apiHash: string;
  constructor(emit: (update: Update) => Promise<void>, client?: TelegramClient) {
    if (!client) assertProviderConfiguration('telegram');
    this.apiId = client ? 1 : Number(process.env.PERSONAL_TELEGRAM_API_ID);
    this.apiHash = client ? '' : process.env.PERSONAL_TELEGRAM_API_HASH || '';
    this.session = new StringSession('');
    const logger = new Logger(); logger.setLevel('none' as Parameters<Logger['setLevel']>[0]); logger.handler = () => {};
    this.client = client || new TelegramClient(this.session, this.apiId, this.apiHash, { baseLogger: logger, connectionRetries: 1, requestRetries: 0, autoReconnect: false, catchUp: false, floodSleepThreshold: 0 });
    metadataOnlyTelegram(this.client);
    this.emit = emit;
  }
  async connected() {
    if (this.stopped) return;
    await this.status();
    if (this.stopped) return;
    this.phone = ''; this.hash = '';
    await this.emit({ status: 'connected', session: this.session.save() });
  }
  async status() {
    if (this.stopped) throw new MessagingError('not_connected');
    try { await bounded(this.client.invoke(new Api.users.GetUsers({ id: [new Api.InputUserSelf()] })), 3000); }
    catch (error) {
      await this.emit({ status: authorizationRevoked(error) ? 'disconnected' : 'restoring' });
      throw providerError(error);
    }
  }
  async start(phone?: string) {
    try {
      this.phone = phone!;
      await this.client.connect();
      if (this.stopped) return;
      const result = await this.client.sendCode({ apiId: this.apiId, apiHash: this.apiHash }, this.phone);
      this.hash = result.phoneCodeHash;
      if (!this.stopped) await this.emit({ status: 'code' });
    } catch (error) { throw providerError(error); }
  }
  async submit(kind: 'code' | 'password', value: string) {
    try {
      if (kind === 'code') {
        const result = await this.client.invoke(new Api.auth.SignIn({ phoneNumber: this.phone, phoneCodeHash: this.hash, phoneCode: value }));
        if (!(result instanceof Api.auth.Authorization)) throw new MessagingError('provider_unavailable', 503);
      } else {
        const info = await this.client.invoke(new Api.account.GetPassword());
        await this.client.invoke(new Api.auth.CheckPassword({ password: await password.computeCheck(info, value) }));
      }
      await this.connected();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorMessage' in error && error.errorMessage === 'SESSION_PASSWORD_NEEDED') { await this.emit({ status: 'password' }); return; }
      throw providerError(error);
    }
  }
  async restore(session: string) {
    this.session = new StringSession(session);
    this.client.session = this.session;
    await this.client.connect();
    await this.connected();
  }
  async list() {
    const result = await this.client.invoke(new Api.channels.GetAdminedPublicChannels({}));
    return result.chats.filter((chat): chat is Api.Channel => chat instanceof Api.Channel && Boolean(chat.broadcast) && !chat.noforwards && !chat.left).slice(0, 100)
      .filter(chat => Boolean(chat.username)).map(chat => ({ id: chat.id.toString(), reference: `@${chat.username}`, title: chat.title.slice(0, 200), kind: 'broadcast' as const }));
  }
  async verify(source: string): Promise<Source> {
    const match = /^(?:https:\/\/t\.me\/|@)([a-zA-Z][a-zA-Z0-9_]{3,31})$/.exec(source);
    try {
      let entity: Api.TypeChat | undefined;
      if (match) {
        const resolved = await this.client.invoke(new Api.contacts.ResolveUsername({ username: match[1] }));
        entity = resolved.chats.find(chat => chat instanceof Api.Channel);
      } else {
        const identity = /^([1-9]\d{0,18})(?::(-?[1-9]\d{0,18}))?$/.exec(source);
        if (!identity || BigInt(identity[1]) > 9223372036854775807n) throw new MessagingError('source_unavailable');
        let channel: Api.InputChannel;
        if (identity[2]) {
          const hash = BigInt(identity[2]);
          if (hash < -9223372036854775808n || hash > 9223372036854775807n) throw new MessagingError('source_unavailable');
          channel = new Api.InputChannel({ channelId: helpers.returnBigInt(identity[1]), accessHash: helpers.returnBigInt(identity[2]) });
        } else {
          const peer = this.client.session.getInputEntity(identity[1]);
          if (!(peer instanceof Api.InputPeerChannel)) throw new MessagingError('source_unavailable');
          channel = new Api.InputChannel({ channelId: peer.channelId, accessHash: peer.accessHash });
        }
        const result = await this.client.invoke(new Api.channels.GetChannels({ id: [channel] }));
        entity = result.chats.find(chat => chat instanceof Api.Channel && chat.id.toString() === identity[1]);
      }
      if (!(entity instanceof Api.Channel) || !entity.broadcast || entity.left || entity.noforwards || !entity.accessHash) throw new MessagingError('source_unavailable');
      const channel = new Api.InputChannel({ channelId: entity.id, accessHash: entity.accessHash });
      const result = await this.client.invoke(new Api.channels.GetParticipant({ channel, participant: new Api.InputPeerSelf() }));
      if (!(result.participant instanceof Api.ChannelParticipant || result.participant instanceof Api.ChannelParticipantSelf || result.participant instanceof Api.ChannelParticipantCreator || result.participant instanceof Api.ChannelParticipantAdmin)) throw new MessagingError('source_unavailable');
      return { id: entity.id.toString(), reference: entity.username ? `@${entity.username}` : undefined, title: entity.title.slice(0, 200), kind: 'broadcast' };
    } catch { throw new MessagingError('source_unavailable'); }
  }
  async close(remote: boolean) {
    this.stopped = true; this.phone = ''; this.hash = '';
    try { if (remote) await bounded(this.client.invoke(new Api.auth.LogOut()), 3500); return remote; }
    finally { await this.client.destroy(); }
  }
}

export class WhatsAppAdapter implements Adapter {
  socket?: WASocket;
  creds: AuthenticationCreds = initAuthCreds();
  keys: SignalDataSet = {};
  emit: (update: Update) => Promise<void>;
  stopped = false;
  connected = false;
  restarts = 0;
  socketFactory: typeof makeWASocket;
  constructor(emit: (update: Update) => Promise<void>, socketFactory = makeWASocket) { this.emit = emit; this.socketFactory = socketFactory; }
  serialized() { return JSON.stringify({ creds: this.creds, keys: this.keys }, BufferJSON.replacer); }
  async failed() {
    this.connected = false;
    try { await this.emit({ status: 'disconnected' }); } catch {}
    await this.close(false).catch(() => {});
  }
  async persist() {
    if (!this.stopped) try { await this.emit({ session: this.serialized() }); }
    catch (error) { await this.failed(); throw error; }
  }
  async start() {
    if (this.stopped) return;
    const previous = this.socket; this.socket = undefined; this.connected = false; previous?.end(undefined);
    const socket = this.socketFactory({
      auth: { creds: this.creds, keys: {
        get: async <Kind extends keyof SignalDataTypeMap>(type: Kind, ids: string[]) => {
          const result: Record<string, SignalDataTypeMap[Kind]> = {};
          for (const id of ids) {
            const value = this.keys[type]?.[id];
            if (value) result[id] = (type === 'app-state-sync-key' ? proto.Message.AppStateSyncKeyData.fromObject(value as proto.Message.IAppStateSyncKeyData) : value) as SignalDataTypeMap[Kind];
          }
          return result;
        },
        set: async data => {
          if (this.stopped || socket !== this.socket) return;
          for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            const values: Record<string, unknown> = { ...this.keys[type], ...data[type] };
            for (const id of Object.keys(values)) if (!values[id]) delete values[id];
            Object.assign(this.keys, { [type]: values });
          }
          await this.persist();
        },
      } },
      logger: pino({ level: 'silent' }), syncFullHistory: false, shouldSyncHistoryMessage: () => false,
      fireInitQueries: false, markOnlineOnConnect: false, emitOwnEvents: false, shouldIgnoreJid: () => true,
      getMessage: async () => undefined, connectTimeoutMs: 10000, defaultQueryTimeoutMs: 8000,
    });
    this.socket = socket;
    socket.ev.on('creds.update', update => {
      if (this.stopped || socket !== this.socket) return;
      Object.assign(this.creds, update);
      void this.persist().catch(() => {});
    });
    socket.ev.on('connection.update', update => {
      void (async () => {
        if (this.stopped || socket !== this.socket) return;
        if (update.qr) {
          const qr = await QRCode.toDataURL(update.qr, { width: 256, margin: 2 });
          if (!this.stopped && socket === this.socket) await this.emit({ status: 'qr', qr });
        }
        if (update.connection === 'open') { await this.emit({ status: 'connected', session: this.serialized() }); if (!this.stopped && socket === this.socket) this.connected = true; }
        if (update.connection === 'close') {
          this.connected = false;
          const error = update.lastDisconnect?.error;
          const code = error && 'output' in error ? (error.output as { statusCode?: number }).statusCode : undefined;
          this.socket = undefined; socket.end(undefined);
          if (code === 515 && this.restarts++ < 2) await this.start();
          else await this.emit({ status: code === 401 || code === 403 ? 'disconnected' : 'restoring' });
        }
      })().catch(() => { void this.failed().catch(() => {}); });
    });
  }
  async submit(): Promise<void> { throw new MessagingError('invalid_payload'); }
  async restore(session: string) {
    const parsed = JSON.parse(session, BufferJSON.reviver);
    this.creds = parsed.creds; this.keys = parsed.keys;
    await this.start();
    const started = Date.now();
    while (!this.connected && !this.stopped && Date.now() - started < 9000) await new Promise(resolve => setTimeout(resolve, 50));
    if (!this.connected) throw new MessagingError('not_connected');
  }
  async list(): Promise<Source[]> { return []; }
  async status() {
    if (!this.connected || !this.socket) { await this.emit({ status: 'restoring' }); throw new MessagingError('not_connected'); }
  }
  async verify(source: string): Promise<Source> {
    const invite = /^https:\/\/whatsapp\.com\/channel\/([A-Za-z0-9]{8,100})$/.exec(source);
    const jid = /^\d{5,40}@newsletter$/.test(source) ? source : undefined;
    if (!this.connected || !this.socket || (!invite && !jid)) throw new MessagingError('source_unavailable');
    try {
      const metadata = await this.socket.newsletterMetadata(invite ? 'invite' : 'jid', invite ? invite[1] : jid!);
      if (!metadata || !/^\d+@newsletter$/.test(metadata.id)) throw new Error('unavailable');
      return { id: metadata.id, title: metadata.name.slice(0, 200), kind: 'newsletter' };
    } catch { throw new MessagingError('source_unavailable'); }
  }
  async close(remote: boolean) {
    this.stopped = true; this.connected = false;
    const socket = this.socket; this.socket = undefined;
    try { if (remote && socket) await bounded(socket.logout(), 3500); return Boolean(remote && socket); }
    finally { socket?.end(undefined); this.keys = {}; this.creds = initAuthCreds(); }
  }
}
export const realAdapterFactory: Factory = (platform, emit) => platform === 'telegram' ? new TelegramAdapter(emit) : new WhatsAppAdapter(emit);