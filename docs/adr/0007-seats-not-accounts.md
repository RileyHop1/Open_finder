# 0007. Seats, not accounts: no authentication on a trusted network

- **Status:** Accepted
- **Date:** 2026-09-28
- **Supersedes:** the invite-link authentication sketch in an earlier CLAUDE.md draft

## Context
An earlier draft specified world-scoped users, GM-generated invite links, and
session cookies. That is the conventional design, and for this project it is the
wrong one.

The deployment is a GM running the server for a handful of friends, reached over a
LAN or a mesh VPN (ZeroTier, Tailscale). Everyone who can reach the port is
someone the GM invited to their game. There is no attacker in this model, and
building authentication for one costs roughly a week — password hashing, invite
token generation and redemption, session expiry and refresh, a reset path for when
someone loses access — all of it protecting against a threat that does not exist.

It also actively hurts the product. The north star is "as easy to pick up as a
video game," and a login screen is the single least game-like thing a piece of
software can open with.

But **identity cannot be dropped**, and this is the distinction the earlier draft
got right for the wrong reason. The permission model in CLAUDE.md — none /
limited / observer / owner — requires the server to know who is asking. Fog of
war, secret GM rolls, hidden creature HP, and GM-only journal pages are all
meaningless if every connection is anonymous. Drop identity and the GM's screen
becomes everyone's screen.

So: **authentication** (proving who you are) is removable. **Identity** (which
player am I) is not.

## Decision
**Named seats, no authentication.**

1. **The GM creates seats** when setting up the world: one per player, plus the GM
   seat. A seat has a name and optionally a portrait.
2. **On connect, you pick your seat from a list** — the way you claim a controller
   in couch co-op, or join a Jackbox room with a name. No password, no email, no
   invite redemption, no reset flow.
3. **Permissions attach to the seat**, not to an account. The document permission
   model is unchanged; only the subject it resolves against is simpler.
4. **A device token in `localStorage`** returns you to the same seat next session.
   Switching devices means picking your seat again, which needs no recovery
   mechanism because there is nothing to recover.
5. **The GM seat may carry an optional short PIN.** This is explicitly not
   security. It stops a player clicking "GM" out of curiosity and seeing the
   dungeon.
6. **The app is transport-agnostic.** No VPN detection, no ZeroTier-specific code,
   no Tailscale integration. Plain LAN, either mesh VPN, and "everyone is on the
   same wifi" all work identically because the app only ever binds to an
   interface.
7. **Bind to localhost by default, never `0.0.0.0`.** The README states plainly
   that this must not be port-forwarded to the open internet.

## Consequences
- **A week of work disappears**, and so does a whole category of support burden:
  forgotten passwords, expired invites, stale sessions.
- **Joining is better UX than it would have been with accounts**, not merely
  cheaper. Open the link, click your character's name, play. This is the
  Jackbox/couch-co-op pattern and it is the correct one for a game.
- **The security posture is explicitly "anyone who can reach the port is
  trusted."** Written down so nobody mistakes the absence of auth for an
  oversight. The localhost default and the README warning are the entire
  mitigation, and they are sufficient for the stated deployment — but this is a
  real, accepted limitation, not a solved problem.
- **Publishing this on the open internet requires a new ADR**, not a
  configuration change. It would need real authentication, and it is
  interdependent with the "hosted multi-tenant service" exclusion in Out of scope
  and with the single-process assumption in ADR 0002. Those three decisions move
  together or not at all.
- **Seat impersonation is possible by design.** A player can pick another
  player's seat. At a table of friends this is a social problem, not a technical
  one, and the GM can see who is connected to which seat.
- **Setup instructions become a real deliverable.** With no accounts, the hardest
  part of getting started is networking — which means the README's ZeroTier or
  Tailscale walkthrough is load-bearing product documentation, not an appendix.

## Alternatives considered
### World-scoped accounts with invite links (the earlier draft)
The conventional design, and what Foundry does. Rejected: roughly a week of work
to defend against an attacker who does not exist in this deployment, plus a login
screen that contradicts the north star. Foundry needs it because Foundry worlds
are frequently exposed to the internet; ours are not.

### No identity at all — everyone is anonymous
The logical endpoint of "accounts are too much," and genuinely simpler. Rejected
because it destroys the permission model. Without a subject there is no fog of
war, no secret GM roll, no hidden HP, and no GM screen. The GM stops being the
director, which is the one role the north star explicitly names.

### A single shared password for the whole world
A common middle ground for self-hosted apps. Rejected because it provides
authentication without identity — exactly backwards. It adds the friction of a
password while still leaving the server unable to tell the cleric from the GM.

### Delegate auth to the VPN layer (Tailscale identity headers)
Genuinely appealing: Tailscale can tell the app who the connecting user is, which
would give real identity for free. Rejected because it hard-couples the app to one
VPN vendor and breaks plain-LAN play entirely, which is the simplest and most
common case. Worth revisiting only if the transport-agnostic rule is ever dropped.
