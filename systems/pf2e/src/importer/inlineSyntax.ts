/**
 * Converts Foundry's inline reference syntax -- the markup
 * `htmlToRichText.ts` leaves untouched inside its `text` nodes -- into
 * either a `term` node (a link into a tooltip) or a readable plain-text
 * replacement (ADR 0020 decision 4). Walks a whole `RichText` tree, since
 * the syntax can appear inside any text run, nested under a list item or a
 * `strong`/`em` run included.
 *
 * **What each form becomes:**
 * - `@UUID[path]{label}` -- a `term` node when `resolveUuid` recognizes
 *   `path` as something this project actually imported; the literal
 *   `{label}` as plain text otherwise. With no `{label}` and no match,
 *   there is nothing readable to fall back to, so the original markup is
 *   kept as visible text and a warning is recorded -- `inlineSyntax.ts`
 *   itself has no compendium index to resolve against; `resolveUuid` is
 *   supplied by the per-entry mapper (the next PR in this stack), which does.
 * - `@Check[reflex|dc:20]` -- `"DC 20 Reflex"`. Multiple check names
 *   (`arcane,occultism`) join with "or". A `{label}` isn't part of this
 *   enricher's own syntax, so there's nothing to prefer over the built text.
 * - `@Damage[(1d8+4)[slashing]]` -- the dice expression up to its first
 *   `|options:...` flag, or a trailing `{label}` when one is given. Parsed
 *   by counting bracket depth, not a single regex capture: the damage type
 *   suffix (`[slashing]`) is itself bracketed, nested one level inside the
 *   enricher's own brackets.
 * - `[[/r 1d20+17 #Counteract]]` -- the dice expression, `/r`/`/gmr` prefix
 *   and `#comment` flavor text stripped, or a trailing `{label}`.
 * - `@Localize[PF2E.Trait.Agile]` -- this project has no localization
 *   table, so the key's last dot-segment, split at word boundaries
 *   (`"Agile"`), is a guess, not a resolution -- always warned.
 * - Anything else shaped like an enricher (`@Actor[...]`, a malformed or
 *   unknown one) is left exactly as written and warned about, the same
 *   "recognize it happened, never invent or drop content" rule ADR 0004's
 *   rule-element mapper already follows for an unmapped kind.
 */

import type { RichText, RichTextNode, TermKind } from '@hearthtable/core';

export interface UuidResolution {
  readonly termKind: TermKind;
  readonly slug: string;
  /** The resolved entry's own display name, used when the source has no literal `{label}` of its own. */
  readonly label: string;
}

/**
 * Looks up what an upstream `@UUID[...]` path actually points to, among
 * entries this project has already imported. Supplied by the caller: this
 * module has no compendium index of its own, by design (the same split
 * `resolveDependencies.ts` already draws between resolving *data*
 * dependencies and -- deliberately not attempted there -- resolving a
 * `@UUID` link inside prose).
 */
export type ResolveUuid = (uuidPath: string) => UuidResolution | undefined;

export interface InlineSyntaxResult {
  readonly richText: RichText;
  /** One entry per piece of inline syntax this module could not fully resolve. Never thrown; the per-entry mapper folds these into the importer's coverage report. */
  readonly warnings: readonly string[];
}

const UNRECOGNIZED_ENRICHER = /@[A-Za-z]+\[[^\]]*\](?:\{[^}]*\})?/g;

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** No localization table exists here -- this is a readable guess, not a resolution, which is why every call site also records a warning. */
function humanizeLocalizeKey(key: string): string {
  const last = key.split('.').pop() ?? key;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function convertCheck(args: string): string {
  const parts = args.split('|');
  const checkNames = (parts[0] ?? '')
    .split(',')
    .map((slug) => titleCaseSlug(slug.trim()))
    .filter((name) => name !== '');
  const dc = parts.find((part) => part.startsWith('dc:'))?.slice(3);
  const label = checkNames.join(' or ');
  return dc !== undefined ? `DC ${dc} ${label}` : label;
}

function convertDamage(args: string): string {
  const [dice] = args.split('|');
  return (dice ?? args).trim();
}

function convertRoll(rawExpression: string): string {
  return rawExpression
    .replace(/^\/?(?:gmr|r)\s*/, '')
    .split('#')[0]!
    .trim();
}

/** Finds `]`, matching the `[` the caller already consumed, counting nested `[`/`]` pairs -- `@Damage`'s own args can contain a bracketed damage type (`(1d8+4)[slashing]`). `-1` when unmatched. */
function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 1;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '[') {
      depth += 1;
    } else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** A trailing `{label}` right after `fromIndex`, if there is one -- every enricher this module handles allows overriding its own built text with an explicit label. */
function readTrailingLabel(
  text: string,
  fromIndex: number,
): { readonly label: string; readonly nextIndex: number } | undefined {
  if (text[fromIndex] !== '{') {
    return undefined;
  }
  const close = text.indexOf('}', fromIndex + 1);
  if (close === -1) {
    return undefined;
  }
  return { label: text.slice(fromIndex + 1, close), nextIndex: close + 1 };
}

interface Trigger {
  readonly index: number;
  readonly prefix: string;
}

const TRIGGER_PREFIXES = ['@UUID[', '@Check[', '@Damage[', '@Localize[', '[['] as const;

