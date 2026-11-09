import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { TelegramAdapter, WhatsAppAdapter, providerError } from './adapters.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
function telegram() {
  const updates = []; const requests = []; let failure;
  let dialogs = new Api.messages.Dialogs({ dialogs: [], messages: [], chats: [], users: [] });
  let history = new Api.messages.Messages({ messages: [], topics: [], chats: [], users: [] });
  let participant = new Api.ChannelParticipantLeft({ peer: new Api.PeerUser({ userId: 1n }) });
  let admined = [];
  const client = new TelegramClient(new StringSession(''), 1, 'a'.repeat(32), {});
  client.connect = async () => { client._updateLoop.start(); await client.updateManager.catchUp(); client.updateManager.receive({ className: 'UpdateNewMessage', message: { message: 'private' } }); return true; };
  client.destroy = async () => {};
  client.invoke = async request => {
    requests.push(request); if (failure) throw failure;
    const query = request.query || request;
    if (query instanceof Api.users.GetUsers) return [];
    if (query instanceof Api.contacts.ResolveUsername) return { chats: [new Api.Channel({ id: 123n, accessHash: 456n, title: 'News', broadcast: true, username: 'news' })] };
    if (query instanceof Api.channels.GetChannels) return { chats: [new Api.Channel({ id: 123n, accessHash: 456n, title: 'Private News', broadcast: true })] };
    if (query instanceof Api.channels.GetParticipant) return { participant };
    if (query instanceof Api.channels.GetAdminedPublicChannels) return { chats: admined };
    if (query instanceof Api.messages.GetDialogs) return dialogs;
    if (query instanceof Api.messages.GetHistory) return typeof history === 'function' ? history(query) : history;
    return { chats: [] };
  };
  client.iterDownload = async function* () {};
  const adapter = new TelegramAdapter(async update => { updates.push(update); }, client);
  return {
    client, adapter, updates, requests, fail: error => { failure = error; }, member: value => { participant = value; },
    setDialogs: value => { dialogs = value; }, setHistory: value => { history = value; }, setAdmined: value => { admined = value; },
  };
}
test('pinned production Telegram adapter disables updates before connect and wraps every RPC', async () => {
  const flow = telegram(); let received = 0;
  flow.client.updateManager.dispatch = () => { received++; };
  await flow.adapter.restore(''); await flow.adapter.list(); await flow.adapter.status();
  assert.equal(received, 0); assert.equal(flow.client._updateLoop.running, false);
  assert.ok(flow.requests.length >= 3); assert.ok(flow.requests.every(request => request instanceof Api.InvokeWithoutUpdates));
  await assert.rejects(flow.client.invoke(new Api.updates.GetDifference({ pts: 0, date: 0, qts: 0 })), /source_unavailable/);
  await assert.rejects(flow.client.invoke(new Api.updates.GetChannelDifference({})), /source_unavailable/);
  await flow.client.invoke(new Api.messages.GetDialogs({ offsetDate: 0, offsetId: 0, offsetPeer: new Api.InputPeerEmpty(), limit: 1, hash: 0 }));
  assert.ok(flow.requests.some(request => request.query instanceof Api.messages.GetDialogs));
  assert.ok(!flow.requests.some(request => /Difference|History/.test(request.query?.className || '')));
  await flow.adapter.close(false);
});
test('Telegram participant left and banned cannot authorize a channel', async () => {
  const flow = telegram(); await assert.rejects(flow.adapter.verify('@news'), /source_unavailable/);
  flow.member(new Api.ChannelParticipantBanned({ left: true }));
  await assert.rejects(flow.adapter.verify('@news'), /source_unavailable/);
});
test('Telegram accepts only joined member classes and private IDs with an already known access hash', async () => {
  const flow = telegram();
  flow.client.session.getInputEntity = () => new Api.InputPeerChannel({ channelId: 123n, accessHash: 456n });
  for (const participant of [new Api.ChannelParticipant({ userId: 1n, date: 1 }), new Api.ChannelParticipantSelf({ userId: 1n, inviterId: 1n, date: 1 }), new Api.ChannelParticipantCreator({ userId: 1n, adminRights: new Api.ChatAdminRights({}) }), new Api.ChannelParticipantAdmin({ userId: 1n, promotedBy: 1n, date: 1, adminRights: new Api.ChatAdminRights({}) })]) {
    flow.member(participant);
    assert.equal((await flow.adapter.verify('123')).id, '123');
  }
  flow.client.session.getInputEntity = () => { throw new Error('unknown peer'); };
  await assert.rejects(flow.adapter.verify('999'), /source_unavailable/);
  assert.ok(flow.requests.every(request => request instanceof Api.InvokeWithoutUpdates && (request.query instanceof Api.channels.GetChannels || request.query instanceof Api.channels.GetParticipant)));
});
test('explicit private channel identity and hash can be verified without dialogs or message acquisition', async () => {
  const flow = telegram(); flow.member(new Api.ChannelParticipant({ userId: 1n, date: 1 }));
  const source = await flow.adapter.verify('123:456'); assert.equal(source.id, '123'); assert.equal(source.reference, undefined);
  assert.ok(flow.requests.every(request => request instanceof Api.InvokeWithoutUpdates));
  assert.ok(flow.requests.every(request => ['channels.GetChannels', 'channels.GetParticipant'].includes(request.query.className)));
  await assert.rejects(flow.adapter.verify('123:99999999999999999999'), /source_unavailable/);
});
test('Telegram group list exposes joined basic/supergroup metadata only and records a high-water baseline', async () => {
  const flow = telegram();
  const basic = new Api.Chat({ id: 700n, title: 'Basic group' });
  const supergroup = new Api.Channel({ id: 800n, accessHash: 900n, title: 'Supergroup', megagroup: true });
  flow.setDialogs(new Api.messages.Dialogs({
    dialogs: [
      new Api.Dialog({ peer: new Api.PeerChat({ chatId: 700n }), topMessage: 75, notifySettings: new Api.PeerNotifySettings({}) }),
      new Api.Dialog({ peer: new Api.PeerChannel({ channelId: 800n }), topMessage: 90, notifySettings: new Api.PeerNotifySettings({}) }),
    ],
    messages: [new Api.Message({ id: 90, message: 'private preview must stay hidden' })],
    chats: [basic, supergroup], users: [],
  }));
  const groups = await flow.adapter.list();
  assert.deepEqual(groups.map(group => [group.id, group.kind, group.groupType, group.baselineMessageId]), [
    ['group:basic:700', 'group', 'basic', 75], ['group:supergroup:800', 'group', 'supergroup', 90],
  ]);
  assert.equal(groups[1].accessHash, '900');
  assert.ok(!JSON.stringify(groups).includes('private preview'));
  const verified = await flow.adapter.verify('group:supergroup:800');
  assert.equal(verified.baselineMessageId, 90);
});
test('poll reads only messages above the acknowledged baseline and omits private conversation text', async () => {
  const flow = telegram();
  const group = new Api.Channel({ id: 800n, accessHash: 900n, title: 'Supergroup', megagroup: true });
  flow.setDialogs(new Api.messages.Dialogs({
    dialogs: [new Api.Dialog({ peer: new Api.PeerChannel({ channelId: 800n }), topMessage: 90, notifySettings: new Api.PeerNotifySettings({}) })],
    messages: [], chats: [group], users: [],
  }));
  flow.setHistory(new Api.messages.Messages({
    messages: [
      new Api.Message({ id: 95, message: 'Ci vediamo in privato stasera' }),
      new Api.Message({ id: 94, message: 'Concerto pubblico 12 giugno 2027 presso Teatro Comunale' }),
    ], topics: [], chats: [group], users: [],
  }));
  const result = await flow.adapter.poll({ id: 'group:supergroup:800', title: 'Supergroup', kind: 'group', active: true, groupType: 'supergroup', accessHash: '900' }, 90, 10);
  assert.equal(result.cursor, 95); assert.equal(result.readCount, 2); assert.equal(result.messages.length, 1);
  assert.ok(!JSON.stringify(result).includes('privato stasera'));
  const historyRequest = flow.requests.map(request => request.query).find(query => query instanceof Api.messages.GetHistory);
  assert.equal(historyRequest.offsetId, 91); assert.equal(historyRequest.limit, 10);
});
test('poll advances over service-only pages and retrieves backlog chronologically without skipping later batches', async () => {
  const flow = telegram();
  const group = new Api.Channel({ id: 800n, accessHash: 900n, title: 'Supergroup', megagroup: true });
  flow.setDialogs(new Api.messages.Dialogs({
    dialogs: [new Api.Dialog({ peer: new Api.PeerChannel({ channelId: 800n }), topMessage: 90, notifySettings: new Api.PeerNotifySettings({}) })],
    messages: [], chats: [group], users: [],
  }));
  const history = Array.from({ length: 25 }, (_, index) => {
    const id = 91 + index;
    return id <= 100 || id === 105
      ? new Api.MessageService({
        id, peerId: new Api.PeerChannel({ channelId: 800n }), date: 1, action: new Api.MessageActionEmpty(),
      })
      : new Api.Message({ id, message: 'Festival pubblico 12 giugno 2027 presso Teatro Comunale' });
  });
  const requested = [];
  flow.setHistory(query => {
    const after = query.offsetId - 1;
    requested.push(query.offsetId);
    return new Api.messages.Messages({
      messages: history.filter(message => message.id > after).slice(0, query.limit).reverse(),
      topics: [], chats: [group], users: [],
    });
  });
  const source = { id: 'group:supergroup:800', title: 'Supergroup', kind: 'group', active: true, groupType: 'supergroup', accessHash: '900' };
  let cursor = 90;
  const read = [], accepted = [], cursors = [];
  for (let round = 0; round < 3; round++) {
    const page = await flow.adapter.poll(source, cursor, 10);
    cursor = page.cursor;
    read.push(page.readCount); accepted.push(page.messages.length); cursors.push(cursor);
  }
  assert.deepEqual(read, [10, 10, 5]);
  assert.deepEqual(accepted, [0, 9, 5]);
  assert.deepEqual(cursors, [100, 110, 115]);
  assert.deepEqual(requested, [91, 101, 111]);
  assert.equal((await flow.adapter.poll(source, cursor, 10)).readCount, 0);
});
test('bounded joined-group listing keeps administered broadcasts and reports dialog truncation', async () => {
  const flow = telegram();
  flow.setAdmined([new Api.Channel({ id: 9000n, accessHash: 9001n, title: 'Admin channel', broadcast: true, username: 'adminchannel' })]);
  let enumeratedLimit;
  flow.client.iterDialogs = ({ limit }) => {
    enumeratedLimit = limit;
    return {
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < limit; index++) {
          const entity = new Api.Chat({ id: BigInt(index + 1), title: `Group ${index + 1}` });
          yield { entity, dialog: new Api.Dialog({ peer: new Api.PeerChat({ chatId: entity.id }), topMessage: index + 1 }) };
        }
      },
    };
  };
  const listed = await flow.adapter.list();
  assert.equal(enumeratedLimit, 501);
  assert.equal(listed.length, 501);
  assert.equal(listed.at(-1).id, '9000');
  assert.equal(listed.truncated, true);
});
test('Telegram FloodWait is surfaced as a distinct retryable error', () => {
  assert.equal(providerError({ errorMessage: 'FLOOD_WAIT_42' }).code, 'telegram_flood_wait');
});

