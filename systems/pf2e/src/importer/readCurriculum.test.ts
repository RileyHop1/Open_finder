import { describe, expect, it } from 'vitest';

import { readCurriculum } from './readCurriculum.js';

// Invented spells in upstream's layout; nothing here is Paizo content.
const link = (name: string) => `@UUID[Compendium.pf2e.spells-srd.Item.${name}]`;

describe('readCurriculum', () => {
  it('reads the cantrips and each rank’s spells as slugs', () => {
    const html = `<p>Lore.</p><p><strong>Curriculum</strong></p>
<ul>
<li><strong>cantrips:</strong> ${link('Glow Spark')}, ${link('Dust Mote')}</li>
<li><strong>1st:</strong> ${link('Sorrel Whistle')}, ${link("Pip's Ward")}</li>
<li><strong>2nd:</strong> ${link('Ember Gate')}</li>
<li><strong>3rd:</strong> ${link('Long Echo')}</li>
<li><strong>9th:</strong> ${link('Last Light')}</li>
</ul><p><strong>School Spells</strong> initial: ${link('Not Curriculum')}</p>`;
    expect(readCurriculum(html)).toEqual({
      '0': ['glow-spark', 'dust-mote'],
      '1': ['sorrel-whistle', 'pips-ward'],
      '2': ['ember-gate'],
      '3': ['long-echo'],
      '9': ['last-light'],
    });
  });

  it('reads items whose text is wrapped in a paragraph', () => {
    const html = `<p><strong>Curriculum</strong></p><ul><li><p><strong>cantrips:</strong> ${link('Glow Spark')}</p></li><li><p><strong>1st:</strong> ${link('Ember Gate')}</p></li></ul>`;
    expect(readCurriculum(html)).toEqual({ '0': ['glow-spark'], '1': ['ember-gate'] });
  });

  it('reads no curriculum from text without one, or with a list it does not recognize', () => {
    expect(readCurriculum('<p><strong>No Curriculum</strong> You have none.</p>')).toBe(
      undefined,
    );
    expect(readCurriculum('<p>Just prose about a school.</p>')).toBeUndefined();
    expect(
      readCurriculum(
        `<p><strong>Curriculum</strong></p><ul><li>see the table</li><li><strong>9th:</strong> —</li></ul>`,
      ),
    ).toBeUndefined();
  });

  it('needs the list straight after the heading', () => {
    expect(
      readCurriculum(
        `<p><strong>Curriculum</strong></p><p>Later:</p><ul><li><strong>1st:</strong> ${link('Ember Gate')}</li></ul>`,
      ),
    ).toBeUndefined();
  });
});