function findNextTrigger(text: string, fromIndex: number): Trigger | undefined {
  let best: Trigger | undefined;
  for (const prefix of TRIGGER_PREFIXES) {
    const index = text.indexOf(prefix, fromIndex);
    if (index !== -1 && (best === undefined || index < best.index)) {
      best = { index, prefix };
    }
  }
  return best;
}

/**
 * Converts the inline syntax inside one plain-text run into a sequence of
 * `text`/`term` nodes. Never throws, and never drops a span of the
 * original string -- a malformed or unresolved piece of syntax is kept as
 * visible text (with a warning), not silently removed.
 */
function convertText(
  text: string,
  resolveUuid: ResolveUuid,
  warnings: string[],
): RichTextNode[] {
  const nodes: RichTextNode[] = [];

  function pushText(value: string): void {
    if (value === '') {
      return;
    }
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'text') {
      nodes[nodes.length - 1] = { kind: 'text', value: last.value + value };
      return;
    }
    nodes.push({ kind: 'text', value });
  }

  function pushLiteral(segment: string): void {
    for (const unknown of segment.matchAll(UNRECOGNIZED_ENRICHER)) {
      warnings.push(`unrecognized inline syntax, left as text: ${unknown[0]}`);
    }
    pushText(segment);
  }

  let i = 0;
  while (i < text.length) {
    const trigger = findNextTrigger(text, i);
    if (trigger === undefined) {
      pushLiteral(text.slice(i));
      break;
    }
    pushLiteral(text.slice(i, trigger.index));

    const argsStart = trigger.index + trigger.prefix.length;
    const closeIndex =
      trigger.prefix === '[['
        ? text.indexOf(']]', argsStart)
        : trigger.prefix === '@Damage['
          ? findMatchingBracket(text, argsStart)
          : text.indexOf(']', argsStart);
    if (closeIndex === -1) {
      // Unmatched opening bracket -- not real syntax after all. Treat the
      // trigger text itself as a literal and keep scanning right after it.
      pushLiteral(trigger.prefix);
      i = argsStart;
      continue;
    }
    const args = text.slice(argsStart, closeIndex);
    const afterClose = closeIndex + (trigger.prefix === '[[' ? 2 : 1);
    // @Check and @Localize don't take a trailing {label} in real Foundry
    // syntax -- only read one for the enrichers that actually support it,
    // so a stray `{...}` straight after one of those two is left for the
    // next loop iteration to treat as ordinary literal text.
    const supportsLabel = trigger.prefix !== '@Check[' && trigger.prefix !== '@Localize[';
    const trailing = supportsLabel ? readTrailingLabel(text, afterClose) : undefined;
    const label = trailing?.label;
    i = trailing?.nextIndex ?? afterClose;

    switch (trigger.prefix) {
      case '@UUID[': {
        const resolved = resolveUuid(args.trim());
        if (resolved !== undefined) {
          nodes.push({
            kind: 'term',
            termKind: resolved.termKind,
            slug: resolved.slug,
            label: label ?? resolved.label,
          });
        } else if (label !== undefined) {
          pushText(label);
        } else {
          warnings.push(`unresolved @UUID with no fallback label: ${args}`);
          pushText(text.slice(trigger.index, i));
        }
        break;
      }
      case '@Check[':
        pushText(convertCheck(args));
        break;
      case '@Damage[':
        pushText(label ?? convertDamage(args));
        break;
      case '@Localize[':
        warnings.push(
          `@Localize has no localization table here, guessed a label: ${args}`,
        );
        pushText(humanizeLocalizeKey(args));
        break;
      case '[[':
        pushText(label ?? convertRoll(args));
        break;
    }
  }

  return nodes;
}

function convertChildren(
  children: readonly RichTextNode[],
  resolveUuid: ResolveUuid,
  warnings: string[],
): RichTextNode[] {
  return children.flatMap((child) => convertNode(child, resolveUuid, warnings));
}

function convertNode(
  node: RichTextNode,
  resolveUuid: ResolveUuid,
  warnings: string[],
): RichTextNode[] {
  switch (node.kind) {
    case 'text':
      return convertText(node.value, resolveUuid, warnings);
    case 'term':
      return [node];
    case 'strong':
    case 'em':
    case 'paragraph':
      return [
        { ...node, children: convertChildren(node.children, resolveUuid, warnings) },
      ];
    case 'heading':
      return [
        { ...node, children: convertChildren(node.children, resolveUuid, warnings) },
      ];
    case 'list':
      return [
        {
          ...node,
          items: node.items.map((item) => convertChildren(item, resolveUuid, warnings)),
        },
      ];
  }
}

/**
 * Converts every piece of inline syntax inside `richText`, wherever it's
 * nested. `resolveUuid` is the only thing this module needs from the
 * caller -- everything else (what `@Check`/`@Damage`/`[[/r]]`/`@Localize`
 * become) is self-contained.
 */
export function applyInlineSyntax(
  richText: RichText,
  resolveUuid: ResolveUuid,
): InlineSyntaxResult {
  const warnings: string[] = [];
  const converted = convertChildren(richText, resolveUuid, warnings);
  return { richText: converted, warnings };
}
