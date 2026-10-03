/**
 * A private notice in chat (M5 C.10): a `text` message meant for specific
 * seats rather than said by anyone, e.g. the reaction prompt
 * `apps/server/src/reactions.ts` posts when a move leaves a square a
 * Reactive Strike threatens. Detected structurally, not by matching its
 * wording: a GM-only aside (a template's hidden-catch line) uses
 * `default: 'none', seats: {}` -- naming no one, since "the GM sees
 * everything" already covers it -- while a notice meant for particular
 * seats names them, which nothing else in the codebase does today.
 */
import type { ChatTextMessage } from '@hearthtable/core';

export function isPrivateNotice(message: ChatTextMessage): boolean {
  return (
    message.permissions.default === 'none' &&
    Object.keys(message.permissions.seats).length > 0
  );
}
