<script setup lang="ts">
/**
 * Renders a `RichText` value (`docs/rules-reference.md`): the one AST
 * every piece of rules text uses, whether it was converted from upstream
 * HTML at import time or written by us for the reference book (ADR 0020).
 * Recurses on itself for every node kind that nests (`paragraph`,
 * `heading`, `strong`, `em`, a list's items), so a `term` buried inside a
 * list item inside a paragraph renders the same way a top-level one does.
 *
 * A `term` node is rendered as plain, marked-up text only -- no tooltip
 * yet. `RulesTerm.vue` (the next PR in this stack) gives it the actual
 * hover/focus/tap popover; this component only needs to know a term
 * exists and show its label, so that PR can swap in the real behavior
 * without this one changing shape.
 */
import type { RichText } from '@hearthtable/core';

defineProps<{ nodes: RichText }>();
</script>

<template>
  <template v-for="(node, index) in nodes" :key="index">
    <template v-if="node.kind === 'text'">{{ node.value }}</template>
    <strong v-else-if="node.kind === 'strong'"
      ><RulesText :nodes="node.children"
    /></strong>
    <em v-else-if="node.kind === 'em'"><RulesText :nodes="node.children" /></em>
    <p v-else-if="node.kind === 'paragraph'"><RulesText :nodes="node.children" /></p>
    <component :is="`h${node.level}`" v-else-if="node.kind === 'heading'">
      <RulesText :nodes="node.children" />
    </component>
    <component :is="node.ordered ? 'ol' : 'ul'" v-else-if="node.kind === 'list'">
      <li v-for="(item, itemIndex) in node.items" :key="itemIndex">
        <RulesText :nodes="item" />
      </li>
    </component>
    <span v-else-if="node.kind === 'term'" class="rules-term">{{ node.label }}</span>
  </template>
</template>

<style scoped>
.rules-term {
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
}
</style>
