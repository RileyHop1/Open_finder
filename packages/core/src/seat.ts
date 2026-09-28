/**
 * A Seat: one of the "characters" a person can claim when they join a
 * world's lobby -- see ADR 0007, "Seats, not accounts". There is no
 * authentication and no account; picking a seat *is* how a connecting
 * client becomes someone, the same way claiming a controller works in
 * couch co-op.
 *
 * Extends `baseRecordSchema`, not `baseDocumentSchema`. A Seat belongs to a
 * world (hence its own `worldId` field, added here rather than inherited),
 * but it is not permission-gated the way a document is -- the
 * none/limited/observer/owner scale describes what a seat can do to a
 * *document*, not what can be done to a seat itself.
 */

import { z } from 'zod';

import { baseRecordSchema, idSchema } from './record.js';

export const seatSchema = baseRecordSchema.extend({
  worldId: idSchema,
  name: z.string().min(1),
  isGM: z.boolean(),
  /**
   * Optional, and explicitly **not a secret**. Its only purpose is stopping
   * a player from claiming the GM seat by accident out of curiosity --
   * see ADR 0007. There is no hashing, no rate limiting, and no attempt to
   * resist a motivated guess. Never build an authentication feature on top
   * of this field; if the project ever needs real access control here,
   * that is a new decision, not an "improvement" to this one.
   */
  pin: z.string().min(1).max(16).optional(),
  /**
   * Set the first time someone claims this seat, matched against the
   * device token stored in that browser's `localStorage` to return them to
   * the same seat automatically next session (ADR 0007). Absent until the
   * seat has been claimed at least once.
   */
  claimedByDeviceToken: z.string().min(1).optional(),
});

export type Seat = z.infer<typeof seatSchema>;
