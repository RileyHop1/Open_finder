/**
 * The reference book's pages (milestone 6, `docs/rules-reference.md`):
 * short, hand-written prose covering mechanics a new player needs that no
 * single compendium entry explains on its own. Written in our own words,
 * never upstream's text, so nothing here is licensing-sensitive (ADR 0003)
 * -- the whole point of the reference book, distinct from the imported
 * tooltips a condition or action already gets.
 *
 * Checked against <https://2e.aonprd.com> while writing (2026-10-04 for the
 * first four pages, 2026-10-05 for the rest); a sentence this project
 * couldn't verify there carries its own **(confirm)** marker instead of a
 * silent guess. The hit-points/dying/recovery page marks its *whole* body
 * (confirm), matching `dyingChain.ts`'s own module doc, which already
 * admits those numbers were written from memory and never checked against
 * Archives of Nethys -- this page repeats the same ruling, not a separately
 * verified one. The spellcasting-basics page is similar: milestone 8(b)
 * hasn't built spellcasting yet, so there is no in-repo math to check this
 * page's prose against, and it stays at the conceptual level accordingly.
 *
 * Parsed once at module load, not per request: a page's `RichText` never
 * changes while the server runs, the same reasoning the compendium's own
 * in-memory index (ADR 0015) uses for imported content.
 */

import type { RichText } from '@hearthtable/core';

import { parseBookPage } from './bookPageParser.js';

export interface BookPage {
  readonly slug: string;
  readonly title: string;
  readonly text: RichText;
}

function page(slug: string, title: string, markdown: string): BookPage {
  return { slug, title, text: parseBookPage(markdown) };
}

const YOUR_TURN = page(
  'your-turn',
  'Your turn and the three actions',
  `
On your turn in combat, you get **three actions** and one reaction. Spend
them on anything your character can do that costs an action: {action:stride}
to move, {action:strike} to attack, {action:interact} to pick something up
or open a door, or a spell, feat, or class feature with its own action cost.

Most single actions cost one of your three; a few cost two or three at once,
and some spells and feats cost a **reaction** instead, which you spend
outside your own turn when its trigger happens. Unspent actions don't carry
over -- what you don't use on your turn is lost, not banked for later.

A few of the actions every creature can take, regardless of class:

- {action:stride} -- move up to your Speed.
- {action:strike} -- attack with a weapon or an unarmed attack.
- {action:step} -- move 5 feet without provoking a reaction.
- {action:interact} -- manipulate an object: draw a weapon, open a door, or pick something up.
- {action:ready} -- prepare an action to trigger later this round, as a reaction.
- {action:delay} -- hold your turn's actions for later this round, for free.

Each is also on the action bar at the table, showing its action cost as one
or more ◆ (or a reaction icon), the same symbol the game books use.
`,
);

const CHECKS_AND_DEGREES_OF_SUCCESS = page(
  'checks-and-degrees-of-success',
  'Checks and degrees of success',
  `
Almost everything you roll in Pathfinder -- an attack, a skill, a saving
throw -- is a **check**: roll a d20, add your relevant modifiers, and
compare the total to a target number called the **DC** (difficulty class).
A higher total is better.

The comparison has four possible outcomes, not just pass or fail:

1. **Critical success** -- your total beats the DC by 10 or more.
2. **Success** -- your total meets or beats the DC.
3. **Failure** -- your total is below the DC.
4. **Critical failure** -- your total is 10 or more below the DC.

Rolling a natural 20 on the die improves your result by one degree (a
success becomes a critical success); rolling a natural 1 worsens it by one
degree (a success becomes a failure) -- in both cases **after** the DC
comparison above, not instead of it.

A critical success on an attack usually deals double damage; a critical
failure on a saving throw against a harmful effect usually means it hits you
at full strength or worse. Each check's own rules say exactly what each
degree means for it.
`,
);

const MULTIPLE_ATTACK_PENALTY = page(
  'multiple-attack-penalty',
  'Multiple Attack Penalty',
  `
Attacking more than once on your turn gets harder each time. Your second
attack of the turn takes a **-5** penalty, and your third (and every attack
after that) takes a **-10** penalty, whether or not the earlier attacks hit.

A weapon or unarmed attack with the {trait:agile} trait halves those
penalties: **-4** on the second attack, **-8** on the third and later --
rounded in your favor, same as every other PF2e penalty.

The penalty resets at the start of your turn. It only applies to attack
rolls, never to other checks you make on the same turn, and it's tracked
separately for each creature you're in control of (an NPC's own strikes
don't share a count with your character's).
`,
);

