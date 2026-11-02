import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TelegramClient, Api } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { TelegramAdapter, WhatsAppAdapter } from './adapters.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
function telegram() {
  const updates = []; const requests = []; let failure;
  let participant = new Api.ChannelParticipantLeft({ peer: new Api.PeerUser({ userId: 1n }) });
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
    return { chats: [] };
  };
  const adapter = new TelegramAdapter(async update => { updates.push(update); }, client);
  return { client, adapter, updates, requests, fail: error => { failure = error; }, member: value => { participant = value; } };
}
test('pinned production Telegram adapter disables updates before connect and wraps every RPC', async () => {
  const flow = telegram(); let received = 0;
  flow.client.updateManager.dispatch = () => { received++; };
  await flow.adapter.restore(''); await flow.adapter.list(); await flow.adapter.status();
  assert.equal(received, 0); assert.equal(flow.client._updateLoop.running, false);
  assert.ok(flow.requests.length >= 3); assert.ok(flow.requests.every(request => request instanceof Api.InvokeWithoutUpdates));
  await assert.rejects(flow.client.invoke(new Api.updates.GetDifference({ pts: 0, date: 0, qts: 0 })), /source_unavailable/);
  await assert.rejects(flow.client.invoke(new Api.updates.GetChannelDifference({})), /source_unavailable/);
  await assert.rejects(flow.client.invoke(new Api.messages.GetDialogs({})), /source_unavailable/);
  assert.ok(!flow.requests.some(request => /Difference|Dialogs|History/.test(request.query?.className || '')));
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