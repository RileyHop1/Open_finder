# CLAUDE.md — Hearthtable (working name)

## What this is
A free, open-source, self-hostable virtual tabletop (VTT) for Pathfinder 2E.
Architecture and UX follow Foundry VTT's proven concepts (worlds, documents,
compendiums, system plugins), rebuilt from scratch. Goal: as easy to pick up
as a video game, with the rules handled for you, at no cost.

**"Hearthtable" is a placeholder**, used so that the package scope, database
filename, and Docker tag are not TBD. Renaming later is a pure-churn PR, so
the maintainer should confirm or replace it before milestone 0 ships.

## North star
**"If Owlcat made a Pathfinder 2E game, how would it feel?"** Use this to settle
any UX question. Owlcat's Kingmaker and Wrath of the Righteous are the design
reference (inspiration only: no copied assets, art, or UI graphics).
Owlcat patterns to borrow:
- **Party bar:** character portraits always on screen with HP and conditions
- **Action bar / hotbar:** strikes, spells, and actions as clickable icons,
  showing action cost (◆, ◆◆, ◆◆◆, reaction)
- **Combat log with breakdowns:** every roll in chat can be hovered to see
  exactly how it was calculated
- **Nested tooltips:** a tooltip term inside a tooltip can be hovered too
- **Encyclopedia:** a searchable in-game glossary that every rules term links to
- **Layered world:** global map → local areas → battles (see Game flow)
- **Game-style character creation and level-up** (see Player experience)

Key difference: Owlcat's games are single-player; this is a shared table.
The GM is the director and can always override the automation.

## Out of scope
Foundry's surface area is enormous and "stay small" only means something if the
exclusions are written down. These are things we are **not building at all**, as
distinct from the post-v1 work in Milestones. Adding one is a decision that
updates this section first.
- **Drawing and annotation tools** on the canvas
- **Macros and user scripting.** `Macro` stays in the document model as a
  reserved type but nothing executes it. The no-code trigger editor covers the
  real need
- **Third-party modules.** The hooks / event bus is internal-only; there is no
  module loader, no module registry, and no plugin trust boundary to get wrong
- **Other game systems.** The core engine stays system-agnostic by discipline,
  but `systems/pf2e` is the only system we ship or test
- **A hosted, multi-tenant service.** Self-host only, on a trusted network. This
  shapes real decisions — see Seats, ADR 0002, and ADR 0007 — so revisit it
  deliberately, not in passing
- **Positional ambient audio.** A shared playlist is in scope (post-v1); sounds
  placed on the map with distance falloff and wall occlusion is a spatial audio
  system tied to vision geometry, and is not worth it
- **Content outside the core four books**, and **variant rules.** See Content
  scope below — this is the scope boundary that keeps character building
  tractable

## Ground rules
- **Reimplement Foundry's ideas, never copy its code.** Foundry core is
  closed-source and commercial: no code, assets, or UI art from it.
- **Remaster only.** Content comes only from ORC-licensed Remaster material.
  No legacy/pre-Remaster rules. No Paizo trademarks or art. Ship the ORC notice
  and follow Paizo's Community Use Policy.
- **Project license: MIT.**
- **Stay small.** Every milestone must be usable at a real table.

## Content scope: the core four books
Remaster-only is a *licensing* boundary (ADR 0003). This is a tighter *scope*
boundary inside it, and it exists because character building is where PF2e gets
messy: every extra release multiplies the option space, the feat prerequisite
graph, and the number of edge-case interactions somebody has to rule on.

**We import from exactly four books:**
- **Player Core** — ancestries, backgrounds, and 8 classes (Bard, Cleric, Druid,
  Fighter, Ranger, Rogue, Witch, Wizard), spells, equipment
- **Player Core 2** — 8 more classes (Alchemist, Barbarian, Champion,
  Investigator, Monk, Oracle, Sorcerer, Swashbuckler)
- **GM Core** — hazards, items, GM-facing rules
- **Monster Core** — creatures

Everything else is excluded, including material that is ORC-licensed and that we
would therefore be *allowed* to ship. Notably:
- **Rage of Elements, and with it the Kineticist.** The Kineticist is the most
  automation-hostile class in the game — impulses, elemental gates, and a bespoke
  resource system that shares almost nothing with the rest of the rules engine
