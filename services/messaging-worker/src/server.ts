import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { lock } from 'proper-lockfile';
import { encryptionKey } from '../../../lib/personal-messaging.ts';
import { MessagingEngine, bounded } from './engine.ts';
import { EncryptedFileStore } from './store.ts';
import { assertProviderConfiguration, realAdapterFactory } from './adapters.ts';
import { createMessagingServer } from './http.ts';

const secret = process.env.PERSONAL_MESSAGING_WORKER_SECRET || '';
if (!/^[a-f0-9]{64,}$/i.test(secret)) throw new Error('PERSONAL_MESSAGING_WORKER_SECRET must contain at least 32 random bytes encoded as hex');
encryptionKey();
if (!process.env.PERSONAL_MESSAGING_DATA_DIR) throw new Error('PERSONAL_MESSAGING_DATA_DIR required');
const directory = resolve(process.env.PERSONAL_MESSAGING_DATA_DIR);
await mkdir(directory, { recursive: true, mode: 0o700 });
const releaseLock = await lock(directory, { lockfilePath: join(directory, '.worker.lock'), stale: 10000, update: 2000, retries: { retries: 6, minTimeout: 2000, maxTimeout: 2000 }, onCompromised: () => process.exit(1) });
const engine = new MessagingEngine(new EncryptedFileStore(directory), realAdapterFactory);
const server = createMessagingServer(engine, secret, assertProviderConfiguration);
const expiry = setInterval(() => { void engine.expire().catch(() => {}); }, 10000);
expiry.unref();
server.listen(Number(process.env.PERSONAL_MESSAGING_PORT || 3417), '127.0.0.1');
async function shutdown() {
  clearInterval(expiry); server.close();
  for (const entry of engine.entries.values()) { entry.account.revision++; await bounded(entry.adapter?.close(false) || Promise.resolve(false)).catch(() => {}); }
  await Promise.allSettled(engine.store instanceof EncryptedFileStore ? [...engine.store.writes.values()] : []);
  await releaseLock(); process.exit(0);
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });