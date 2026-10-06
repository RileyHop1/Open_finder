<script setup lang="ts">
/**
 * The chat log: a 90%-opacity panel over the map's bottom-left corner
 * (ADR 0022's map-first layout -- `TableView.vue` positions this
 * component's root, this component owns everything inside it). A plain
 * message, or a `/roll <expression>` command dispatched as a dice roll --
 * milestone 1's "chat with a dice roll," the thin thread's own proof point
 * (CLAUDE.md's Development order section). Every roll renders its
 * term-by-term breakdown in a `<details>` disclosure -- reachable by
 * keyboard and tap, not just mouse hover, unlike a tooltip -- matching the
 * north star's "every roll in chat can be hovered to see exactly how it was
 * calculated."
 *
 * Opens scrolled to the newest message, the same way every other chat
 * client does, and a later message keeps it pinned there -- unless the
 * reader has scrolled up to read history, in which case a new message
 * never yanks the view out from under them.
 *
 * Starts expanded, with its own "Collapse" toggle folding the message list
 * and the input away to just the header bar -- useful once the panel is
 * floating over the map rather than sitting in its own page column.
 */
import { nextTick, onMounted, ref, watch } from 'vue';

import { isPrivateNotice } from './chatNotice.js';
import ChatRollCard from './ChatRollCard.vue';
import { useChatStore } from '../stores/chat.js';
import { useLobbyStore } from '../stores/lobby.js';

const props = defineProps<{ worldId: string }>();

const chatStore = useChatStore();
const lobbyStore = useLobbyStore();
const draft = ref('');

const collapsed = ref(false);

const messagesEl = ref<HTMLElement>();
/** Whether the list should follow new messages down, kept apart from a scroll read every render. */
let stickToBottom = true;
/** Close enough to the bottom that a new message should still pull the view down. */
const NEAR_BOTTOM_PX = 40;

function scrollToBottom(): void {
  const el = messagesEl.value;
  if (el !== undefined) {
    el.scrollTop = el.scrollHeight;
  }
}

function onMessagesScroll(): void {
  const el = messagesEl.value;
  if (el !== undefined) {
    stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }
}

watch(
  () => chatStore.messages.length,
  async () => {
    if (stickToBottom) {
      await nextTick();
      scrollToBottom();
    }
  },
);

onMounted(async () => {
  await chatStore.load(props.worldId);
  await nextTick();
  scrollToBottom();
});

function seatName(seatId: string): string {
  return lobbyStore.seats.find((seat) => seat.id === seatId)?.name ?? 'Unknown';
}

const ROLL_COMMAND = /^\/roll\s+(.+)$/i;

/** Which plain roll's GM-edit form (if any) is open, and its draft value. A dedicated `ChatRollCard` handles its own editing state; a plain `/roll` has no such component, so this lives here instead. */
const editingRollId = ref<string>();
const rollEditDraft = ref('');

function startEditingRoll(messageId: string, currentTotal: number): void {
  rollEditDraft.value = String(currentTotal);
  editingRollId.value = messageId;
}

async function submitRollEdit(messageId: string): Promise<void> {
  const total = Number.parseInt(rollEditDraft.value, 10);
  editingRollId.value = undefined;
  if (Number.isNaN(total)) {
    return;
  }
  await chatStore.adjustRoll(messageId, total);
}

async function handleSubmit(): Promise<void> {
  const value = draft.value.trim();
  if (value.length === 0) {
    return;
  }
  draft.value = '';
  // Sending a message is always a reason to follow it down, even if the
  // reader had scrolled up to read history first.
  stickToBottom = true;
  const match = ROLL_COMMAND.exec(value);
  if (match?.[1] !== undefined) {
    await chatStore.sendRoll(match[1]);
  } else {
    await chatStore.sendMessage(value);
  }
}
</script>

