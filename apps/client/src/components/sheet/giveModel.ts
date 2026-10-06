/** Who an item or coins can be given to, and what the Give form reports (ADR 0021, `inventory.transfer`). */

export interface Recipient {
  /** `'party'` for the shared stash, else a character's actor id. */
  readonly id: string;
  readonly name: string;
}

export interface GiveChoice {
  readonly to: string;
  readonly quantity?: number;
  readonly coins?: Partial<Record<'pp' | 'gp' | 'sp' | 'cp', number>>;
}
