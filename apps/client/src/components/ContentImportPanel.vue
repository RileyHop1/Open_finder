<script setup lang="ts">
/**
 * The GM's "game content" control: the button that imports the rules data so
 * nobody has to open a terminal (CLAUDE.md, Distribution; ADR 0016). It is the
 * first thing a GM sees on a table with no content, written for someone who
 * has never heard of an importer, and folds down to a quiet line once content
 * is loaded.
 *
 * The import itself runs on the server, as a separate process, and takes a minute
 * or two; this polls its status every couple of seconds while it runs, says so
 * in words (the table stays playable meanwhile), and tells the parent
 * (`imported`) when it has finished so panels that listed content can look
 * again. A failure is explained in a sentence with the technical detail behind
 * a disclosure, and can be retried.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';

import {
  type ContentStatus,
  getContentStatus,
  getImportStatus,
  type ImportState,
  startImport,
} from '../api/contentImport.js';

const emit = defineEmits<{ imported: [] }>();

const POLL_MS = 2000;

const content = ref<ContentStatus>();
const importState = ref<ImportState>({ state: 'idle' });
const problem = ref<string>();
const elapsedSeconds = ref(0);
let timer: ReturnType<typeof globalThis.setInterval> | undefined;

const hasContent = computed(() => content.value?.available === true);
const running = computed(() => importState.value.state === 'running');
const entryCountText = computed(() =>
  (content.value?.entryCount ?? 0).toLocaleString('en-US'),
);

async function refresh(): Promise<void> {
  try {
    const before = importState.value.state;
    const next = await getImportStatus();
    importState.value = next;
    if (next.state === 'running') {
      const started = Date.parse(next.startedAt);
      elapsedSeconds.value = Math.max(0, Math.round((Date.now() - started) / 1000));
      startPolling();
      return;
    }
    stopPolling();
    if (before === 'running') {
      content.value = await getContentStatus();
      if (next.state === 'done') {
        emit('imported');
      }
    }
  } catch (caught) {
    stopPolling();
    problem.value =
      caught instanceof Error ? caught.message : 'could not check the import';
  }
}

function startPolling(): void {
  timer ??= globalThis.setInterval(() => void refresh(), POLL_MS);
}

function stopPolling(): void {
  if (timer !== undefined) {
    globalThis.clearInterval(timer);
    timer = undefined;
  }
}

async function begin(): Promise<void> {
  problem.value = undefined;
  try {
    importState.value = await startImport();
    elapsedSeconds.value = 0;
    startPolling();
  } catch (caught) {
    problem.value =
      caught instanceof Error ? caught.message : 'could not start the import';
  }
}

onMounted(async () => {
  try {
    content.value = await getContentStatus();
  } catch (caught) {
    problem.value =
      caught instanceof Error ? caught.message : 'could not check the game content';
    return;
  }
  // A page opened mid-import (or reloaded) picks the running one up.
  await refresh();
});

onUnmounted(stopPolling);
</script>

<template>
  <section
    v-if="content"
    class="content-import"
    :class="{ prominent: !hasContent }"
    aria-labelledby="content-import-heading"
  >
    <template v-if="!hasContent || running || importState.state === 'failed'">
      <h2 id="content-import-heading">
        {{ hasContent ? 'Game content' : 'This table has no game content yet' }}
      </h2>
      <p v-if="!hasContent && !running" class="explain">
        Items, conditions, classes, and the rest of the rules text come from the
        Pathfinder Remaster rules data. Importing downloads it onto this computer; nothing
        is uploaded. It needs an internet connection and takes a minute or two, and
        everyone can keep playing meanwhile.
      </p>

      <p v-if="running" role="status" class="progress">
        Importing game content… this usually takes a minute or two. It has been
        {{ elapsedSeconds }} seconds.
      </p>

      <template v-else-if="importState.state === 'failed'">
        <p role="alert" class="failure">{{ importState.message }}</p>
        <details v-if="importState.detail" class="detail">
          <summary>Technical details</summary>
          <pre>{{ importState.detail }}</pre>
        </details>
      </template>

      <button v-if="!running" type="button" @click="begin">
        {{
          importState.state === 'failed'
            ? 'Try again'
            : hasContent
              ? 'Import again'
              : 'Import game content'
        }}
      </button>
    </template>

    <details v-else class="loaded">
      <summary id="content-import-heading">
        Game content: {{ entryCountText }} entries loaded
      </summary>
      <p v-if="importState.state === 'done'" role="status">Import finished.</p>
      <p class="explain">
        Importing again fetches the same version of the rules data and replaces what is
        loaded.
      </p>
      <button type="button" @click="begin">Import again</button>
    </details>

    <p v-if="problem" role="alert" class="failure">{{ problem }}</p>

    <p class="notice">
      Rules content is from the Pathfinder Remaster, published under the ORC license by
      Paizo Inc., and is fetched from the community pf2e data repository. It is stored
      only on this computer.
    </p>
  </section>
  <p v-else-if="problem" role="alert" class="failure">{{ problem }}</p>
</template>

<style scoped>
.content-import {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

/* No content yet: this is the first thing to do, so it is not quiet. */
.prominent {
  border-width: 2px;
  border-color: var(--color-accent);
  padding: var(--space-3);
}

h2,
p {
  margin: 0;
}

h2 {
  font-size: 1.125rem;
}

.explain,
.notice {
  color: var(--color-text-muted);
}

.notice {
  font-size: 0.875rem;
}

.failure {
  color: var(--color-danger);
  font-weight: 600;
}

button,
summary {
  min-height: var(--touch-target-min);
}

summary {
  cursor: pointer;
  display: flex;
  align-items: center;
}

button {
  align-self: flex-start;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: var(--space-1) 0 0;
}
</style>