<template>
  <section aria-labelledby="chat-heading" class="chat-log">
    <header class="chat-header">
      <h2 id="chat-heading">Chat</h2>
      <button
        type="button"
        class="chat-toggle"
        :aria-expanded="!collapsed"
        aria-controls="chat-body"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? 'Expand' : 'Collapse' }}
      </button>
    </header>

    <div id="chat-body" v-show="!collapsed">
      <p v-if="chatStore.error" role="alert" class="status status-error">
        {{ chatStore.error }}
      </p>

      <ul ref="messagesEl" class="messages" aria-live="polite" @scroll="onMessagesScroll">
        <li v-for="entry in chatStore.messages" :key="entry.id" class="message">
          <template v-if="'pending' in entry">
            <span class="pending">
              {{ entry.kind === 'roll' ? `Rolling ${entry.expression}…` : entry.text }}
            </span>
          </template>
          <p
            v-else-if="entry.kind === 'text' && isPrivateNotice(entry)"
            class="chat-notice"
          >
            <span class="notice-label">Notice</span> {{ entry.text }}
          </p>
          <template v-else-if="entry.kind === 'text'">
            <span class="sender">{{ seatName(entry.seatId) }}:</span>
            <span>{{ entry.text }}</span>
          </template>
          <ChatRollCard
            v-else-if="
              entry.kind === 'check' ||
              entry.kind === 'strikeAttack' ||
              entry.kind === 'strikeDamage'
            "
            :message="entry"
            :sender="seatName(entry.seatId)"
            :is-gm="lobbyStore.mySeat?.isGM === true"
          />
          <template v-else-if="entry.kind === 'itemUse'">
            <span class="sender">{{ entry.actorName }} used {{ entry.itemName }}:</span>
            <span v-if="entry.text">{{ entry.text }}</span>
            <details v-if="entry.roll" class="roll-breakdown">
              <summary>Total: {{ entry.roll.total }}</summary>
              <ul>
                <li v-for="(term, index) in entry.roll.terms" :key="index">
                  <template v-if="term.kind === 'die'">
                    d{{ term.faces }}: {{ term.result
                    }}<span v-if="!term.kept"> (dropped)</span>
                  </template>
                  <template v-else-if="term.kind === 'constant'">
                    {{ term.value >= 0 ? '+' : '' }}{{ term.value }}
                  </template>
                  <template v-else>@{{ term.name }}: {{ term.value }}</template>
                </li>
              </ul>
            </details>
          </template>
          <template v-else>
            <span class="sender"
              >{{ seatName(entry.seatId) }} rolled {{ entry.roll.expression }}:</span
            >
            <template v-if="entry.gmTotal !== undefined">
              GM set to <strong>{{ entry.gmTotal }}</strong> (rolled
              {{ entry.roll.total }})
            </template>
            <details class="roll-breakdown">
              <summary>Total: {{ entry.roll.total }}</summary>
              <ul>
                <li v-for="(term, index) in entry.roll.terms" :key="index">
                  <template v-if="term.kind === 'die'">
                    d{{ term.faces }}: {{ term.result
                    }}<span v-if="!term.kept"> (dropped)</span>
                  </template>
                  <template v-else-if="term.kind === 'constant'">
                    {{ term.value >= 0 ? '+' : '' }}{{ term.value }}
                  </template>
                  <template v-else>@{{ term.name }}: {{ term.value }}</template>
                </li>
              </ul>
            </details>
            <template v-if="lobbyStore.mySeat?.isGM === true">
              <button
                v-if="editingRollId !== entry.id"
                type="button"
                class="gm-edit-toggle"
                @click="startEditingRoll(entry.id, entry.gmTotal ?? entry.roll.total)"
              >
                Edit roll
              </button>
              <form v-else class="gm-edit" @submit.prevent="submitRollEdit(entry.id)">
                <label :for="`gm-total-${entry.id}`">GM total</label>
                <input
                  :id="`gm-total-${entry.id}`"
                  v-model="rollEditDraft"
                  type="number"
                />
                <button type="submit">Set</button>
                <button type="button" @click="editingRollId = undefined">Cancel</button>
              </form>
            </template>
          </template>
        </li>
      </ul>
      <p v-if="chatStore.messages.length === 0" class="empty">No messages yet.</p>

      <form class="chat-form" @submit.prevent="handleSubmit">
        <label for="chat-input">Message</label>
        <input
          id="chat-input"
          v-model="draft"
          type="text"
          autocomplete="off"
          placeholder="Type a message, or /roll 1d20+7"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
/* A 90%-opacity panel over the map (ADR 0022), not a page column: readable
   against the map underneath without fully hiding it. `color-mix` keeps
   this working for both the light and dark token values in tokens.css
   without a second, opacity-aware color variable. */
.chat-log {
  width: min(22rem, 100%);
  max-height: min(60vh, 28rem);
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-surface) 90%, transparent);
  color: var(--color-text);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.chat-header h2 {
  margin: 0;
}

.chat-toggle {
  min-height: var(--touch-target-min);
}

#chat-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.messages {
  list-style: none;
  padding: 0;
  margin: var(--space-3) 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
  overflow-y: auto;
}

.message {
  padding: var(--space-1) 0;
}

.sender {
  font-weight: 600;
  margin-right: var(--space-1);
}

.pending {
  color: var(--color-text-muted);
  font-style: italic;
}

.chat-notice {
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
}

.notice-label {
  font-weight: 700;
  margin-right: var(--space-1);
}

.roll-breakdown summary {
  cursor: pointer;
}

.gm-edit {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.gm-edit input {
  width: 6rem;
}

.gm-edit-toggle,
.gm-edit button {
  min-height: var(--touch-target-min);
  margin-top: var(--space-1);
}

.roll-breakdown ul {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-4);
}

.empty {
  color: var(--color-text-muted);
}

.chat-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.chat-form input {
  flex: 1;
}
</style>
