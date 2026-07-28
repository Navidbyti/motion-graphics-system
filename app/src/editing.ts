/**
 * What the editor is currently doing to the chart, shared between the panel on
 * the right and the stage on the left.
 *
 * These two are far apart in the tree — the stage is a sibling of the form, not
 * a child — so passing this down as props would mean threading it through
 * SchemaForm, which knows nothing about charts and should keep it that way.
 * A tiny store is the smaller change and the honest one: this genuinely is
 * screen-level state, not one component's business.
 *
 * `useSyncExternalStore` rather than a context so a change re-renders only the
 * two places that read it, and so the store can be read from an event handler
 * without a stale closure — which is exactly the bug that made the first
 * attempt at click-to-place misbehave.
 */

import { useSyncExternalStore } from "react";

/** The field waiting for a click, if any. */
export type Picking = {
  /** Index into the annotation array. */
  row: number;
  /** Which field on that annotation the click sets. */
  field: string;
  /** Human wording for the prompt on the stage. */
  label: string;
} | null;

type State = {
  /**
   * Build hands you the geometry with handles on it; Preview plays the render.
   * It lives here rather than in the stage because the panel has to be able to
   * change it — pressing "pick" has to take you somewhere you can click.
   */
  mode: "build" | "preview";
  picking: Picking;
  /** id of the annotation highlighted on the stage and in the list. */
  selected: string | null;
};

let state: State = { mode: "preview", picking: null, selected: null };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const snapshot = () => state;

export const useEditing = () => useSyncExternalStore(subscribe, snapshot);

/** Read outside React — event handlers need the value as of the click. */
export const editingNow = () => state;

export const setMode = (mode: State["mode"]) => {
  if (state.mode === mode) return;
  // Preview cannot be clicked, so an armed field there would leave the panel
  // asking for a click that can never arrive.
  state = { ...state, mode, picking: mode === "build" ? state.picking : null };
  emit();
};

export const setPicking = (picking: Picking) => {
  /*
    Arming implies going where the clicking happens. Leaving the mode alone was
    the earlier design and it is what made this feature look broken: the button
    armed a field on a screen with nothing to click, so pressing it did nothing
    a person could see.
  */
  state = { ...state, picking, mode: picking ? "build" : state.mode };
  emit();
};

export const setSelected = (selected: string | null) => {
  if (state.selected === selected) return;
  state = { ...state, selected, picking: null };
  emit();
};

/** Reset when the edit screen goes away — the store outlives the component. */
export const clearEditing = () => {
  state = { mode: "preview", picking: null, selected: null };
  emit();
};