const PROFICIENCY = page(
  'proficiency',
  'Proficiency',
  `
Every skill, saving throw, attack, and other rollable statistic has a
**proficiency rank**: untrained, trained, expert, master, or legendary, from
worst to best. A rank contributes a flat bonus on top of your level:

- Untrained: **+0**, and it never improves with level.
- Trained: **+2** plus your level.
- Expert: **+4** plus your level.
- Master: **+6** plus your level.
- Legendary: **+8** plus your level.

**Untrained is the one exception that doesn't add your level** -- a level 10
untrained skill is still a flat +0, not +10. Every other rank keeps scaling
with level for as long as you hold it. This is the Remaster's standard
proficiency math: a table using the optional Proficiency Without Level
variant, which this project doesn't support, uses a different progression
entirely.

Training a skill, weapon group, or saving throw up a rank is almost always a
class feature or a general feat you choose at a level-up -- it isn't
something you do mid-session.
`,
);

const MOVEMENT_AND_STRIDE = page(
  'movement-and-stride',
  'Movement and Stride',
  `
{action:stride} is how you move on your own turn: one action lets you move up
to your Speed, the distance in feet your character's sheet lists. You can
move in any direction, change direction partway through, and stop early --
Stride covers up to your Speed, not exactly your Speed.

**Difficult terrain** costs an extra 5 feet of your movement for every square
you enter; **greater difficult terrain** costs an extra 10. Rubble, thick
undergrowth, and shallow water are the common examples. Moving through it
doesn't cost an extra action, only more of the distance a single Stride buys
you.

Each Stride is its own move: two short Strides each cost one action, and one
long Stride that covers more than a single Speed's worth of distance costs
more than one action by itself, in proportion to how far over your Speed it
runs. There's no way to bank unused movement from an earlier action onto a
later one.

{action:step} is the exception: one action moves you 5 feet without
provoking anything that would otherwise trigger off your movement, but it
can't be used to enter difficult terrain.
`,
);

const REACTIONS = page(
  'reactions',
  'Reactions',
  `
Alongside your three actions, you get **one reaction** per turn, refreshed
at the start of your own turn. A reaction isn't spent on your turn at all --
you hold it until its specific trigger happens, which can be on anyone's
turn, including your own.

Every reaction names its own trigger. **Reactive Strike** (granted by the
Fighter's class feature, and some creatures) is the one new players run
into first: its trigger is an enemy within your reach using a manipulate
action, moving out of your reach, or making a ranged attack, and it lets you
make a Strike against them in response. You can't use a reaction whose
trigger hasn't happened, and once you've spent your one reaction this round,
you can't use a second one even if another trigger fires.

Reactions are shown with a ↺ icon rather than a ◆, both at the table and in
the book this page belongs to, so they're never confused with a spent action
on your three-action budget.
`,
);

const FLANKING_AND_OFF_GUARD = page(
  'flanking-and-off-guard',
  'Flanking and off-guard',
  `
{condition:off-guard} lowers a creature's AC by **2** (a circumstance
penalty), representing its guard being down against a specific attack.
Several things can impose it, but the one every melee-focused table runs
into constantly is **flanking**.

You and an ally flank a target when you **both threaten it in melee** --
each of you within your own reach of it -- and you're positioned on
**roughly opposite sides** of it, not bunched up on the same side. A target
you flank is off-guard against your attack, specifically.

A few things to know about how it actually plays out:

- Flanking is **melee only**. A ranged or thrown attack never benefits from it, even with an ally positioned perfectly.
- Off-guard **doesn't stack with itself**. A target already off-guard from some other source (it's {condition:prone}, {condition:restrained}, or already flanked by someone else) gains nothing further from also being flanked by you.
- An ally who can't act -- {condition:unconscious}, dying, dead, or {condition:paralyzed} -- doesn't count toward flanking, even if their token is standing in the right square.

Conditions that impose off-guard on their own, with no flanking required,
include {condition:prone}, {condition:restrained}, {condition:grabbed},
{condition:paralyzed}, {condition:confused}, and {condition:unconscious}.
`,
);

