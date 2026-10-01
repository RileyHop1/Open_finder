/**
 * The behaviour every slide-over drawer on the table shares: open and close, put
 * focus in the drawer when it opens, and give it back to whatever opened it when
 * it closes (so a keyboard user is never left on a hidden element). The caller
 * passes the drawer's root element (a `useTemplateRef`), which needs
 * `tabindex="-1"`, and binds Escape (`@keydown.esc.stop="hide"`) and
 * `v-show="open"`.
 */

import { nextTick, type Ref, ref } from 'vue';

export function useDrawer(el: Readonly<Ref<HTMLElement | null>>) {
  const open = ref(false);
  let opener: HTMLElement | null = null;

  /** Opens the drawer (or just refocuses it if it is open already). */
  async function show(): Promise<void> {
    if (!open.value) {
      const active = el.value?.ownerDocument.activeElement;
      opener = active instanceof HTMLElement ? active : null;
      open.value = true;
    }
    await nextTick();
    el.value?.focus();
  }

  function hide(): void {
    if (!open.value) {
      return;
    }
    open.value = false;
    opener?.focus();
    opener = null;
  }

  return { open, show, hide };
}