test('protected or explicitly private messages are discarded even when a public-looking photo is attached', async () => {
  const flow = telegram();
  flow.adapter.verify = async source => ({ id: source, kind: 'group', groupType: 'basic' });
  flow.setHistory(new Api.messages.Messages({
    messages: [
      new Api.Message({ id: 12, message: 'Festival 12 giugno 2027 presso Teatro Comunale', noforwards: true }),
      new Api.Message({ id: 11, message: 'Solo invitati', media: new Api.MessageMediaPhoto({}) }),
    ], topics: [], chats: [], users: [],
  }));
  let downloads = 0;
  flow.client.iterDownload = async function* () { downloads++; };
  const page = await flow.adapter.poll({ id: 'group:basic:1', kind: 'group', active: true, groupType: 'basic' }, 10, 10);
  assert.equal(page.cursor, 12);
  assert.equal(page.discarded, 2);
  assert.equal(downloads, 0);
  assert.deepEqual(page.messages, []);
});
test('Telegram liveness separates transient faults from revoked authorization', async () => {
  const flow = telegram(); flow.fail(new Error('offline')); await assert.rejects(flow.adapter.status());
  assert.equal(flow.updates.at(-1).status, 'restoring');
  const revoked = telegram(); revoked.fail({ code: 401, errorMessage: 'AUTH_KEY_UNREGISTERED' }); await assert.rejects(revoked.adapter.status());
  assert.equal(revoked.updates.at(-1).status, 'disconnected');
});
test('Telegram liveness request is bounded without any background update poll', async context => {
  const flow = telegram(); flow.client.invoke = () => new Promise(() => {});
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = assert.rejects(flow.adapter.status(), /worker_unavailable/); context.mock.timers.tick(3001); await pending;
  assert.equal(flow.updates.at(-1).status, 'restoring'); assert.equal(flow.client._updateLoop.running, false);
});
function whatsapp(emit) {
  const sockets = []; const options = [];
  const adapter = new WhatsAppAdapter(emit, configuration => {
    options.push(configuration);
    const socket = { ev: new EventEmitter(), end: () => { socket.ended = true; }, logout: async () => {}, newsletterMetadata: async () => ({ id: '12345@newsletter', name: 'News' }) };
    sockets.push(socket); return socket;
  });
  return { adapter, sockets, options };
}
test('WhatsApp transient close preserves session, revocation erases it, and old socket events are inert', async () => {
  const updates = []; const flow = whatsapp(async update => { updates.push(update); });
  await flow.adapter.start(); const old = flow.sockets[0]; old.ev.emit('connection.update', { connection: 'open' }); await turn();
  old.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } }); await turn();
  assert.equal(updates.at(-1).status, 'restoring'); assert.equal(flow.adapter.connected, false); assert.ok(flow.adapter.serialized().includes('creds'));
  await flow.adapter.start(); old.ev.emit('connection.update', { connection: 'open' }); await turn(); assert.equal(flow.adapter.connected, false);
  flow.sockets[1].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } }); await turn();
  assert.equal(updates.at(-1).status, 'disconnected');
  assert.equal(flow.options[0].syncFullHistory, false); assert.equal(flow.options[0].shouldSyncHistoryMessage(), false);
});
test('WhatsApp rejected credential persistence notifies engine and closes socket without rejection leakage', async () => {
  const updates = []; const flow = whatsapp(async update => { updates.push(update); if (update.session) throw new Error('disk full'); });
  await flow.adapter.start(); flow.sockets[0].ev.emit('connection.update', { connection: 'open' }); await turn(); await turn();
  assert.equal(flow.adapter.connected, false); assert.equal(flow.sockets[0].ended, true);
  assert.equal(updates.at(-1).status, 'disconnected');
});
test('WhatsApp 515 reconnects are bounded and superseded socket events cannot restore connected', async () => {
  const updates = []; const flow = whatsapp(async update => { updates.push(update); }); await flow.adapter.start();
  for (let count = 0; count < 3; count++) { flow.sockets.at(-1).ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } }); await turn(); }
  assert.equal(flow.sockets.length, 3); assert.equal(updates.at(-1).status, 'restoring');
  for (const socket of flow.sockets) socket.ev.emit('connection.update', { connection: 'open' }); await turn();
  assert.equal(flow.adapter.connected, false); assert.ok(flow.sockets.every(socket => socket.ended));
});