/**
 * The pin (ADR 0011): which upstream commit this importer targets, and the
 * content checksums that commit's `packs/` and `static/lang/en.json` were
 * verified against. Re-pinning is a two-line diff in this one file (now
 * three, since ADR 0020 added the lang checksum), reviewed like any other
 * code change -- see `docs/importer.md`.
 *
 * `UPSTREAM_PACKS_CHECKSUM` was computed with this importer's own
 * `checksumPacks` against a real fetch of `UPSTREAM_COMMIT`, not invented --
 * see `docs/importer.md`'s "Re-pinning" section for the exact steps to
 * reproduce it. `UPSTREAM_LANG_CHECKSUM` is the same idea, scoped to just
 * `static/lang/en.json` via `checksumFile` (ADR 0020 decision 5) -- a
 * different file, so a different checksum, verified independently.
 */

export const UPSTREAM_REPO = 'https://github.com/foundryvtt/pf2e.git';

export const UPSTREAM_COMMIT = 'afcd141f81e0a1d482d3b85152eb584547560416';

export const UPSTREAM_PACKS_CHECKSUM =
  'sha256:b56dbc721a779ce8f3f4b49820f1c73a92b183f1c97081dae425edb4d1fed133';

export const UPSTREAM_LANG_CHECKSUM =
  'sha256:2956d62b22d446c3347a5d8ab545da67b5303959c68fe32afa5503f7d14f15b6';
