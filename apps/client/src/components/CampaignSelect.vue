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
 */
import { onMounted, ref } from 'vue';

import { useWorldsStore } from '../stores/worlds.js';

const store = useWorldsStore();
const newCampaignName = ref('');

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
        <button v-else type="button" @click="store.activate(world.id)">Activate</button>
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
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
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
