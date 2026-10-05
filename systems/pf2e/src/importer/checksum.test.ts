import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checksumFile, checksumPacks } from './checksum.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-checksum-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('checksumPacks', () => {
  it('is deterministic: the same directory checksums the same way twice', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), '{"x":1}');
    writeFileSync(join(dir, 'b.json'), '{"y":2}');

    expect(checksumPacks(dir)).toBe(checksumPacks(dir));
  });

  it('is independent of the order files were created in', () => {
    const dirA = makeTempDir();
    writeFileSync(join(dirA, 'a.json'), '{"x":1}');
    writeFileSync(join(dirA, 'b.json'), '{"y":2}');

    const dirB = makeTempDir();
    writeFileSync(join(dirB, 'b.json'), '{"y":2}');
    writeFileSync(join(dirB, 'a.json'), '{"x":1}');

    expect(checksumPacks(dirA)).toBe(checksumPacks(dirB));
  });

  it('is sensitive to file content', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), '{"x":1}');
    const before = checksumPacks(dir);

    writeFileSync(join(dir, 'a.json'), '{"x":2}');
    const after = checksumPacks(dir);

    expect(before).not.toBe(after);
  });

  it('is sensitive to a file rename, even with identical bytes', () => {
    const dirA = makeTempDir();
    writeFileSync(join(dirA, 'a.json'), '{"x":1}');

    const dirB = makeTempDir();
    writeFileSync(join(dirB, 'renamed.json'), '{"x":1}');

    expect(checksumPacks(dirA)).not.toBe(checksumPacks(dirB));
  });

  it('includes nested directories, and normalizes to forward-slash relative paths', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'c.json'), '{"z":3}');

    // Should not throw, and should differ from an empty directory's checksum.
    const emptyDir = makeTempDir();
    expect(checksumPacks(dir)).not.toBe(checksumPacks(emptyDir));
  });

  it('is sensitive to a file being added or removed', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), '{"x":1}');
    const before = checksumPacks(dir);

    writeFileSync(join(dir, 'b.json'), '{"y":2}');
    const after = checksumPacks(dir);

    expect(before).not.toBe(after);
  });

  it('returns the sha256: label prefix', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), '{}');
    expect(checksumPacks(dir)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('checksumFile', () => {
  it('is deterministic, and sensitive to content', () => {
    const dir = makeTempDir();
    const file = join(dir, 'en.json');
    writeFileSync(file, '{"a":1}');
    const before = checksumFile(file);
    expect(checksumFile(file)).toBe(before);

    writeFileSync(file, '{"a":2}');
    expect(checksumFile(file)).not.toBe(before);
  });

  it('is unaffected by the file name, unlike checksumPacks', () => {
    const dirA = makeTempDir();
    writeFileSync(join(dirA, 'en.json'), '{"a":1}');

    const dirB = makeTempDir();
    writeFileSync(join(dirB, 'renamed.json'), '{"a":1}');

    expect(checksumFile(join(dirA, 'en.json'))).toBe(
      checksumFile(join(dirB, 'renamed.json')),
    );
  });

  it('returns the sha256: label prefix', () => {
    const dir = makeTempDir();
    const file = join(dir, 'en.json');
    writeFileSync(file, '{}');
    expect(checksumFile(file)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
