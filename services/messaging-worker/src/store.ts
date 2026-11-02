import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { encryptionKey, sealSession, openSession, MessagingError } from '../../../lib/personal-messaging.ts';
import type { Platform } from '../../../lib/personal-messaging.ts';
import type { Account, Store } from './engine.ts';

export class EncryptedFileStore implements Store {
  directory: string;
  key: Buffer;
  writes = new Map<string, Promise<void>>();
  constructor(directory: string, key = encryptionKey()) { this.directory = directory; this.key = key; }
  path(owner: number, platform: Platform) { return join(this.directory, `${owner}-${platform}.sealed`); }
  async read(owner: number, platform: Platform): Promise<Account | undefined> {
    try { return JSON.parse(openSession(owner, platform, await readFile(this.path(owner, platform), 'utf8'), this.key)) as Account; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new MessagingError('session_corrupt', 503); }
  }
  async write(account: Account) {
    const path = this.path(account.owner, account.platform);
    const sealed = sealSession(account.owner, account.platform, JSON.stringify(account), this.key);
    const previous = this.writes.get(path) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, sealed, { mode: 0o600, flag: 'wx', flush: true });
      await rename(temporary, path);
      const directory = await open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    });
    this.writes.set(path, task);
    try { await task; } finally { if (this.writes.get(path) === task) this.writes.delete(path); }
  }
}