- **Howl of the Wild, Battlecry!, War of Immortals, Divine Mysteries** and later
  releases
- **Variant rules**, including Free Archetype, Dual-Class, and Automatic Bonus
  Progression. These change the shape of a character build, so supporting them
  means the creation wizard has more than one skeleton

Sixteen classes and one build skeleton is a scope a solo maintainer can actually
finish and test. This is enforced as a publication allow-list in the importer,
not as a convention — see `docs/adr/0006-content-scope-core-books.md`.

## Rulings and ambiguity
Even inside the core books there are interactions the community argues about, and
"the rules are handled for you" is a promise that has to survive those. The
policy:
- **Automate the unambiguous reading.** Most of the rules are not actually in
  dispute.
- **Where the rules are genuinely ambiguous, do not guess silently.** Implement
  the most common reading, and make sure the GM override path (see GM experience)
  is available on it. A wrong number the player trusts is worse than a visible
  gap or an adjustable one.
- **Record every judgment call in `docs/rulings.md`**: the interaction, the
  reading we implemented, the alternative, and why. This is cheap, and it stops
  the same argument being re-litigated in three separate issues.
- **Golden tests encode our chosen reading**, so a "fix" that quietly changes a
  ruling shows up as a failing golden value rather than as a silent behavior
  change months later.

## Rules data
Source: the community `foundryvtt/pf2e` repo's `packs/` JSON.
- Its code is Apache-2.0 (compatible with MIT, keep attribution and NOTICE).
  Its game content is covered by Paizo's agreement *with Foundry*, which does
  not extend to us. So we only import entries whose source is a Remaster
  (ORC) book, and we never import its art (separately licensed)
- **Never commit Paizo content to this repo.** The importer downloads the
  pinned upstream `packs/` at setup time and writes converted data to
  git-ignored folders: `systems/pf2e/.data/upstream/` for the download and
  `systems/pf2e/.data/imported/` for our converted output, alongside
  `worlds/` for user data. CI fails if any of them becomes tracked, because
  `.gitignore` cannot stop `git add -f` and history is permanent. The repo
  contains only our MIT code, schemas, and test fixtures written by us
- An importer script in `systems/pf2e/importer` converts Foundry-shaped JSON
  into our own Zod-validated schemas. Our data model must not depend on
  Foundry's format
- The importer applies **two filters**: the license filter (ORC/Remaster, ADR
  0003) and the scope filter (the core four books, ADR 0006). It strips art and
  records source + license on every entry
- **Excluded content is excluded whole.** If an entry's rules depend on something
  we did not import, drop the entry rather than strip the reference: silently
  removing a link can change what a feat does
- Pin the upstream commit **and a checksum of the downloaded packs** — upstream
  can force-push or delete a ref, and a silent content change would move golden
  values without any diff in this repo. Re-importing is a deliberate,
  reviewed PR
- See `docs/adr/0003-rules-data-licensing.md` (not legal advice; must be
  revisited before the project is shared publicly)

## Stack
- TypeScript everywhere, pnpm workspaces monorepo
- Server: Node + Fastify, Socket.IO for realtime sync
- Client: Vue 3 (Composition API, `<script setup lang="ts">`) + Vite,
  Pinia for state, PixiJS for the map canvas. **Pin PixiJS's major version**;
  v7 → v8 was a substantial break and the canvas is the hardest thing to port
- Web app only: TypeScript on both front and back end
- Storage: **SQLite** (`better-sqlite3`, synchronous, no connection pool). One
  database file per world, living in that world's folder, with document bodies
  in JSON columns. Runs as a single Node process; a Docker image is a
  convenience, not a requirement. See `docs/adr/0002-storage-sqlite.md`
- Assets (maps, portraits, audio): stored on disk in the world folder, no
  size limit. This is a table for friends, not a public service
- Validation: Zod schemas shared between client and server
- Tests: Vitest (unit), Playwright (e2e)

## Targets and budgets
Stated so that "it feels slow" and "it doesn't work on my tablet" are testable
claims rather than opinions.

