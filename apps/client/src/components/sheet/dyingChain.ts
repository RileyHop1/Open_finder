/**
 * The dying-chain state (dying, wounded, doomed, unconscious, dead) in
 * words, shared by the party bar and the sheet's override panel so the two
 * can never disagree. `undefined` means none of the five apply.
 */
import { dyingStateOf, type AppliedCondition } from '@hearthtable/pf2e';

export function describeDyingChain(
  conditions: readonly AppliedCondition[],
): string | undefined {
  if (conditions.some((c) => c.slug === 'dead')) {
    return 'Dead';
  }
  const dying = dyingStateOf(conditions);
  const parts: string[] = [];
  if (dying.unconscious) {
    parts.push('Unconscious');
  }
  if (dying.dying > 0) {
    parts.push(`dying ${dying.dying}`);
  }
  if (dying.wounded > 0) {
    parts.push(`wounded ${dying.wounded}`);
  }
  if (dying.doomed > 0) {
    parts.push(`doomed ${dying.doomed}`);
  }
  return parts.length === 0 ? undefined : parts.join(', ');
}
