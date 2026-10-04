import { mkdir, open, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from './crypto.mjs';
import { assert, fail } from './rules.mjs';

// A local filesystem transaction serializes all transitions for one inquiry.
// A process crash can leave a lock: recovery must inspect the stored state;
// automatically deleting a lock could permit a duplicate external effect.
export function createStore(directory) {
  assert(typeof directory === 'string' && directory.length > 0, 'store_required');
  const file = key => join(directory, digest(key) + '.json');
  async function read(key) {
    let raw;
    try { raw = await readFile(file(key), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    try {
      const saved = JSON.parse(raw);
      assert(saved.checksum === digest(saved.record), 'state_corrupt');
      assert(saved.record.request.payload.inquiry_id === key, 'state_corrupt');
      return saved.record;
    } catch { fail('state_corrupt'); }
  }
  async function save(key, record) {
    const path = file(key), temporary = path + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(canonical({ record, checksum: digest(record) }));
      await handle.sync();
      await handle.close(); handle = null;
      await rename(temporary, path);
      // POSIX directory fsync makes the rename durable. Windows does not expose
      // portable directory fsync through Node; external effect adapters MUST
      // enforce the stable idempotency key in their own transactional store.
      let parent;
      try { parent = await open(directory, 'r'); await parent.sync(); }
      catch (e) { if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(e.code)) throw e; }
      finally { if (parent) await parent.close(); }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
  async function transaction(key, fn) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = file(key) + '.lock';
    try { await mkdir(lock); }
    catch (e) { if (e.code === 'EEXIST') fail('inquiry_busy_or_recovery_required'); throw e; }
    try { return await fn(await read(key), record => save(key, record)); }
    finally { await rmdir(lock); }
  }
  return { read, transaction };
}