- **Canvas:** 100 tokens on an 8000×8000 map, panning and zooming at 60fps on a
  five-year-old laptop with integrated graphics. A PR that regresses this is a
  bug, not a trade-off
- **Sheet:** a full character sheet opens in under 200ms, including resolving
  every statistic through the modifier resolver (ADR 0008)
- **Sync:** a token move is visible to other clients in under 100ms on a LAN
- **Browsers:** current Chrome, Edge, Firefox, and Safari. WebGL2 required — it
  is what PixiJS needs, and it rules out nothing anyone is realistically using
- **Tablets are supported, phones are not.** A player with an iPad at the table
  is a real use case: every tooltip works on tap, touch targets are at least
  44px, and the sheet and party bar are usable at 1024px wide. The GM tools and
  the canvas assume a pointer and a keyboard, and a phone-sized layout is not
  supported in v1

## World folder layout
One folder per world, and it is the unit of backup, export, and "move this to
another machine." Nothing about a world lives outside it.
```
worlds/<world-id>/
  world.db          # SQLite, one file (ADR 0002)
  world.json        # id, name, schemaVersion, created/updated
  assets/
    <hash>.<ext>    # content-addressed; dedupe falls out of this
  snapshots/
    <timestamp>.db  # periodic, plus one before every migration
```
Assets are content-addressed so the export archive dedupes for free (see Data
durability) and so the same map used in three scenes is stored once.

## Saving
- Every change is saved to the world database as it happens; there's no "save"
  button to forget
- **World export/import:** one archive (JSON + assets) for backups or
  moving a campaign to another machine
- Automatic periodic snapshots, with a GM "restore snapshot" option

## Data durability
A campaign is dozens of hours of someone's prep. These are the mechanics that
make "it just saves" trustworthy, and they land in **milestone 1** — retrofitting
migrations later means hand-patching real campaigns.
- **`schemaVersion` on every document**, plus a migration runner that runs on
  world open. Migrations are forward-only and numbered. Each one ships with a
  test that loads a fixture at version N and asserts the shape at N+1
- **Snapshot before every migration**, in addition to the periodic snapshots
- **The export archive streams.** Assets are explicitly unbounded, so never
  build the archive in memory, and dedupe assets by content hash

## Testing
- Unit tests for all rules math (dice, modifiers, degrees of success)
- **Golden tests:** a set of reference characters and creatures with
  known-correct stats (AC, saves, skills, strikes). Any change that shifts
  a golden value fails CI until reviewed. Add a golden case with every rules fix
- **Golden fixtures are ours, and that constrains them.** A published creature's
  AC and attack lines are Paizo content, so committing them to a public repo
  would break the "never commit Paizo content" rule. Therefore: golden
  *characters* are built by us by applying the rules, and golden *creatures* are
  our own invented monsters with hand-computed stats. Never paste a stat block
  from the compendium into a fixture
- **Cover one character of each class** in the golden set. Sixteen classes is a
  small enough number to do this exhaustively, and it is the cheapest possible
  guard against a modifier change breaking one class's math quietly
- CI runs the importer (cached by upstream commit) before golden tests
- Playwright e2e for core flows (login, roll, combat turn)

## Accessibility
- Full keyboard navigation: every action reachable without a mouse,
  visible focus, and hotkeys for common actions (end turn, roll, open sheet)
- Condition and status icons never rely on color alone
- **Drag-and-drop is never the only way.** The GM tools lean on dragging
  (see GM experience); every draggable interaction ships a keyboard or
  context-menu equivalent **in the same PR**, not as a follow-up

## Architecture (Foundry-inspired)
- **Core engine is system-agnostic.** PF2e lives in `systems/pf2e` as a
  plugin, the same way Foundry separates core from game systems.
