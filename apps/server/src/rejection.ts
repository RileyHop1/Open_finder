/**
 * Thrown by an operation handler to reject an operation cleanly: caught by the
 * `operation` handler in `realtime.ts`, which rolls back the transaction (via
 * the throw propagating out of `store.transaction`) and acks the sender with
 * the message, without broadcasting anything. Never thrown for a genuine
 * bug -- that is an unhandled error, which acks a generic message instead of
 * leaking internals to the client.
 *
 * Lives in its own module so handler modules can throw it without importing
 * `realtime.ts`, which imports them.
 */
export class OperationRejected extends Error {}
