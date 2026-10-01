# 0016. The GM imports the game content from inside the app

- **Status:** Accepted
- **Date:** 2026-09-30
- **Relates to:** ADR 0010 (the GM never opens a terminal), ADR 0011 (the
  importer pipeline), ADR 0015 (the compendium is loaded at startup), ADR 0003
  (rules data licensing)

## Context
The importer (ADR 0011) is a command: `pnpm --filter @hearthtable/pf2e run
import`. That was right while the importer was a maintainer's tool, but the
compendium it fills is not optional: without it the item picker, the condition
picker, and everything built on the rules data are empty. ADR 0010 made it a
binding requirement that the GM never types a command, and the first person to
test the app as a user (2026-09-30) hit exactly that wall: they did not know the
importer existed, and the documented command did not even work as written
(`pnpm import` is a built-in pnpm command, so `--filter ... import` without
`run` fails with "No lockfile found").

ADR 0015 also said the compendium is read once at startup, so even a successful
import needed a server restart to show.

## Decision
1. **The server can run the importer itself, on a GM's request.** `POST
   /api/compendium/import` starts it; `GET /api/compendium/import` reports
   `idle`, `running`, `done` (with the entry count), or `failed` (with a
   sentence a GM can act on and the technical detail behind it). Only the GM may
   start one (their device token resolves to a GM seat in the active world);
   the status is readable by every seat.
2. **It is the same importer, as a child process.** The server spawns the
   importer's own entry point (`systems/pf2e/src/importer/index.ts`) with the
   same pinned upstream commit and checksum, writing to the directory the
   compendium reads. A child process, not a function call: the importer reads
   tens of thousands of files synchronously, and doing that in the server's
   process would freeze every connected table for the duration.
3. **One import at a time.** A second request while one runs gets `409` and
   the current state. A failure leaves the previous content untouched (the
   importer writes at the end) and can be retried.
4. **The compendium reloads without a restart.** The app and the realtime layer
   hold a `ReloadableCompendium` that delegates to the most recently loaded
   index; a successful import calls `reload()`, which swaps a fully built index
   in. This replaces ADR 0015's "no hot reload" consequence.
5. **The UI is a button, written for someone who has never heard of an
   importer.** On a table with no content the GM sees it first, in plain words
   ("This table has no game content yet"), with the one thing to do. Once
   content is loaded it folds to a single line with a deliberate "Import
   again". The ORC attribution sits beside it.

## Consequences
- **A GM with Git installed and a network connection can set up with one
  click.** Git is needed because the fetch is a sparse `git` checkout of the
  pinned commit (ADR 0011). A missing Git, no network, and a checksum mismatch
  are each reported as a specific sentence, not a stack trace.
- **Players are not told.** If the GM has not imported, the item picker says so
  and that the GM can import it; there is no push to other clients when an
  import finishes (a panel that listed content looks again the next time it is
  opened, and the GM's own panels refresh at once).
- **Packaging is still open (ADR 0010).** The child process is `node --import
  tsx` run from the pf2e package, which is how every other part of the server
  runs today. A bundled, double-click install will need the importer built as
  its own entry point, and probably a bundled Git or a fetch that does not need
  one; that is the packaging decision's to make, and this ADR does not narrow it
  beyond naming the dependency.
- **The first import is a minute or two of downloading and converting** (54
  seconds in the first real run, on a fast connection). The
  table stays playable meanwhile; the panel says so and counts the seconds. There
  is no finer progress than "running": the importer is one pipeline and does not
  report stages.
- **Reloading blocks the server for about a second** (the load measured at 0.9s
  for 3,107 entries), once, at the end.
- **The server now spawns a process on a request.** The request is GM-only on a
  trusted network (ADR 0007), takes no arguments, and the command is fixed in
  `index.ts`, so nothing a client sends reaches the command line.

## Alternatives considered
### Keep the command-line importer and document it better
Zero new code. Rejected: it fails the one requirement ADR 0010 made binding, and
the evidence that a first-time tester does not find or read the docs is the
reason this ADR exists.

### Run the importer inside the server process
Simpler: a function call, no child process. Rejected: the importer is
synchronous and reads ~34,000 files, so it would stall every realtime
connection and every sync for its whole run. A table mid-session would freeze
because the GM pressed a button.

### Ship the imported data with the app
No download at all. Rejected by ADR 0003: the repository must never contain
Paizo content, and a released build is a distribution of it.

### Import automatically on first start
No button to press. Rejected: it is a download of tens of thousands of files
the user did not ask for, run on whatever machine and connection the
GM happens to have, with failures that have no screen to appear on. A
deliberate, visible action with a result is kinder, and it keeps "Import again"
the same code path.

### Reload by restarting the server
Matches ADR 0015 as written. Rejected: a restart drops every connected player
mid-session, which is the opposite of an action meant to be done once at the
start of a campaign by someone who may already have a table connected.
