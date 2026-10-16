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
import type { Attribute, BuildRef, FeatSlot } from '@hearthtable/pf2e';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
  watch,
} from 'vue';

import CharacterSheet from '../sheet/CharacterSheet.vue';
import AncestryStep from './AncestryStep.vue';
import BackgroundStep from './BackgroundStep.vue';
import AttributesStep from './AttributesStep.vue';
import ClassChoicesStep from './ClassChoicesStep.vue';
import ClassStep from './ClassStep.vue';
import EquipmentStep from './EquipmentStep.vue';
import FeatsStep from './FeatsStep.vue';
import ReviewStep from './ReviewStep.vue';
import SkillsStep from './SkillsStep.vue';
import SpellsStep from './SpellsStep.vue';
import { togglePick } from './spellPlan.js';
import type { BoostSectionId } from './boostPlan.js';
import { type EquipmentLine, addLine, setQuantity } from './equipmentPlan.js';
import { createCharacterFromDraft, newActorWaiter } from './createCharacter.js';
import {
  CREATOR_STEPS,
  buildOf,
  clearDraft,
  loadDraft,
  nextStep,
  previewOf,
  previousStep,
  saveDraft,
} from './creatorModel.js';
import { useCreatorEntries } from './useCreatorEntries.js';
import { useDocumentsStore } from '../../stores/documents.js';

const emit = defineEmits<{ close: []; created: [actorId: string] }>();

const draft = reactive(loadDraft());
const root = useTemplateRef<HTMLElement>('root');
let opener: HTMLElement | null = null;

watch(draft, () => saveDraft(draft), { deep: true });

const entries = useCreatorEntries(() => draft.build);
const preview = computed(() => previewOf(draft, entries));

const documents = useDocumentsStore();
const creating = ref(false);
const failure = ref<string>();

/** Makes the character on the server from the draft, then hands it over and closes. */
async function create(): Promise<void> {
  creating.value = true;
  failure.value = undefined;
  const result = await createCharacterFromDraft(
    {
      name: draft.name,
      build: buildOf(draft, entries),
      keyAttribute: draft.keyAttribute,
      equipment: draft.equipment,
    },
    {
      send: (type, payload) => documents.send(type, payload),
      knownActorIds: () => new Set(documents.actors.map((a) => a.id)),
      waitForNewActor: newActorWaiter(() => documents.actors),
      lastError: () => documents.error,
    },
  );
  creating.value = false;
  if (result.ok) {
    clearDraft();
    emit('created', result.actorId);
    emit('close');
    return;
  }
  if (result.actorId !== undefined) {
    // The character exists, so a second Create would make a duplicate: forget the draft and
    // finish on the sheet rather than lose the work done.
    clearDraft();
    failure.value = `${result.message}. The character was made, so you can finish it on its sheet.`;
    emit('created', result.actorId);
    return;
  }
  failure.value = `${result.message}. Nothing was created; your choices are kept.`;
}

/** Picking a class clears the key attribute, class choices, class feat and spells: they belonged to the one before. */
function pickClass(ref: BuildRef | undefined): void {
  draft.build.class = ref;
  draft.keyAttribute = undefined;
  draft.build.classChoices = {};
  draft.build.feats = draft.build.feats.filter((f) => f.slot !== 'class');
  draft.build.spells = { cantrips: [], ranked: [] };
}

/** Picking an ancestry clears the heritage: it belonged to the one before. */
function pickAncestry(ref: BuildRef | undefined): void {
  draft.build.ancestry = ref;
  draft.build.heritage = undefined;
  delete draft.boostPicks.ancestry;
  draft.build.feats = draft.build.feats.filter((f) => f.slot !== 'ancestry');
}

/** Picking a background clears its boost choice: the options belonged to the one before. */
function pickBackground(ref: BuildRef | undefined): void {
  draft.build.background = ref;
  delete draft.boostPicks['background-choice'];
}

function buyItem(item: Omit<EquipmentLine, 'quantity'>): void {
  draft.equipment = addLine(draft.equipment, item);
}

function changeQuantity(packId: string, slug: string, quantity: number): void {
  draft.equipment = setQuantity(draft.equipment, packId, slug, quantity);
}

/** Sets the feat in one slot, replacing the one before; `undefined` clears it. */
function pickFeat(slot: string, level: number, ref: BuildRef | undefined): void {
  const others = draft.build.feats.filter((f) => !(f.slot === slot && f.level === level));
  draft.build.feats =
    ref === undefined
      ? others
      : [...others, { slot: slot as FeatSlot, level, feat: ref }];
}

/** Turns one skill on or off in the picks. */
function toggleSkill(skill: string): void {
  const picked = draft.build.trainedSkills;
  draft.build.trainedSkills = picked.includes(skill)
    ? picked.filter((s) => s !== skill)
    : [...picked, skill];
}

/** Turns one attribute on or off in one boost section. */
function toggleBoost(section: BoostSectionId, attribute: Attribute): void {
  const picked = draft.boostPicks[section] ?? [];
  draft.boostPicks[section] = picked.includes(attribute)
    ? picked.filter((a) => a !== attribute)
    : [...picked, attribute];
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
          @pick-background="pickBackground"
        />
        <ClassStep
          v-else-if="draft.step === 'class'"
          :build="draft.build"
          :class-entry="entries.class"
          :key-attribute="draft.keyAttribute"
          @pick-class="pickClass"
          @pick-key-attribute="(attribute) => (draft.keyAttribute = attribute)"
        />
        <AttributesStep
          v-else-if="draft.step === 'attributes'"
          :entries="entries"
          :picks="draft.boostPicks"
          :key-attribute="draft.keyAttribute"
          @toggle="toggleBoost"
        />
        <EquipmentStep
          v-else-if="draft.step === 'equipment'"
          :lines="draft.equipment"
          @add="buyItem"
          @quantity="changeQuantity"
        />
        <FeatsStep
          v-else-if="draft.step === 'feats'"
          :build="draft.build"
          :ancestry="entries.ancestry"
          :background="entries.background"
          :class-entry="entries.class"
          @pick="pickFeat"
        />
        <SpellsStep
          v-else-if="draft.step === 'spells'"
          :build="draft.build"
          :class-entry="entries.class"
          @toggle="
            (which, ref) =>
              (draft.build.spells = togglePick(draft.build.spells, which, ref))
          "
        />
        <SkillsStep
          v-else-if="draft.step === 'skills'"
          :entries="entries"
          :boost-picks="draft.boostPicks"
          :key-attribute="draft.keyAttribute"
          :picked="draft.build.trainedSkills"
          @toggle="toggleSkill"
        />
        <ClassChoicesStep
          v-else-if="draft.step === 'class-choices'"
          :build="draft.build"
          :class-entry="entries.class"
          :features="entries.classFeatures"
          @pick="(choice, value) => (draft.build.classChoices[choice] = value)"
        />
        <ReviewStep
          v-else-if="draft.step === 'review'"
          :draft="draft"
          :warnings="preview.warnings"
          :actor="preview.actor"
          :names="{
            ancestry: entries.ancestry?.name,
            heritage: entries.heritage?.name,
            background: entries.background?.name,
            class: entries.class?.name,
          }"
          :creating="creating"
          :failure="failure"
          @create="create"
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

/* The table menu (gear) button floats fixed over the top-right corner at a higher
   z-index than any panel, so the header leaves room for it or it would sit on Close. */
.creator-header {
  padding-right: calc(var(--touch-target-min) + var(--space-2) + var(--space-3));
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
