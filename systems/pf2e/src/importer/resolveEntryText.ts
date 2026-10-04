/**
 * Resolves every entry's `@UUID[...]` references against the full set of
 * entries this import run actually kept, turning each one into a `term`
 * node (a tooltip link) when the target is something milestone 6's
 * tooltips cover, or `inlineSyntax.ts`'s own literal-label-or-warn fallback
 * otherwise. Runs once, centrally, after `resolveDependencies` -- the same
 * reason that pass exists as its own module rather than something each
 * mapper does alone: resolving a cross-entry reference needs the *whole*
 * kept set, which no single mapper has (`elementMapper.ts`'s own module
 * doc makes the same point about rule elements).
 *
 * **This is display-only, and that is exactly the distinction
 * `resolveDependencies.ts` already draws** when it declines to resolve
 * `@UUID` links in prose for *dependency* purposes: a broken or
 * unresolved tooltip link just shows plain text instead of a clickable
 * term, where a broken *grant* target would make an item do the wrong
 * thing. Nothing here ever drops an entry.
 *
 * **Only four content kinds become a `term`:** `condition`, `feat`,
 * `spell`, and `action` -- the kinds `TermKind` (`packages/core`) actually
 * has, because those are what milestone 6 built tooltips for. A `@UUID`
 * pointing at a weapon, a creature, or anything else resolves exactly like
 * one upstream dropped from this project's scope: a literal label, or a
 * warning if there's no label to fall back to. There is no `trait` kind
 * among upstream's compendium entries at all -- traits get their own
 * glossary from a different source (`static/lang`), a later PR in this
 * stack.
 */

import type { TermKind } from '@hearthtable/core';

import type { Pf2eEntry } from '../content/entry.js';
import { deterministicId } from './deterministicId.js';
import { applyInlineSyntax, type ResolveUuid, type UuidResolution } from './inlineSyntax.js';
import { extractUpstreamId } from './resolveDependencies.js';

const TERM_KIND_BY_CONTENT_KIND: Readonly<Record<string, TermKind>> = {
  condition: 'condition',
  feat: 'feat',
  spell: 'spell',
  action: 'action',
};

function buildResolveUuid(entries: readonly Pf2eEntry[]): ResolveUuid {
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  return (uuidPath: string): UuidResolution | undefined => {
    const upstreamId = extractUpstreamId(uuidPath);
    if (upstreamId === undefined) {
      return undefined;
    }
    const target = byId.get(deterministicId(upstreamId));
    if (target === undefined) {
      return undefined;
    }
    const termKind = TERM_KIND_BY_CONTENT_KIND[target.kind];
    if (termKind === undefined) {
      return undefined;
    }
    return { termKind, slug: target.slug, label: target.name };
  };
}

export interface ResolveEntryTextResult {
  readonly entries: readonly Pf2eEntry[];
  /**
   * One line per piece of inline syntax that couldn't be fully resolved,
   * across every entry in this run -- never printed by CI (it can quote a
   * matched span of upstream markup, which may itself be Paizo content;
   * see `coverageReport.ts`'s module doc on the same detailed-vs-aggregate
   * split). Folded into `CoverageReport.inlineSyntaxWarnings`, which that
   * same rule already applies to.
   */
  readonly warnings: readonly string[];
}

/** No entry has `text` until the next PR in this stack wires `htmlToRichText` into the per-kind mappers -- until then, every entry's `text` is `undefined` and this is a no-op pass. */
export function resolveEntryText(entries: readonly Pf2eEntry[]): ResolveEntryTextResult {
  const resolveUuid = buildResolveUuid(entries);
  const warnings: string[] = [];
  const resolved = entries.map((entry) => {
    if (entry.text === undefined) {
      return entry;
    }
    const result = applyInlineSyntax(entry.text, resolveUuid);
    warnings.push(...result.warnings);
    return { ...entry, text: result.richText };
  });
  return { entries: resolved, warnings };
}
