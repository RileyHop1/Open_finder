/**
 * The device token that identifies this browser to the server across
 * reconnects -- ADR 0007: "the server stores a device token in localStorage
 * so you return to the same seat next session." Generated once per browser
 * and persisted; never sent anywhere except this app's own server (the
 * Socket.IO handshake in `socket.ts`).
 */

const STORAGE_KEY = 'hearthtable:deviceToken';

export function getDeviceToken(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing !== null && existing.length > 0) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, created);
  return created;
}
