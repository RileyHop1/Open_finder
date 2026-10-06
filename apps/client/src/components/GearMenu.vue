<script setup lang="ts">
/**
 * The table's own menu, for everything that isn't the map: who you're
 * playing as, opening the character sheet, GM scene, Rules, Seats, Manage
 * party, or Game content drawers, releasing the current seat, and the GM's
 * "Back to campaigns". Lives floated over the map (ADR 0022,
 * `feat/fullscreen-table-shell`) since the screen no longer has a toolbar
 * row -- or any page chrome at all -- to put these in (`feat/chrome-into-
 * gear-menu`: "Playing as" and the GM's content-import panel used to be
 * their own rows above the map).
 *
 * A plain `menu` button: arrow keys, Home and End move between items, and
 * Escape closes it and returns focus to the gear button -- the same
 * keyboard pattern as `map/TokenMenu.vue`, adapted to a menu that owns its
 * own open/closed state (there is no parent-level pointerdown interceptor
 * at the table level the way `MapView.vue` is for `TokenMenu.vue`). Closing
 * when focus leaves the menu is `StatBreakdown.vue`'s `@focusout` pattern,
 * reused rather than a new global click listener.
 *
 * Deliberately store-agnostic: every item is an emit, and the caller
 * decides what it does (same as `TokenMenu.vue`) -- this component has no
 * idea what a drawer or a seat is.
 */
import { nextTick, ref, useTemplateRef } from 'vue';

defineProps<{
  /** Whether the GM-only items (Scenes, Manage party, Game content, Back to campaigns) should show. */
  isGm: boolean;
  /** This seat's name, shown as the dropdown's own header line. */
  seatName: string;
}>();

const emit = defineEmits<{
  characters: [];
  scenes: [];
  rules: [];
  seats: [];
  manageParty: [];
  gameContent: [];
  releaseSeat: [];
  leaveCampaign: [];
}>();

const root = useTemplateRef<HTMLElement>('root');
const button = useTemplateRef<HTMLElement>('button');
const open = ref(false);

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    items()[0]?.focus();
  }
}

function close(): void {
  if (open.value) {
    open.value = false;
    button.value?.focus();
  }
}

function items(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

/**
 * Closes (and refocuses the gear button) *before* emitting, not after: an
 * item opening a drawer (`useDrawer.ts`'s `show()`) captures whatever
 * element is focused at that moment as the one to return focus to when the
 * drawer later closes. Emitting first would hand it this menu's own item,
 * which is about to be removed from the DOM by the close below -- Escape in
 * the drawer would then try to refocus a detached node instead of the gear
 * button.
 */
function select(
  item:
    | 'characters'
    | 'scenes'
    | 'rules'
    | 'seats'
    | 'manageParty'
    | 'gameContent'
    | 'releaseSeat'
    | 'leaveCampaign',
): void {
  close();
  switch (item) {
    case 'characters':
      emit('characters');
      break;
    case 'scenes':
      emit('scenes');
      break;
    case 'rules':
      emit('rules');
      break;
    case 'seats':
      emit('seats');
      break;
    case 'manageParty':
      emit('manageParty');
      break;
    case 'gameContent':
      emit('gameContent');
      break;
    case 'releaseSeat':
      emit('releaseSeat');
      break;
    case 'leaveCampaign':
      emit('leaveCampaign');
      break;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  const list = items();
  const at = list.findIndex((item) => item === item.ownerDocument.activeElement);
  const target: Record<string, number> = {
    ArrowDown: (at + 1) % list.length,
    ArrowUp: (at - 1 + list.length) % list.length,
    Home: 0,
    End: list.length - 1,
  };
  const next = target[event.key];
  if (next !== undefined) {
    event.preventDefault();
    list[next]?.focus();
  }
}

/** Closes when focus leaves the button and the menu both -- moving focus from the button into a menu item must not close it. */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (root.value !== null && (next === null || !root.value.contains(next))) {
    close();
  }
}
</script>

<template>
  <div ref="root" class="gear-menu" @focusout="onFocusOut" @keydown="onKeyDown">
    <button
      ref="button"
      type="button"
      class="gear-button"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="Table menu"
      @click="toggle"
    >
      ⚙
    </button>
    <div v-if="open" class="gear-dropdown">
      <p class="gear-seat">
        Playing as <strong>{{ seatName }}</strong>
      </p>
      <ul role="menu" aria-label="Table menu" class="gear-items">
        <li role="none">
          <button type="button" role="menuitem" @click="select('characters')">
            Characters
          </button>
        </li>
        <li v-if="isGm" role="none">
          <button type="button" role="menuitem" @click="select('scenes')">Scenes</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" @click="select('rules')">Rules</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" @click="select('seats')">Seats</button>
        </li>
        <li v-if="isGm" role="none">
          <button type="button" role="menuitem" @click="select('manageParty')">
            Manage party
          </button>
        </li>
        <li v-if="isGm" role="none">
          <button type="button" role="menuitem" @click="select('gameContent')">
            Game content
          </button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" @click="select('releaseSeat')">
            Release seat
          </button>
        </li>
        <li v-if="isGm" role="none">
          <button type="button" role="menuitem" @click="select('leaveCampaign')">
            Back to campaigns
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.gear-menu {
  position: fixed;
  top: var(--space-2);
  right: var(--space-2);
  z-index: var(--z-gear-menu);
}

.gear-button {
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
  font-size: 1.25rem;
  cursor: pointer;
}

.gear-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin: var(--space-1) 0 0;
  min-width: 14rem;
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--overlay-shadow);
}

/* A static header line, not a menu item: who you're playing as, same text
   the page used to show above the map in its own row (`.playing-as`). */
.gear-seat {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--overlay-border);
  color: var(--color-text-muted);
}

.gear-items {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
}

.gear-items [role='menuitem'] {
  width: 100%;
  min-height: var(--touch-target-min);
  text-align: left;
}
</style>
