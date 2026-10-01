<script setup lang="ts">
/**
 * The chat log: shown alongside the seat list in CampaignLobby. A plain
 * message, or a `/roll <expression>` command dispatched as a dice roll --
 * milestone 1's "chat with a dice roll," the thin thread's own proof point
 * (CLAUDE.md's Development order section). Every roll renders its
 * term-by-term breakdown in a `<details>` disclosure -- reachable by
 * keyboard and tap, not just mouse hover, unlike a tooltip -- matching the
 * north star's "every roll in chat can be hovered to see exactly how it was
 * calculated."
 */
import { onMounted, ref } from 'vue';

import ChatRollCard from './ChatRollCard.vue';
import { useChatStore } from '../stores/chat.js';
import { useLobbyStore } from '../stores/lobby.js';

const props = defineProps<{ worldId: string }>();

const chatStore = useChatStore();
const lobbyStore = useLobbyStore();
const draft = ref('');

onMounted(() => {
  void chatStore.load(props.worldId);
});

function seatName(seatId: string): string {
  return lobbyStore.seats.find((seat) => seat.id === seatId)?.name ?? 'Unknown';
}

const ROLL_COMMAND = /^\/roll\s+(.+)$/i;

async function handleSubmit(): Promise<void> {
  const value = draft.value.trim();
  if (value.length === 0) {
    return;
  }
  draft.value = '';
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
    <h2 id="chat-heading">Chat</h2>
    <p v-if="chatStore.error" role="alert" class="status status-error">
      {{ chatStore.error }}
    </p>

    <ul class="messages" aria-live="polite">
      <li v-for="entry in chatStore.messages" :key="entry.id" class="message">
        <template v-if="'pending' in entry">
          <span class="pending">
            {{ entry.kind === 'roll' ? `Rolling ${entry.expression}…` : entry.text }}
          </span>
        </template>
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
        />
        <template v-else>
          <span class="sender"
            >{{ seatName(entry.seatId) }} rolled {{ entry.roll.expression }}:</span
          >
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
  </section>
</template>

<style scoped>
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
  flex-direction: column;
  gap: var(--space-2);
  max-height: 20rem;
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

.roll-breakdown summary {
  cursor: pointer;
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
