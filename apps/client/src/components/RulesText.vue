<script setup lang="ts">
/**
 * Renders a `RichText` value (`docs/rules-reference.md`): the one AST
 * every piece of rules text uses, whether it was converted from upstream
 * HTML at import time or written by us for the reference book (ADR 0020).
 * Recurses on itself for every node kind that nests (`paragraph`,
 * `heading`, `strong`, `em`, a list's items), so a `term` buried inside a
 * list item inside a paragraph renders the same way a top-level one does.
 *
 * A `term` node renders as its own `RulesTerm`, which is what makes
 * nesting work at all: a term's own popover content is itself rendered
 * through this component (`RulesTerm.vue`), so a term mentioned inside
 * another term's text gets its own hover/focus/tap popover, stacked on
 * top rather than replacing the one already open.
 */
import type { RichText } from '@hearthtable/core';

import RulesTerm from './RulesTerm.vue';

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
    <RulesTerm
      v-else-if="node.kind === 'term'"
      :term-kind="node.termKind"
      :slug="node.slug"
      :label="node.label"
    />
  </template>
</template>