- **Everything is a Document** (typed JSON data) that belongs to a World:
  - `Actor`: PC, NPC, hazard
  - `Item`: weapon, armor, spell, feat, condition, etc.
  - `Party`: the adventuring group — its members, shared inventory, and the
    party level the encounter builder budgets against. First-class, because the
    party bar, the overworld marker, and shared travel all need one. Without it
    these become flags scattered across `Actor` and `Scene`
  - `JournalEntry`: campaign notes, made of pages (text, image)
  - `Scene`: map, grid, tokens, walls, light sources
  - `Combat`: encounter and initiative tracker
  - `ChatMessage`: rolls, item cards, messages. **Stores structured roll data,
    never a rendered string.** The hoverable combat-log breakdowns in the north
    star are a view over that structure, so a message persisted as
    `"Riley rolled 17"` can never be un-flattened — and by the time the
    breakdowns are built in milestone 6, every message already in a campaign
    would be dead history. This is settled in milestone 1, where it is free.
    See `docs/dice.md`
  - `Calendar`: the in-game date and time, and the rules for advancing it.
    Shared by overworld travel, downtime, and condition durations — one owner,
    so it does not get invented twice
  - `RollTable`; `Playlist` (post-v1, a plain shared track list); `Macro`
    reserved but never executed (see Out of scope)
- **Compendiums:** read-only document packs (bestiary, spells, equipment)
  that can be imported into a world.
- **Permissions per document:** none / limited / observer / owner. GM sees all.
  Permissions attach to a **seat**, not an account — see below.
- **Document links:** `@UUID[...]` style references that render as clickable links.
- **Hooks / event bus** for internal decoupling only; no third-party modules.

### Seats, not accounts
There is no authentication. This app is served on a trusted network — a LAN, or a
mesh VPN like ZeroTier or Tailscale for remote friends — and anyone who can reach
it is a welcome player. Building accounts for that would be a week of work
protecting against an attacker who does not exist. See
`docs/adr/0007-seats-not-accounts.md`.

What we *do* need is **identity**, because the permission model depends on it:
fog of war, secret GM rolls, hidden creature HP, and GM-only journal pages all
require the server to know who is asking.

- The GM creates named **seats** when setting up the world — one per player, plus
  the GM seat.
- On connect you **pick your seat from a list**, the way you claim a controller
  in couch co-op or join a Jackbox room. No password, no email, no invite
  redemption, no reset flow.
- The server stores a device token in `localStorage` so you return to the same
  seat next session. Switching devices just means picking your seat again.
- The GM seat may carry an optional short PIN. That is not security; it stops
  someone clicking "GM" by accident and seeing the dungeon.
- **The app stays transport-agnostic.** No VPN detection, no ZeroTier-specific
  code. Plain LAN, ZeroTier, Tailscale, and "everyone's on the same wifi" all
  work identically.
- **Bind to localhost by default, never `0.0.0.0`.** The README says plainly not
  to port-forward this to the open internet. That warning is the entire
  mitigation, and it is sufficient for the stated deployment.

### Concurrency
"Server is authoritative" is the load-bearing rule, so the model is explicit.
See `docs/adr/0005-concurrency.md`.
- **Clients send operations, not documents.** The server validates the operation
  against the Zod schema, applies it inside a transaction, assigns a monotonic
  sequence number, and broadcasts the result.
- **Clients may apply optimistically and must reconcile.** On rejection, roll
  back to the last server-confirmed state. A client never silently diverges.
- **Last-write-wins per field is fine for v1.** Stated so that nobody builds
  CRDTs or operational transforms for a table of five friends.
- **Token movement is the hot path** and gets its own throttled operation type
  rather than going through generic document updates.

### Rule elements
Rules automation is data-driven: "rule elements" on items add modifiers, apply
conditions, change damage. Never hardcode logic per feat. This is the highest-risk
decision in the project — see `docs/adr/0004-rule-elements.md`.
- We define **our own** rule-element schema in `packages/core`. The importer maps
  upstream types onto it.
- **v1 supports a subset:** flat modifiers, damage dice, roll options, granted
  items, and choice sets. That subset covers most of what a table hits.
- **Unsupported automation imports inert and flagged on the sheet**, so the GM
  can apply it by hand. Never silently dropped, and never silently wrong — a
  wrong number the player trusts is worse than a visible gap.
- The importer emits a coverage report of every element dropped or downgraded.
  With the scope narrowed to four books, that report is small enough to read
  entry by entry, which is what makes the subset choice verifiable.

