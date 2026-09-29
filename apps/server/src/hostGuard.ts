/**
 * Refuses "every interface" bind addresses. See ADR 0007: "Bind to
 * localhost by default, never 0.0.0.0."
 *
 * The default host already satisfies that; this guard is for the
 * *configured* case, where a GM sets `HEARTHTABLE_HOST` to their LAN or
 * ZeroTier/Tailscale interface IP (per the README's networking section) so
 * other devices can connect. That's a deliberate, specific interface --
 * genuinely different from "every interface," which on a machine with any
 * public-facing NIC could mean the open internet. The latter is exactly
 * the misconfiguration this exists to catch before it becomes a silent,
 * unauthenticated exposure.
 *
 * Extracted into its own module, separate from `index.ts`'s top-level side
 * effects (reading env vars, opening a real socket), so it can be imported
 * and tested safely without starting a server.
 */
export function assertNotAllInterfaces(host: string): void {
  if (host === '0.0.0.0' || host === '::') {
    throw new Error(
      `refusing to bind to ${host} (all interfaces). Set HEARTHTABLE_HOST to your ` +
        'specific LAN or ZeroTier/Tailscale interface address instead -- see the ' +
        "README's networking section. Binding to every interface risks exposing " +
        'this server on any public-facing network the machine has, and it has no ' +
        'authentication (ADR 0007).',
    );
  }
}
