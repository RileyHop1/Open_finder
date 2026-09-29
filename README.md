# Hearthtable

A free, open-source, self-hostable virtual tabletop for **Pathfinder 2E**.

The goal: as easy to pick up as a video game, with the rules handled for you, at
no cost. The design question we use to settle arguments is *"if Owlcat made a
Pathfinder 2E game, how would it feel?"*

> **Status: pre-alpha.** The server runs and has a world-management API; the
> client can list, create, and activate campaigns, but there is no lobby yet
> and no way to join a seat, so there is still nothing to actually play with
> at a table. See [CLAUDE.md](CLAUDE.md) for what is being built and
> [docs/](docs/) for how.

## Requirements

- **Node 24+** (see [.nvmrc](.nvmrc))
- **pnpm** — `corepack enable`, or `npm install -g pnpm`

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm test
```

To run the server (see [apps/server/README.md](apps/server/README.md)):

```bash
pnpm --filter @hearthtable/server dev
```

And the client, in another terminal (see [apps/client/README.md](apps/client/README.md) —
the campaign screen is the only real one so far; there is no lobby yet):

```bash
pnpm --filter @hearthtable/client dev
```

## Running it for your table

This is **self-hosted software for a group of friends**. One person — usually
the GM — runs the server, and everyone else connects to it.

There are **no accounts**. When you connect, you pick your seat from a list, the
way you claim a controller in couch co-op. The GM creates the seats when setting
up the world. See [docs/adr/0007-seats-not-accounts.md](docs/adr/0007-seats-not-accounts.md)
for why.

### Everyone in the same room

Nothing to configure. The server binds to localhost by default; point it at your
LAN interface and share the address.

### Players in different places

Put everyone on the same virtual network, then treat it exactly like a LAN.
Either of these works, and the app does not care which you use:

- **[Tailscale](https://tailscale.com)** — WireGuard-based, generally the least
  fiddly to set up, and MagicDNS gives you a hostname instead of an IP to
  remember.
- **[ZeroTier](https://zerotier.com)** — a virtual LAN; does not require an
  identity provider.

Install on every player's machine, join the same network, and the GM shares
their address on it.

> ### Do not port-forward this to the open internet
>
> There is no authentication. Anyone who can reach the port can join your game,
> take any seat, and see everything the GM sees. That is a deliberate trade —
> it is the right design for a private table on a trusted network, and the wrong
> design for anything exposed publicly.

## Licensing

- **Our code is MIT.** See [LICENSE](LICENSE).
- **We ship no Paizo content in this repository.** Rules data is downloaded and
  converted at setup time into a git-ignored folder, and only from ORC-licensed
  Remaster material. CI fails if any of it is ever committed.
- Upstream attribution is in [NOTICE](NOTICE); the ORC requirements are in
  [ORC_NOTICE.md](ORC_NOTICE.md).

Read [docs/adr/0003-rules-data-licensing.md](docs/adr/0003-rules-data-licensing.md)
before touching the importer.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs are reviewed by hand, so they are
kept small on purpose.
