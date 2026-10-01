# Content import (in the app)

How the game content gets onto a table without anyone opening a terminal. The
decision and its alternatives are [ADR 0016](adr/0016-in-app-content-import.md);
the importer it runs is [importer.md](importer.md); where the result goes and how
it is read is [compendium.md](compendium.md) and [ADR 0015](adr/0015-compendium-read-side.md).

## For the GM
Open the table. If nothing has been imported, the first thing on screen is a box
that says so, with one button: **Import game content**. Press it. It downloads
the rules data onto your computer (nothing is uploaded), which needs an internet
connection and **Git** installed, and takes a minute or two (54 seconds in the
first real run). Everyone can keep
playing; the box counts the seconds. When it finishes the box folds down to
"Game content: N entries loaded", and the item picker and condition picker fill
up. "Import again" is inside the fold, for when the app is updated to a newer
version of the data.

If it fails, the box says why in a sentence (Git missing, no connection, the
download not matching the version the app expects) and offers **Try again**; the
technical detail is behind "Technical details".

## Routes
| Route | Who | Notes |
| --- | --- | --- |
| `GET /api/compendium/import` | Anyone | The state: `{ state: 'idle' }`, `{ state: 'running', startedAt }`, `{ state: 'done', finishedAt, entryCount }`, or `{ state: 'failed', finishedAt, message, detail? }`. `404` if this server was built without an importer |
| `POST /api/compendium/import` | GM only | Starts an import. `202` with the running state; `409` with the current state if one is already running; `403` for anyone else, or when no campaign is active (there is no GM to be); `404` as above. Takes no body: nothing a client sends reaches the command that runs |

The GM is identified the way every other call is: the `x-device-token` header
resolves to a seat in the active world, and that seat must be a GM seat.

## What runs
`contentImport.ts`:
- `createContentImporter` is the state machine: one import at a time, `idle ->
  running -> done | failed`, and back to `running` on the next request. On
  success it calls the compendium's `reload()` and records the new entry count.
- `spawnImporter` starts `node --import tsx src/importer/index.ts` in the pf2e
  package as a **child process**, with the output and upstream directories
  passed through the environment the importer already reads
  (`HEARTHTABLE_PF2E_OUTPUT_DIR`, `HEARTHTABLE_PF2E_UPSTREAM_DIR`). It gives up
  after 20 minutes. The importer never prints an entry's name (ADR 0003), so the
  last lines of its output are safe to show as the failure detail.
- `explainFailure` maps the output of a failed run to a sentence.

The output goes to `systems/pf2e/.data/imported/` (the same place the command
writes, and the same place the server reads), or wherever
`HEARTHTABLE_COMPENDIUM_DIR` points; the upstream download is a sibling
`upstream/` folder. Both are git-ignored (ADR 0003).
`HEARTHTABLE_IMPORTER_DIR` overrides where the importer's package is found.

## Reloading
`createReloadableCompendium` wraps `loadCompendium`. The app and the realtime
layer hold the wrapper, so `reload()` swaps in a fully built index for both
without either being rebuilt. The swap is synchronous (about a second for 3,107
entries, measured), so no request sees a half-loaded index.

## What a player sees
Nothing is pushed. The item picker and the condition picker ask the server when
opened; with nothing imported they say so and that the GM can import it. After
an import they find the content the next time they are opened. The GM's own
panels refresh at once.

## Testing
- `apps/server/src/contentImport.test.ts`: every state transition; one import at
  a time; a failing run and a failing reload becoming `failed` rather than a
  crash; each `explainFailure` sentence; `spawnImporter` against **real child
  processes** (success, a failure with its explained message and only the last
  eight lines kept, a timeout, a program that cannot start); and the reloadable
  compendium seeing content written after it was built, and replacing rather
  than adding.
- `apps/server/src/app.contentImport.test.ts`: the routes, including `403` for a
  player, an unknown device, no token, and no active campaign, and `409` while
  running.
- `apps/client/src/api/contentImport.test.ts` and
  `components/ContentImportPanel.test.ts`: the plain-words first-run box, the
  running state and its polling (stopped when finished and when the panel goes
  away), the failure sentence with details behind a disclosure, "Try again", and
  the folded loaded state.
- Run for real once (2026-09-30), end to end, against a live server with a fresh
  empty compendium directory: a GM seat claimed over the socket, `403` without
  one, `202` then `409`, a real download, and the compendium searchable
  afterwards without a restart.
