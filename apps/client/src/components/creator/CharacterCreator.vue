<script setup lang="ts">
/**
 * The full-screen character creator (milestone 8, `docs/character-build.md`).
 * A step rail down the left, the current step in the middle, and the real
 * character sheet on the right, live, so every choice shows what it does as
 * it is made (the north star: character building feels like a game).
 *
 * This is the shell: the rail, Back/Next, the name, the saved draft and the
 * preview. Each step's content arrives in its own PR; until then a step shows a
 * placeholder. Nothing is created yet and nothing is sent anywhere.
 *
 * It is keyboard-complete: focus moves in when it opens and back to what
 * opened it when it closes, Tab stays inside, Escape closes it and keeps the
 * draft. The draft is saved in this browser as it changes.
 */
import type { BuildRef } from '@hearthtable/pf2e';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  useTemplateRef,
  watch,
} from 'vue';

import CharacterSheet from '../sheet/CharacterSheet.vue';
import AncestryStep from './AncestryStep.vue';
import BackgroundStep from './BackgroundStep.vue';
import {
  CREATOR_STEPS,
  clearDraft,
  loadDraft,
  nextStep,
  previewOf,
  previousStep,
  saveDraft,
} from './creatorModel.js';
import { useCreatorEntries } from './useCreatorEntries.js';

const emit = defineEmits<{ close: [] }>();

const draft = reactive(loadDraft());
const root = useTemplateRef<HTMLElement>('root');
let opener: HTMLElement | null = null;

watch(draft, () => saveDraft(draft), { deep: true });

const entries = useCreatorEntries(() => draft.build);
const preview = computed(() => previewOf(draft, entries));

/** Picking an ancestry clears the heritage: it belonged to the one before. */
function pickAncestry(ref: BuildRef | undefined): void {
  draft.build.ancestry = ref;
  draft.build.heritage = undefined;
}
const index = computed(() => CREATOR_STEPS.findIndex((s) => s.id === draft.step));
const current = computed(() => CREATOR_STEPS[index.value]);

onMounted(() => {
  const active = root.value?.ownerDocument.activeElement;
  opener = active instanceof HTMLElement ? active : null;
  root.value?.focus();
});

onBeforeUnmount(() => {
  opener?.focus();
});

function discard(): void {
  clearDraft();
  Object.assign(draft, loadDraft());
}

/** Keeps Tab inside the creator: from the last control it wraps to the first, and back. */
function trapTab(event: KeyboardEvent): void {
  const el = root.value;
  if (el === null) {
    return;
  }
  const controls = [
    ...el.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    ),
  ];
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = el.ownerDocument.activeElement;
  if (first === undefined || last === undefined) {
    return;
  }
  if (event.shiftKey && (active === first || active === el)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <div
    ref="root"
    class="creator"
    role="dialog"
    aria-modal="true"
    aria-labelledby="creator-title"
    tabindex="-1"
    @keydown.esc.stop="emit('close')"
    @keydown.tab="trapTab"
  >
    <header class="creator-header">
      <h2 id="creator-title">Create a character</h2>
      <label class="name">
        Character name
        <input v-model="draft.name" type="text" maxlength="100" autocomplete="off" />
      </label>
      <button type="button" class="discard" @click="discard">Start over</button>
      <button type="button" class="close" @click="emit('close')">Close</button>
    </header>

    <div class="creator-body">
      <nav class="rail" aria-label="Creation steps">
        <ol>
          <li v-for="(step, i) in CREATOR_STEPS" :key="step.id">
            <button
              type="button"
              :aria-current="step.id === draft.step ? 'step' : undefined"
              @click="draft.step = step.id"
            >
              <span class="number">{{ i + 1 }}</span>
              {{ step.label }}
            </button>
          </li>
        </ol>
      </nav>

      <main class="step" aria-live="polite">
        <AncestryStep
          v-if="draft.step === 'ancestry'"
          :build="draft.build"
          :ancestry="entries.ancestry"
          @pick-ancestry="pickAncestry"
          @pick-heritage="(ref) => (draft.build.heritage = ref)"
        />
        <BackgroundStep
          v-else-if="draft.step === 'background'"
          :build="draft.build"
          :background="entries.background"
          @pick-background="(ref) => (draft.build.background = ref)"
        />
        <template v-else>
          <h3>{{ current?.label }}</h3>
          <p class="placeholder">This step arrives in an upcoming update.</p>
        </template>
      </main>

      <aside class="preview" aria-label="Character preview">
        <CharacterSheet :actor="preview.actor" />
      </aside>
    </div>

    <footer class="creator-footer">
      <button
        type="button"
        :disabled="index <= 0"
        @click="draft.step = previousStep(draft.step)"
      >
        Back
      </button>
      <span class="progress">Step {{ index + 1 }} of {{ CREATOR_STEPS.length }}</span>
      <button
        type="button"
        :disabled="index >= CREATOR_STEPS.length - 1"
        @click="draft.step = nextStep(draft.step)"
      >
        Next
      </button>
    </footer>
  </div>
</template>

<style scoped>
.creator {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-drawer) + 5);
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text);
}

.creator-header,
.creator-footer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.creator-footer {
  justify-content: space-between;
  border-top: 1px solid var(--color-border);
  border-bottom: 0;
}

.creator-header h2 {
  margin: 0;
}

.name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

button,
.name input {
  min-height: var(--touch-target-min);
}

.creator-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 14rem minmax(0, 1fr) minmax(18rem, 28rem);
  min-height: 0;
}

.rail,
.step,
.preview {
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
}

.rail ol {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rail button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  text-align: left;
}

/* The current step is marked by weight and an underline, never colour alone. */
.rail button[aria-current='step'] {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.3em;
}

.number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
}

.step h3 {
  margin-top: 0;
}

.placeholder {
  color: var(--color-text-muted);
}

.preview {
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
}
</style>