const HIT_POINTS_DYING_AND_RECOVERY = page(
  'hit-points-dying-and-recovery',
  'Hit points, dying, and recovery',
  `
**(confirm): this whole page is written from memory of the core rules and
has not been individually checked against Archives of Nethys.** Treat every
number below as a best effort, not a verified citation -- and the GM's own
judgment always overrides it at the table.

Damage reduces your current hit points. Reaching **0** doesn't necessarily
kill you: you fall {condition:unconscious} and gain {condition:dying} 1 (2
if the hit that dropped you was a critical hit), plus one {condition:wounded}
if you already carried any.

While {condition:dying}, you make a **recovery check** at the start of each
of your turns against DC 10 plus your current dying value: a critical
success lowers dying by 2, a success by 1, a failure raises it by 1, and a
critical failure by 2. Reaching dying 0 this way means you've **stabilized**
-- still unconscious, but no longer at risk of dying on its own.

Taking damage again while already at 0 hit points raises dying by 1 (2 on a
critical hit) instead of knocking you out again. **Dying 4 kills you**
outright (lower if you carry {condition:doomed}, which permanently lowers
the threshold by that much and never goes away on its own). Taking damage at
0 hit points that's at least your maximum hit points in a single hit also
kills you outright, dying value aside.

Healing while dying -- from a spell, from {action:treat-wounds}, from
anything that restores hit points above 0 -- ends dying immediately and
wakes you up, and raises your {condition:wounded} value by 1. Wounded makes
the next time you're knocked out worse: your starting dying value on a
future knockout is increased by your current wounded value, on top of the
usual 1 (or 2 on a critical hit).
`,
);

const CONDITIONS_OVERVIEW = page(
  'conditions-overview',
  'Conditions, an overview',
  `
A **condition** is a temporary state that changes what a creature can do or
how good it is at doing it -- {condition:frightened}, {condition:prone}, and
{condition:clumsy} are all conditions, alongside dozens more. Every
condition you see on a sheet, a party card, or a chat roll is its own
tooltip: hover or tap its name for what it actually does.

Conditions come in two shapes:

- **Binary** conditions are either on or off, with nothing to track beyond that -- {condition:prone} and {condition:unconscious} are binary.
- **Valued** conditions carry a number that makes them worse as it rises -- {condition:frightened} 2 is worse than {condition:frightened} 1, and most of a valued condition's rules scale directly with its value.

Gaining a valued condition you already have **doesn't add the two values
together**. The higher one wins: {condition:frightened} 1 applied on top of
an existing {condition:frightened} 2 leaves you at frightened 2, not 3. A
GM overriding a condition's value directly (the sheet's own override path)
is the one case that sets it exactly, including lowering it.

A condition's source matters for how long it lasts and how it clears --
until the end of an effect, until a saving throw succeeds, until the
combatant's next turn -- but the condition itself doesn't track which
source caused it once applied: two different spells both inflicting
{condition:clumsy} 1 on you still leave you at one combined clumsy 1, not
two separate stacks to track.
`,
);

const SPELLCASTING_BASICS = page(
  'spellcasting-basics',
  'Spellcasting basics',
  `
**(confirm): spellcasting mechanics are not yet implemented in this project
(a later milestone), so this page stays conceptual rather than citing
specific numbers this project can verify against its own code.**

A spell belongs to one of four **traditions** -- arcane, divine, occult, or
primal -- and has a **rank** from 1 to 10, roughly standing in for a
level: a rank 1 spell is something a brand-new spellcaster can cast, and
rank 10 is reserved for the most powerful spells in the game. Your own
spellcasting proficiency and the slots or points available to you both
scale with your character level, not directly with a spell's rank.

Casting a spell either **targets a creature's save** (you roll nothing; the
target rolls against your spell DC) or makes a **spell attack roll** (you
roll against the target's AC, same four degrees of success as any other
check). A spell's own description says which. Both use the same proficiency
math every other statistic does: your rank's bonus plus your level, against
your casting attribute's modifier.

Many spells can be cast at a higher rank than their minimum for a bigger
effect -- **heightening** -- described on the spell itself, either as a
flat improvement every so many ranks or as specific, named jumps at
particular ranks.

A **cantrip** is a spell you can cast at will, heightened automatically to
equal your own level, that never consumes a slot. Some classes also have
**focus spells**, powered by a small, separate pool of up to 3 points that
refill on a 10-minute rest, instead of ordinary slots.
`,
);

export const BOOK_PAGES: readonly BookPage[] = [
  YOUR_TURN,
  CHECKS_AND_DEGREES_OF_SUCCESS,
  MULTIPLE_ATTACK_PENALTY,
  PROFICIENCY,
  MOVEMENT_AND_STRIDE,
  REACTIONS,
  FLANKING_AND_OFF_GUARD,
  HIT_POINTS_DYING_AND_RECOVERY,
  CONDITIONS_OVERVIEW,
  SPELLCASTING_BASICS,
];
