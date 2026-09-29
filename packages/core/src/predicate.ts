/**
 * Predicates: the small boolean-logic language rule elements use to test
 * whether they apply, evaluated against the current roll options (ADR 0008
 * decision 6, ADR 0004 decision 2).
 *
 * This is a deliberately narrow subset, scoped to what the five v1 rule
 * element types actually need -- ADR 0004 says predicates are "supported
 * only as far as these five need them," not a reimplementation of
 * upstream's full predicate language. A bare string tests whether a roll
 * option is present; `all`/`any`/`not` compose those tests with AND/OR/NOT.
 * Comparison operators (greater-than, equals-a-value) and the exclusive
 * combinators (xor/nand/nor) upstream also has are out of scope for v1 --
 * an upstream rule element whose predicate needs one of those imports
 * inert, with the reason recorded, the same as an unmapped element kind
 * (ADR 0004 decision 4). That is an importer-side concern; this schema
 * only defines what a supported predicate can look like.
 */

import { z } from 'zod';

export type Predicate =
  | string
  | { readonly all: readonly Predicate[] }
  | { readonly any: readonly Predicate[] }
  | { readonly not: Predicate };

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.string().min(1),
    z.strictObject({ all: z.array(predicateSchema).readonly() }),
    z.strictObject({ any: z.array(predicateSchema).readonly() }),
    z.strictObject({ not: predicateSchema }),
  ]),
);

/**
 * Evaluates `predicate` against the roll options active for the current
 * resolution (ADR 0008 decision 6: "predicates are evaluated at resolution
 * time against the current roll options"). A bare string is a presence
 * test; `all` and `any` follow ordinary boolean AND/OR, including the
 * standard vacuous cases -- an empty `all` is true, an empty `any` is
 * false, matching what "every condition holds" and "some condition holds"
 * mean when there are no conditions to check.
 */
export function testPredicate(
  predicate: Predicate,
  rollOptions: ReadonlySet<string>,
): boolean {
  if (typeof predicate === 'string') {
    return rollOptions.has(predicate);
  }
  if ('all' in predicate) {
    return predicate.all.every((clause) => testPredicate(clause, rollOptions));
  }
  if ('any' in predicate) {
    return predicate.any.some((clause) => testPredicate(clause, rollOptions));
  }
  return !testPredicate(predicate.not, rollOptions);
}