## Game flow (Owlcat Pathfinder-style)
The feel we're after is Owlcat's Kingmaker / Wrath of the Righteous: players
move through a layered world instead of the GM swapping unrelated maps.
Scenes have a `kind` and link to each other:
- **Overworld map:** region map with location nodes and paths. The party
  travels as one marker; travel uses PF2e exploration-mode speed, advances
  the in-game clock, and can fire events (random encounters, discoveries)
- **Area map:** an explorable location (town, dungeon, forest clearing).
  Tokens move freely; exits link back to the overworld or to other areas
- **Battle map:** a gridded encounter scene, opened from an area (or an
  overworld event) when combat starts; hands off to the combat tracker and
  returns the party to where they were when combat ends
- **Downtime:** not a map but a mode, used in towns or between adventures.
  Players pick downtime activities (Craft, Earn Income, Retrain, etc.), the
  GM sets how many days pass, and the app resolves rolls, advances the
  in-game clock, and logs results to the journal
- The GM controls transitions, but players see them as smooth moves between
  layers, not "the GM loaded a new scene"

## Player experience (guiding principle)
The rules should teach themselves, the way they do in a video game.
- **Hover to learn:** any rules term (conditions like *dazzled* or *frightened*,
  traits, actions, spells, feats) shows its rules text in a tooltip on hover or
  tap. Terms are auto-linked wherever they appear: sheets, item cards, chat,
  journals. Text comes from the ORC-licensed compendium data
- **Character building and level-ups feel like a game:** a step-by-step
  wizard (ancestry → background → class → ...) with art slots, clear previews
  of what each choice gives, only valid options shown, and prerequisites
  explained instead of hidden. Level-up highlights exactly what's new and
  what needs a choice
- **Show the math:** click any number (AC, a skill bonus, a roll) to see
  the breakdown of where each modifier comes from

## GM experience (guiding principle)
Building a campaign should feel like using a game editor, not configuring software.
Every GM feature is judged by "could a first-time GM figure this out without docs?"
- **Prep mode vs play mode:** prep mode is for building; play mode shows only
  what's needed at the table
- **Campaign outline:** a tree of chapters → overworld → areas → encounters,
  NPCs, and events that mirrors the map layers; click any node to open it
- **Drag-and-drop everywhere:** drop a monster onto a map, a map onto the
  overworld, an NPC into a journal page to link it (with keyboard equivalents —
  see Accessibility)
- **Quick-create and templates:** "new town", "new dungeon", "new encounter"
  scaffolds with sensible defaults
- **No-code events:** a visual "when X, then Y" trigger editor; scripting
  stays optional for power users
- **Override the automation.** The north star promises the GM is the director,
  which is a cross-cutting UI requirement, not a feature: every automated roll,
  damage application, and condition change has a visible manual path — adjust
  the result, re-roll, or set the value directly. Build it alongside each piece
  of automation, never after. This is also how ambiguous rulings stay survivable
- **Undo/redo in prep mode**, GM-only, implemented as a command log. Deliberately
  *not* offered in play mode: undoing one client's action on a live shared table,
  after other people have acted on it, is a much harder problem than it looks

## Repo layout
```
apps/server      # Fastify + Socket.IO, persistence, seats
apps/client      # Vue UI + PixiJS canvas
packages/core    # document model, schemas, permissions, shared types
packages/dice    # dice parser and roller (e.g. 2d6+4, 1d20+@mod)
systems/pf2e     # PF2e rules, sheets, rule elements, compendium data
docs/            # design notes and specs (see docs/README.md)
docs/adr/        # Architecture Decision Records (why we chose X)
docs/rulings.md  # every rules judgment call, and why
```

## Milestones
Milestones are **goals, not PRs.** Each one is split into many small PRs
(see "Pull requests" below). Before starting a milestone, write its PR
breakdown as a checklist in a GitHub issue and get it approved.

**v1's goal is a playable game**: a table can sit down, make characters, put
tokens on a map, and run a full session with the rules handled. Everything that
is not required for that is post-v1 — valuable, planned, but not blocking a first
real session.

