<script setup lang="ts">
/**
 * One `term` node from a `RichText` value, rendered as the label `RulesText`
 * already shows, now wired to its actual tooltip (`docs/rules-reference.md`):
 * a popover that opens on hover, focus, or tap, closes on Escape, and -- the
 * reason this is its own component rather than inline markup -- nests. A
 * term's own entry text is rendered through `RulesText` again, so a term
 * mentioned inside another term's description (a condition's text
 * mentioning a trait, say) opens its own `RulesTerm` and its own popover,
 * stacked on top rather than replacing the one already open.
 *
 * `termKind` maps onto a compendium pack id for four of its five kinds
 * (`condition`/`feat`/`spell`/`action`). `trait` is the exception: a
 * trait's text comes from the glossary `stores/rules.ts`'s `getTrait`
 * fetches (ADR 0020 decision 5), not a compendium pack, so it's resolved
 * separately rather than through `PACK_ID_BY_TERM_KIND`.
 */
import type { RichText, TermKind } from '@hearthtable/core';
import { ref } from 'vue';

import { useRulesStore } from '../stores/rules.js';
import RulesText from './RulesText.vue';

const props = defineProps<{
  termKind: TermKind;
  slug: string;
  label: string;
}>();

const PACK_ID_BY_TERM_KIND: Partial<Record<TermKind, string>> = {
  condition: 'conditions',
  feat: 'feats',
  spell: 'spells',
  action: 'actions',
};

const rules = useRulesStore();
const isOpen = ref(false);
const loaded = ref(false);
const entryText = ref<RichText>();
const root = ref<HTMLElement>();

let closeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

async function load(): Promise<void> {
  if (loaded.value) {
    return;
  }
  try {
    if (props.termKind === 'trait') {
      const trait = await rules.getTrait(props.slug);
      entryText.value = trait?.text;
    } else {
      const packId = PACK_ID_BY_TERM_KIND[props.termKind];
      const entry =
        packId === undefined ? undefined : await rules.getEntry(packId, props.slug);
      entryText.value = entry?.text;
    }
  } catch {
    entryText.value = undefined;
  }
  loaded.value = true;
}

function open(): void {
  globalThis.clearTimeout(closeTimer);
  isOpen.value = true;
  void load();
}

/** Escape (handled with `.stop` in the template) closes only this term's own popover, not an ancestor's -- nesting means the innermost one closes first. */
function close(): void {
  isOpen.value = false;
}

function toggle(): void {
  if (isOpen.value) {
    close();
  } else {
    open();
  }
}

/** A short delay, cancelled by re-entering either the trigger or the popover, so moving the pointer from one to the other doesn't flicker it closed. */
function scheduleClose(): void {
  globalThis.clearTimeout(closeTimer);
  closeTimer = globalThis.setTimeout(close, 150);
}

function cancelScheduledClose(): void {
  globalThis.clearTimeout(closeTimer);
}

/** Closes when focus leaves the trigger *and* the popover both -- tabbing from the trigger into a link inside the popover must not close it. */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (root.value !== undefined && (next === null || !root.value.contains(next))) {
    close();
  }
}
</script>

<template>
  <span
    ref="root"
    class="rules-term-wrapper"
    @mouseenter="open"
    @mouseleave="scheduleClose"
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="rules-term"
      :aria-expanded="isOpen"
      @click="toggle"
      @focus="open"
      @keydown.escape.stop="close"
    >
      {{ label }}
    </button>
    <span
      v-if="isOpen"
      class="rules-term-popover"
      role="tooltip"
      @mouseenter="cancelScheduledClose"
      @mouseleave="scheduleClose"
    >
      <button
        type="button"
        class="rules-term-popover-close"
        aria-label="Close"
        @click="close"
        @keydown.escape.stop="close"
      >
        ×
      </button>
      <p v-if="!loaded" class="rules-term-loading">Loading…</p>
      <RulesText v-else-if="entryText !== undefined" :nodes="entryText" />
      <p v-else class="rules-term-empty">No details yet.</p>
    </span>
  </span>
</template>

<style scoped>
.rules-term-wrapper {
  position: relative;
  display: inline-block;
}

/*
 * Deliberately NOT the app's usual 44px touch target (tokens.css's global
 * `button` rule) -- an inline term sits inside a sentence of running prose,
 * the same place WCAG 2.5.5 itself carves out an exception for an inline
 * text link. Padding it out to 44px tall would break every paragraph it
 * appears in. The popover's own close button below isn't inline, so it
 * keeps the normal site-wide sizing.
 */
.rules-term {
  min-height: 0;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
  cursor: help;
}

.rules-term-popover {
  position: absolute;
  z-index: var(--z-tooltip);
  top: 100%;
  left: 0;
  display: block;
  min-width: 12rem;
  max-width: 24rem;
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
  text-align: left;
  white-space: normal;
}

.rules-term-popover-close {
  float: right;
  line-height: 1;
}

.rules-term-loading,
.rules-term-empty {
  color: var(--color-text-muted);
  margin: 0;
}
</style>
