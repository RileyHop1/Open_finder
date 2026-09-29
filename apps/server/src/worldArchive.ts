/**
 * The world export/import archive format (CLAUDE.md's Saving section: "one
 * archive (JSON + assets) for backups or moving a campaign to another
 * machine"; Data durability: "the export archive streams... never build the
 * archive in memory, and dedupe assets by content hash").
 *
 * Not a general-purpose container (no tar/zip dependency) -- a flat,
 * write-once/read-once sequence of length-framed entries, which is exactly
 * what lets both directions stream: a writer never needs a seekable output,
 * and a reader never needs to buffer past the entry it's currently
 * consuming. Content-hash asset dedupe isn't code this module has to do --
 * it already falls out of `paths.ts`'s `assets/<hash>.<ext>` naming, and
 * this module preserves those filenames exactly, both directions.
 *
 * Entry: `[4-byte LE name length][UTF-8 name][8-byte LE content length][content bytes]`,
 * repeated until the stream ends. Three entries appear today: `world.json`,
 * `world.db`, and one `assets/<filename>` per file in the world's assets
 * directory -- `world.db` always holds `WorldStore.serialize()`'s output,
 * never a raw copy of the on-disk file, for the same reason
 * `migrations.ts`'s own `snapshotDatabase` uses `serialize()`: in WAL mode a
 * raw file copy can miss recently-committed writes that only exist in the
 * `-wal` file so far.
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';

import type { World } from '@hearthtable/core';
import { worldSchema } from '@hearthtable/core';

import { resolveWorldPaths } from './paths.js';

const NAME_LENGTH_BYTES = 4;
const CONTENT_LENGTH_BYTES = 8;

function entryHeader(name: string, size: number): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(
    NAME_LENGTH_BYTES + nameBytes.length + CONTENT_LENGTH_BYTES,
  );
  header.writeUInt32LE(nameBytes.length, 0);
  nameBytes.copy(header, NAME_LENGTH_BYTES);
  header.writeBigUInt64LE(BigInt(size), NAME_LENGTH_BYTES + nameBytes.length);
  return header;
}

function* writeBufferEntry(name: string, content: Buffer): Generator<Buffer> {
  yield entryHeader(name, content.length);
  yield content;
}

async function* writeFileEntry(
  name: string,
  filePath: string,
  size: number,
): AsyncGenerator<Buffer> {
  yield entryHeader(name, size);
  for await (const chunk of createReadStream(filePath)) {
    yield chunk as Buffer;
  }
}

async function* generateArchiveEntries(
  world: World,
  databaseBytes: Uint8Array,
  assetsDir: string,
): AsyncGenerator<Buffer> {
  yield* writeBufferEntry('world.json', Buffer.from(JSON.stringify(world)));
  yield* writeBufferEntry('world.db', Buffer.from(databaseBytes));

  // Sorted for a deterministic archive, not because correctness needs it.
  const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir).sort() : [];
  for (const filename of assetFiles) {
    const filePath = join(assetsDir, filename);
    const { size } = statSync(filePath);
    yield* writeFileEntry(`assets/${filename}`, filePath, size);
  }
}

/**
 * Builds the export archive for `world` as a single streamed `Readable`.
 * Never buffered in memory: `world.json` and `world.db` are each one small,
 * bounded value, but every asset is read directly off disk as encountered,
 * one file and one chunk at a time, regardless of how large or how many
 * there are -- the property "assets are explicitly unbounded" requires.
 */
export function exportWorldArchive(
  world: World,
  databaseBytes: Uint8Array,
  assetsDir: string,
): Readable {
  return Readable.from(generateArchiveEntries(world, databaseBytes, assetsDir));
}

/**
 * A one-pass reader over an archive stream. Keeps at most one underlying
 * chunk buffered at a time -- `pipeExactly` drains whatever's pending before
 * ever pulling a new one -- so reading a single huge asset entry never grows
 * memory with the entry's size, only with the underlying stream's own chunk
 * size.
 */
class ArchiveReader {
  private readonly source: AsyncIterator<Buffer>;
  private pending: Buffer = Buffer.alloc(0);
  private exhausted = false;

  constructor(stream: Readable) {
    this.source = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  }

  private async pull(): Promise<boolean> {
    if (this.exhausted) {
      return false;
    }
    // Destructuring `{ value, done }` in one step defeats the discriminated
    // union `IteratorResult` relies on -- `done: true`'s `value` is typed
    // `any` in lib.es2015.iterable.d.ts, which trips no-unsafe-assignment.
    // Checking `.done` first, before ever touching `.value`, keeps the
    // narrowing TS needs to know `.value` is a real `Buffer` afterward.
    const result = await this.source.next();
    if (result.done === true) {
      this.exhausted = true;
      return false;
    }
    this.pending =
      this.pending.length === 0
        ? result.value
        : Buffer.concat([this.pending, result.value]);
    return true;
  }