### v1 — playable
0. **Repo setup (no app code, 3–4 PRs):** (a) pnpm workspaces, strict tsconfig,
   ESLint + Prettier, Vitest wired up; (b) GitHub Actions CI (lint, typecheck,
   test, build on every PR); (c) PR template, issue templates, CONTRIBUTING.md;
   (d) MIT LICENSE, docs/ skeleton, first ADRs. One PR for all of this would be
   over a thousand lines and would break the rule below it
1. **Skeleton:** create a world, seats and seat selection, realtime sync, SQLite
   persistence **with `schemaVersion` and the migration runner**, chat with dice
   rolls, world export/import
2. **Rules data:** Remaster importer with the license and core-four-books
   filters, our own schemas, golden test set, coverage report for unmapped rule
   elements
3. **Character sheet:** attributes, proficiency, skills, strikes, conditions;
   `Party` document and the party bar (portraits, HP, conditions). Editable
   enough to hand-build a character, because milestone 5 is not here yet
4. **Scenes:** map upload, grid, tokens, movement, scene `kind`
   (overworld / area / battle) and links between scenes
5. **Combat tracker:** initiative, turns, three-action economy, MAP, condition
   durations, area templates (cone / burst / emanation / line), action bar
   — **first real playtest is possible here**, with hand-built characters
6. **Learn as you play:** rules tooltips, nested tooltips, encyclopedia,
   modifier breakdowns on every number. Before the wizard on purpose: the wizard
   uses this system to explain prerequisites
7. **Character creation and level-up:** the step-by-step wizard, staged by how
   hard each class is to automate rather than by book:
   - (a) **wizard skeleton + the 7 martial classes** — Fighter, Ranger, Rogue,
     Barbarian, Investigator, Monk, Swashbuckler. Feat picks and proficiencies,
     no resource subsystem. This stage proves the flow
   - (b) **spellcasting + the 7 casters** — Bard, Cleric, Druid, Witch, Wizard,
     Oracle, Sorcerer. The expensive half: slots by rank, prepared vs.
     spontaneous, signature spells, focus points, the Wizard's curriculum, the
     Witch's familiar. Its own PR stack, not a bullet inside "casters"
   - (c) **the 2 bespoke classes** — Alchemist (reagents and advanced alchemy)
     and Champion (focus spells, reaction, aura). Each is a small subsystem of
     its own, so they come after the general machinery exists
   - (d) **level-up**, which reuses every choice component the wizard built
   — **v1 ships here**

### post-v1
8. **Walls and sight:** walls block movement and line of sight, per-token
   vision, fog of war
9. **Lighting:** light sources, darkvision and low-light vision, concealment
   from dim light. Directly after walls, because lighting *is* vision in PF2e
   and the geometry from milestone 8 is most of the work
10. **Journal:** campaign notes with rich text, pages, permissions, doc links
11. **Audio:** a shared playlist — tracks, volume, loop, synced play/pause over
    the existing operation channel. Small by design; see Out of scope
12. **Encounter builder:** XP budget by party level, bestiary compendium
13. **Overworld travel:** party marker, travel time, the `Calendar` clock, and
    area ↔ battle map handoff
14. **Downtime:** activity picker, day counter, roll resolution, journal log
15. **Events and triggers:** scripted or branching campaign events (our
    differentiator)
16. **Campaign builder:** prep/play modes, campaign outline tree, templates,
    visual trigger editor, prep-mode undo/redo, polish pass on all GM tools

### Definition of done
"Usable at a real table" is the bar; this is the checklist. A milestone is not
done until every line is true:
- [ ] The feature works end to end for a GM and a player in two browsers
- [ ] Unit tests for all new rules math; **golden cases added or updated**
- [ ] Playwright e2e covers the milestone's primary flow
- [ ] Every new interaction is reachable by keyboard, with visible focus
- [ ] Every automated result has a GM override path
- [ ] `docs/` updated in the same PRs as the code; ADR written if a real
      alternative was rejected; `docs/rulings.md` updated if a judgment was made
- [ ] Nothing regresses the budgets in Targets and budgets
- [ ] Played through once at an actual table, or with two browser windows and
      an honest attempt to break it

## Development order
**Vertical slices, backend-leading.** Not a backend phase followed by a frontend
phase — the milestones above are each a slice through the whole stack.

- **Backend leads within a milestone, not across the project.** Every milestone's
  PR stack runs schema → server → UI, so nothing is ever built against a data
  shape that might still move.
