/**
 * Resolves an upstream `Compendium.<system>.<pack>.Item.<target>` uuid to one
 * of our entries.
 *
 * Verified against the pinned upstream: `<target>` is the item's **name**
 * (`Compendium.pf2e.feats-srd.Item.Martial Performance`), not its `_id`. Every
 * `GrantItem` uuid in the pinned packs is of this form, and so are the `@UUID`
 * links in prose. Resolving by id alone therefore never matched, and every
 * entry with a grant was dropped as "target excluded".
 *
 * A name is only unique inside its compendium (`Reactive Strike` is both an
 * action and a class feature, for instance), so the pack segment picks the
 * candidates: `UPSTREAM_PACK_TO_PACK_ID` maps the pack ids upstream uses to ours.
 * A pack we do not import has no entry, so its targets resolve to nothing and
 * the granting entry is dropped, as ADR 0003 decision 5 requires. A name that
 * still matches more than one of our entries in the pack resolves to nothing
 * too: guessing would grant the wrong feature, which is worse than a gap.
 *
 * The id form is still accepted, first: synthetic fixtures use it, and a
 * future upstream may switch back.
 */

import { deterministicId } from './deterministicId.js';

/** Upstream compendium ids (the third uuid segment) to our `packId`s. */
const UPSTREAM_PACK_TO_PACK_ID: Readonly<Record<string, string>> = {
  'feats-srd': 'feats',
  actionspf2e: 'actions',
  conditionitems: 'conditions',
  classfeatures: 'classFeatures',
  'equipment-srd': 'equipment',
  spells: 'spells',
  'spells-srd': 'spells',
};

const ITEM_UUID = /^Compendium\.[^.]+\.([^.]+)\.Item\.(.+)$/;

/** The part of an entry this resolver needs; both draft and final entries have it. */
interface UuidTarget {
  readonly id: string;
  readonly packId: string;
  readonly name: string;
}

/** Looks up the entry a uuid names, or `undefined` if it is excluded, unknown or ambiguous. */
export type UuidTargetResolver<T> = (uuid: string) => T | undefined;

export function buildUuidResolver<T extends UuidTarget>(
  entries: Iterable<T>,
): UuidTargetResolver<T> {
  const byId = new Map<string, T>();
  const byPackAndName = new Map<string, T[]>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
    const key = `${entry.packId}\u0000${entry.name}`;
    byPackAndName.set(key, [...(byPackAndName.get(key) ?? []), entry]);
  }

  return (uuid) => {
    const match = ITEM_UUID.exec(uuid);
    if (match === null) {
      return undefined;
    }
    const [, upstreamPack, target] = match as unknown as [string, string, string];

    const byUpstreamId = byId.get(deterministicId(target));
    if (byUpstreamId !== undefined) {
      return byUpstreamId;
    }

    const packId = UPSTREAM_PACK_TO_PACK_ID[upstreamPack];
    if (packId === undefined) {
      return undefined;
    }
    const candidates = byPackAndName.get(`${packId}\u0000${target}`);
    return candidates?.length === 1 ? candidates[0] : undefined;
  };
}
