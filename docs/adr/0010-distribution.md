# 0010. Distribution: the GM never opens a terminal

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
The charter's original Stack section said "Web app only," meaning: someone runs
the server process, everyone else opens a browser tab. It never said how the
*server* gets started, and the working assumption up to milestone 0 was that
this is a `pnpm install && pnpm start` problem — fine for a developer, but not
for the actual target user ADR 0007 already committed to: a GM self-hosting for
a table of friends, with no accounts and no IT department.

Milestone 1 planning surfaced the real user story directly:

> GM opens the app and sees their campaigns. They pick one and it's live.
> Players open the app on the same network and land in its lobby.

"Opens the app" is doing real work in that sentence. It means a person who has
never used a terminal, on a machine that has never had Node installed,
double-clicks something and the game is running. That is a materially stronger
requirement than "web app only" as originally written, and it was never decided
or recorded — it was simply assumed away.

This is not a contradiction of "self-host only, on a trusted network" (the
exclusion in CLAUDE.md's Out of scope section) or of ADR 0007's seats-not-
accounts model. Both already assume the GM's own machine is the one running the
process. What is new here is a requirement on *how that process starts*.

## Decision
**The GM must be able to start the app by double-clicking something. No
terminal, no `npm install`, no command ever typed, for the GM.**

This is a binding product requirement, effective now, but **the packaging
mechanism is deliberately not chosen in this ADR.** Nothing in milestone 1 or 2
requires picking one, and ADR 0009's removal of the native `better-sqlite3`
dependency was specifically to keep the real options open rather than
narrowing early to whichever mechanism tolerates native modules most easily.

Candidate mechanisms, for the milestone that does choose one:

| Mechanism | Shape | Rough cost |
|---|---|---|
| Shortcut/`.bat` over an existing Node install | Double-click runs `node server.js` and opens a browser tab | Lowest, but still requires Node installed separately — arguably still "IT-department" territory |
| Installer bundling a portable Node runtime | NSIS/Inno Setup-style installer; Start Menu shortcut launches server + browser | Moderate; well-trodden path (Electron-less apps do this) |
| Node Single Executable Application (SEA) | One `.exe`/binary, nothing else installed | Moderate, viable now that the dependency tree has no native modules (ADR 0009) |
| Tauri or Electron | A real desktop window instead of a browser tab; can embed the server | Highest; changes the client's relationship to the browser and adds a second toolchain (Rust, for Tauri) |

## Consequences
- **This is now a real acceptance criterion**, not an implicit assumption. A
  milestone that claims to be "usable at a real table" for a non-technical GM
  is not done if starting it still requires a terminal.
- **Nothing in milestones 1–2 is blocked.** The server is a plain Fastify +
  Socket.IO process regardless of how it's eventually launched; deferring the
  packaging decision costs nothing today.
- **It does constrain milestones 1–2's dependency choices going forward.** Any
  future dependency that reintroduces a native module (the way `better-sqlite3`
  would have) should be weighed against this requirement explicitly, not added
  by default. ADR 0009 is the first decision shaped by this one.
- **The chosen mechanism will need its own ADR** when a milestone actually picks
  it — most likely around the point v1 is feature-complete enough to give to a
  real GM for the first time. That ADR should revisit this table with real
  build-size and auto-update considerations, neither of which matters yet.
- **The Stack section's "Web app only" line is amended** (this PR) to describe
  the architecture (a web app, browser-rendered UI, HTTP/WebSocket transport)
  separately from distribution (a packaged launcher), since those had been
  conflated into a single, now-inaccurate phrase.

## Alternatives considered
### Decide the mechanism now
Would give every subsequent PR a concrete packaging target to build against.
Rejected: no milestone before the packaging milestone itself has any use for
that decision, and committing early risks optimizing PRs 1–15 around packaging
constraints (bundle size, asset paths, single-binary filesystem access) that
may not even apply to whichever mechanism actually gets chosen.

### Commit to Tauri immediately
Most directly matches "double-click, real app window" and would let the client
embed server startup entirely. Rejected for now: it's the largest change on the
table (a second toolchain, a different relationship between the UI and the
transport layer), and nothing currently blocks the decision — see ADR 0009,
which exists specifically to avoid foreclosing this option by accident via an
unrelated dependency choice.

### Say nothing and let it stay implicit
The status quo before this ADR. Rejected: an unrecorded assumption is exactly
how a project ends up with a native dependency, a bespoke asset-loading
convention, or some other early decision that quietly makes every packaging
mechanism except one impossible, without anyone having chosen that mechanism on
purpose.
