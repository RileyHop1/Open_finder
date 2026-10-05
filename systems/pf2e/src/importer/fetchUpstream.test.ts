import { describe, expect, it } from 'vitest';

import { buildFetchCommands } from './fetchUpstream.js';

const options = {
  repo: 'https://github.com/foundryvtt/pf2e.git',
  commit: 'afcd141f81e0a1d482d3b85152eb584547560416',
  targetDir: '/tmp/whatever', // buildFetchCommands never reads the filesystem
};

describe('buildFetchCommands', () => {
  it('initializes a repo, adds the pinned remote, and enables cone-mode sparse checkout', () => {
    const commands = buildFetchCommands(options);
    expect(commands).toContainEqual(['init', '-q']);
    expect(commands).toContainEqual(['remote', 'add', 'origin', options.repo]);
    expect(commands).toContainEqual(['sparse-checkout', 'init', '--cone']);
  });

  it('sparse-checks out only packs/ and static/lang, not the whole working tree', () => {
    const commands = buildFetchCommands(options);
    expect(commands).toContainEqual(['sparse-checkout', 'set', 'packs', 'static/lang']);
  });

  it('enables long paths -- upstream has paths deep enough to need it on Windows', () => {
    const commands = buildFetchCommands(options);
    expect(commands).toContainEqual(['config', 'core.longpaths', 'true']);
  });

  it('fetches exactly the pinned commit at depth 1, then checks it out', () => {
    const commands = buildFetchCommands(options);
    expect(commands).toContainEqual(['fetch', '--depth', '1', 'origin', options.commit]);
    expect(commands).toContainEqual(['checkout', '-q', 'FETCH_HEAD']);
  });

  it('runs the checkout after the fetch, not before', () => {
    const commands = buildFetchCommands(options);
    const fetchIndex = commands.findIndex((c) => c[0] === 'fetch');
    const checkoutIndex = commands.findIndex((c) => c[0] === 'checkout');
    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeGreaterThan(fetchIndex);
  });

  it('sets up sparse-checkout before fetching -- otherwise the whole tree would be fetched', () => {
    const commands = buildFetchCommands(options);
    const sparseSetIndex = commands.findIndex(
      (c) => c[0] === 'sparse-checkout' && c[1] === 'set',
    );
    const fetchIndex = commands.findIndex((c) => c[0] === 'fetch');
    expect(sparseSetIndex).toBeGreaterThanOrEqual(0);
    expect(fetchIndex).toBeGreaterThan(sparseSetIndex);
  });
});
