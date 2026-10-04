<script setup lang="ts">
/**
 * The GM's first screen (CLAUDE.md's Development order section, and the
 * milestone 1 user story: "GM opens the app and sees their campaigns, picks
 * one"). Lists every campaign, lets the GM create one, and lets them
 * activate one -- the server then serves that campaign to connecting
 * clients. There is no login distinguishing a GM from a player at this
 * point (ADR 0007: no accounts); this screen is simply what the app shows
 * before any campaign is active, or when someone wants to change which one
 * is.
 *
 * Delete is reachable here, never from the lobby -- this screen only shows
 * once nothing is active (App.vue's own switch), so there is no risk of
 * deleting a campaign out from under a table that is on it. Asked for with
 * an inline confirmation, the same `role="alertdialog"` pattern the map's
 * exit confirmation uses (`MapView.vue`), since it is permanent.
 */
import { onMounted, ref } from 'vue';

import { useWorldsStore } from '../stores/worlds.js';

const store = useWorldsStore();
const newCampaignName = ref('');
const confirmingDeleteId = ref<string>();

onMounted(() => {
  void store.refresh();
});

async function handleCreate(): Promise<void> {
  const name = newCampaignName.value.trim();
  if (name.length === 0) {
    return;
  }
  await store.create(name);
  newCampaignName.value = '';
}

async function confirmDelete(id: string): Promise<void> {
  confirmingDeleteId.value = undefined;
  await store.remove(id);
}
</script>

<template>
  <section aria-labelledby="campaign-select-heading">
    <h2 id="campaign-select-heading">Campaigns</h2>

    <p v-if="store.error" role="alert" class="status status-error">{{ store.error }}</p>
    <p v-else-if="store.loading" role="status">Loading campaigns…</p>

    <ul v-if="store.worlds.length > 0" class="campaign-list">
      <li v-for="world in store.worlds" :key="world.id" class="campaign-row">
        <span class="campaign-name">{{ world.name }}</span>
        <span v-if="world.id === store.activeWorldId" class="active-badge">Active</span>
        <template v-else>
          <button type="button" @click="store.activate(world.id)">Activate</button>
          <button type="button" @click="confirmingDeleteId = world.id">Delete</button>
        </template>
        <div
          v-if="confirmingDeleteId === world.id"
          class="delete-confirm"
          role="alertdialog"
          :aria-labelledby="`delete-question-${world.id}`"
          @keydown.esc.stop="confirmingDeleteId = undefined"
        >
          <p :id="`delete-question-${world.id}`">
            Permanently delete <strong>{{ world.name }}</strong
            >? This cannot be undone.
          </p>
          <button type="button" @click="confirmDelete(world.id)">Delete campaign</button>
          <button type="button" @click="confirmingDeleteId = undefined">Cancel</button>
        </div>
      </li>
    </ul>
    <p v-else-if="!store.loading">No campaigns yet. Create one below.</p>

    <form class="create-campaign" @submit.prevent="handleCreate">
      <label for="new-campaign-name">New campaign name</label>
      <input
        id="new-campaign-name"
        v-model="newCampaignName"
        type="text"
        name="name"
        required
        autocomplete="off"
      />
      <button type="submit">Create campaign</button>
    </form>
  </section>
</template>

<style scoped>
.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

/**
 * "Active" is conveyed by the badge's text, not by this color alone
 * (CLAUDE.md's Accessibility section) -- a screen reader announces the word
 * "Active" regardless, and the color is reinforcement, not the signal.
 */
.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.campaign-list {
  list-style: none;
  padding: 0;
  margin: var(--space-3) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.campaign-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.delete-confirm {
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin-top: var(--space-2);
  border: 2px solid var(--color-danger);
  border-radius: 4px;
}

.delete-confirm p {
  margin: 0;
  flex-basis: 100%;
}

.campaign-name {
  flex: 1;
  font-weight: 600;
}

.active-badge {
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
  background: var(--color-success);
  color: var(--color-accent-contrast);
  font-size: 0.875rem;
}

.create-campaign {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
</style>
