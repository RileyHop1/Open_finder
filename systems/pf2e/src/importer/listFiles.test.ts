import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listFilesRecursively, toPosixRelativePath } from './listFiles.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hearthtable-listfiles-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('listFilesRecursively', () => {
  it('lists files at the top level', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'a.json'), '{}');
    writeFileSync(join(dir, 'b.json'), '{}');

    const files = listFilesRecursively(dir);
    expect(files).toHaveLength(2);
  });

  it('recurses into nested directories', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'c.json'), '{}');

    const files = listFilesRecursively(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('nested');
  });

  it('returns an empty array for an empty directory', () => {
    const dir = makeTempDir();
    expect(listFilesRecursively(dir)).toEqual([]);
  });
});

describe('toPosixRelativePath', () => {
  it('normalizes to forward slashes regardless of host path separators', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'nested'));
    const file = join(dir, 'nested', 'c.json');
    writeFileSync(file, '{}');

    expect(toPosixRelativePath(dir, file)).toBe('nested/c.json');
  });
});
