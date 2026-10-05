/**
 * The reference book's first four pages (milestone 6, `docs/rules-reference.md`):
 * short, hand-written prose covering mechanics a new player needs that no
 * single compendium entry explains on its own. Written in our own words,
 * never upstream's text, so nothing here is licensing-sensitive (ADR 0003)
 * -- the whole point of the reference book, distinct from the imported
 * tooltips a condition or action already gets.
 *
 * Checked against <https://2e.aonprd.com> while writing (2026-10-05); a
 * sentence this project couldn't verify there carries its own **(confirm)**
 * marker instead of a silent guess.
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

export const BOOK_PAGES: readonly BookPage[] = [
  YOUR_TURN,
  CHECKS_AND_DEGREES_OF_SUCCESS,
  MULTIPLE_ATTACK_PENALTY,
  PROFICIENCY,
];