  /** True only once there is no more buffered data AND the source is exhausted. */
  async atEnd(): Promise<boolean> {
    if (this.pending.length > 0) {
      return false;
    }
    return !(await this.pull());
  }

  async readExactly(n: number): Promise<Buffer> {
    while (this.pending.length < n) {
      if (!(await this.pull())) {
        throw new Error(
          `unexpected end of archive: wanted ${n} bytes, had ${this.pending.length}`,
        );
      }
    }
    const result = this.pending.subarray(0, n);
    this.pending = this.pending.subarray(n);
    return result;
  }

  /** Writes exactly `n` bytes of content to `destination`, one already-available chunk at a time. */
  async pipeExactly(n: number, destination: Writable): Promise<void> {
    let remaining = n;
    while (remaining > 0) {
      if (this.pending.length === 0 && !(await this.pull())) {
        throw new Error(`unexpected end of archive: wanted ${remaining} more bytes`);
      }
      const take = Math.min(this.pending.length, remaining);
      const chunk = this.pending.subarray(0, take);
      this.pending = this.pending.subarray(take);
      remaining -= take;
      await new Promise<void>((resolve, reject) => {
        destination.write(chunk, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }

  /** Discards exactly `n` bytes of content -- an entry name this version of the reader doesn't recognize. */
  async skip(n: number): Promise<void> {
    let remaining = n;
    while (remaining > 0) {
      if (this.pending.length === 0 && !(await this.pull())) {
        throw new Error(
          `unexpected end of archive: wanted to skip ${remaining} more bytes`,
        );
      }
      const take = Math.min(this.pending.length, remaining);
      this.pending = this.pending.subarray(take);
      remaining -= take;
    }
  }
}

interface EntryHeader {
  readonly name: string;
  readonly size: number;
}

async function readEntryHeader(reader: ArchiveReader): Promise<EntryHeader | undefined> {
  if (await reader.atEnd()) {
    return undefined;
  }
  const nameLength = (await reader.readExactly(NAME_LENGTH_BYTES)).readUInt32LE(0);
  const name = (await reader.readExactly(nameLength)).toString('utf8');
  const size = Number(
    (await reader.readExactly(CONTENT_LENGTH_BYTES)).readBigUInt64LE(0),
  );
  return { name, size };
}

function endWritable(writable: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    writable.end((error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

const ASSET_PREFIX = 'assets/';

/**
 * Restores an exported archive as a brand-new world under `worldsRoot`,
 * returning its manifest. Preserves the archived world's own id rather than
 * minting a new one: the restored `world.db` still has every row's
 * `world_id` column pointing at that original id, so anything else would
 * silently orphan every document, seat, and operation. If a world with that
 * id already exists at the destination, this refuses rather than overwrite
 * it -- there is no "replace" story yet, only "restore a backup that isn't
 * already here" (moving a campaign to another machine, per CLAUDE.md).
 *
 * Writes into a staging directory first and only renames it into place once
 * the whole archive has parsed successfully, so a truncated or corrupt
 * upload never leaves a half-written world behind for `listWorlds` to trip
 * over.
 */
export async function importWorldArchive(
  worldsRoot: string,
  input: Readable,
): Promise<World> {
  const reader = new ArchiveReader(input);
  const stagingRoot = join(worldsRoot, `.importing-${crypto.randomUUID()}`);
  const assetsDir = join(stagingRoot, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  let world: World | undefined;
  let sawDatabase = false;

  try {
    for (;;) {
      const header = await readEntryHeader(reader);
      if (header === undefined) {
        break;
      }
      const { name, size } = header;

      if (name === 'world.json') {
        const content = await reader.readExactly(size);
        world = worldSchema.parse(JSON.parse(content.toString('utf8')));
        if (existsSync(resolveWorldPaths(worldsRoot, world.id).root)) {
          throw new Error(`a world with id ${world.id} already exists`);
        }
        writeFileSync(join(stagingRoot, 'world.json'), JSON.stringify(world, null, 2));
      } else if (name === 'world.db') {
        const content = await reader.readExactly(size);
        writeFileSync(join(stagingRoot, 'world.db'), content);
        sawDatabase = true;
      } else if (name.startsWith(ASSET_PREFIX)) {
        const destination = createWriteStream(
          join(assetsDir, name.slice(ASSET_PREFIX.length)),
        );
        await reader.pipeExactly(size, destination);
        await endWritable(destination);
      } else {
        // Forward-compatible: an entry name a future version added that this
        // one doesn't know about is skipped, not a reason to fail the whole
        // import.
        await reader.skip(size);
      }
    }

    if (world === undefined || !sawDatabase) {
      throw new Error('archive is missing world.json or world.db');
    }

    mkdirSync(join(stagingRoot, 'snapshots'), { recursive: true });
    renameSync(stagingRoot, resolveWorldPaths(worldsRoot, world.id).root);
    return world;
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}
