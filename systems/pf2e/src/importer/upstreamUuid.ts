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
 * A name is only unique inside its compendium (`Reactive Strike` is an action,
 * a class feature and a Monster Core glossary entry), so the pack segment picks
 * the candidates. Two things name a pack: the upstream folder an entry was read
 * from (`UPSTREAM_PACK_TO_FOLDER`, exact, supplied by the importer), and our
 * own `packId` (`UPSTREAM_PACK_TO_PACK_ID`, the fallback when no folder is
 * known; coarser, since the glossary and the player actions share `actions`).
 * A pack we do not import resolves to nothing, so the granting entry is
 * dropped, as ADR 0003 decision 5 requires. A name that still matches more
 * than one entry resolves to nothing too: guessing would grant the wrong
 * feature, which is worse than a gap.
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

/** Upstream compendium ids to the folder under `packs/<system>/` holding that compendium. */
const UPSTREAM_PACK_TO_FOLDER: Readonly<Record<string, string>> = {
  'feats-srd': 'feats',
  actionspf2e: 'actions',
  conditionitems: 'conditions',
  classfeatures: 'class-features',
  'equipment-srd': 'equipment',
  'spells-srd': 'spells',
};

/** The upstream folder (`actions`, `class-features`...) an entry was read from, given its path under `packs/`: `<system>/<folder>/...`. */
export function upstreamFolderOf(path: string): string | undefined {
  return path.split('/')[1];
}

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
  /** The upstream folder an entry was read from, when known. */
  folderOf: (entry: T) => string | undefined = () => undefined,
): UuidTargetResolver<T> {
  const byId = new Map<string, T>();
  const byPackAndName = new Map<string, T[]>();
  const byFolderAndName = new Map<string, T[]>();
  const add = (index: Map<string, T[]>, key: string, entry: T): void => {
    index.set(key, [...(index.get(key) ?? []), entry]);
  };
  for (const entry of entries) {
    byId.set(entry.id, entry);
    add(byPackAndName, `${entry.packId}\u0000${entry.name}`, entry);
    const folder = folderOf(entry);
    if (folder !== undefined) {
      add(byFolderAndName, `${folder}\u0000${entry.name}`, entry);
    }
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

    const folder = UPSTREAM_PACK_TO_FOLDER[upstreamPack];
    const packId = UPSTREAM_PACK_TO_PACK_ID[upstreamPack];
    if (folder === undefined || packId === undefined) {
      return undefined;
    }
    const candidates =
      byFolderAndName.get(`${folder}\u0000${target}`) ??
      byPackAndName.get(`${packId}\u0000${target}`);
    return candidates?.length === 1 ? candidates[0] : undefined;
  };
}