- **Thin thread first.** Milestone 1 builds the entire stack as thin as it will
  ever be: one document type, one operation, one screen. Chat with a dice roll
  exercises Zod schema → SQLite write → operation dispatch → sequence number →
  broadcast → Pinia store → DOM. Prove that plumbing on the simplest possible
  payload before a rules engine sits on top of it.
- **Some work is legitimately backend-only and can be front-loaded freely**,
  because tests are its entire feedback loop: `packages/dice`, the migration
  runner, the importer (milestone 2), and the rules math. Milestone 2 renders
  nothing, and that is correct — golden tests tell you whether a +7 Athletics
  bonus is right far better than looking at it does.
- **Where the UI is the product, stop front-loading.** The character sheet,
  scenes, and the combat tracker are milestones whose deliverable *is* the
  interface. Modifier breakdowns, nested tooltips, and the action bar cannot be
  validated by a test asserting a number.
- **Grow the operation vocabulary per slice.** Each milestone adds the operations
  its UI actually needs, and no more. A speculative operation nobody calls is
  dead code that still has to be maintained and migrated; and which operations
  are needed is genuinely discovered by building the UI (token drag coalescing
  is the obvious case). Accept the churn early, while it is cheap. See
  `docs/adr/0005-concurrency.md`.
- **Spike the canvas in the first week or two.** A throwaway branch: load a map
  image, draw a grid, drag a sprite, then delete it. No milestone, no PR. PixiJS
  is the largest unknown in the stack and it is entirely frontend, so a
  backend-leading order would otherwise retire the biggest risk last. If it turns
  out to be the wrong choice, better to learn that before ADR 0001 has a year of
  code behind it.
- **No milestone ships without something a table can see.** This is the "usable at
  a real table" ground rule applied to sequencing. If a milestone's output is
  invisible, it is either a package (fine, see above) or it is mis-scoped.

## TypeScript
- `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`
- No `any`, no `@ts-ignore`. If truly unavoidable, use `@ts-expect-error`
  with a comment explaining why. Expect to need it where Socket.IO and PixiJS
  meet `exactOptionalPropertyTypes`
- Every document type has a Zod schema in `packages/core`; types are
  inferred from the schema, not written twice

## Pull requests (the most important rule)
The maintainer reviews every PR by hand, so PRs must be easy to read in one sitting.
- **One branch = one PR = one concern.** No drive-by refactors or bundled fixes
- **Target under ~300 changed lines** (excluding lockfiles and generated files).
  If a feature is bigger, split it into a stack of PRs: schema → server → UI,
  in that order (see Development order)
- Branch names: `type/short-description` (`feat/dice-parser`, `fix/initiative-tie`,
  `docs/journal-model`, `chore/ci-cache`)
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`)
- Every PR description uses the template: **What / Why / How to review
  (which files to read first) / How to test**
- CI must be green before review. Tests ship in the same PR as the code
- When unsure how to split work, propose the PR breakdown first and wait for approval

## Documentation
- Every exported function, type, and class gets a TSDoc comment
- Each package has a README: what it does, how to use it, how it fits the whole
- `docs/` has one page per document type (fields, permissions, examples) and one
  per cross-cutting system: `dice.md`, `conditions.md`, `action-economy.md`,
  `grid.md`. Specs live there, not in CLAUDE.md, which stays a charter
- Significant decisions get an ADR in `docs/adr/` (context, decision, consequences,
  **and at least one rejected alternative with the reason**). An ADR with no
  alternatives is an assertion, not a decision
- Rules judgment calls go in `docs/rulings.md`, not in code comments where nobody
  will find them
- Docs are updated in the same PR as the code they describe

## Open questions
- Confirm or replace the working name "Hearthtable"
- ZeroTier or Tailscale in the setup docs? The app does not care, but the README
  should walk through one of them concretely rather than both vaguely
- Which rule-element types beyond the v1 subset are worth the cost? Answer with
  the importer's coverage report from milestone 2, not by guessing
- Does the golden set need a character at every level, or is level 1 / 5 / 11 / 17
  enough to catch proficiency and scaling bugs?
