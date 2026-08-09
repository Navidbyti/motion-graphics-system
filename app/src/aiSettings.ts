/**
 * The AI key, the model, and what has been spent.
 *
 * Local storage, per machine, like the custom theme. The key is the editor's
 * own — it goes to Google and nowhere else, and nothing about it is in the repo
 * or the installer. That is the whole reason this can exist again: the first
 * version of this feature was deleted because a SHARED key would have needed
 * distributing with the .exe and a proxy to hide it.
 *
 * The spend log is here rather than left to Google's console because a number
 * you have to go and look up is a number nobody looks up. A running total on
 * the same screen as the button is what makes the cost real, and the cap is
 * what makes it bounded.
 */

const KEY = "mg.ai.v1";

export type AiSettings = {
  apiKey: string;
  /**
   * A model id as the API reports it. Not a union: the set of models a key can
   * call changes without this app being rebuilt, and a union would turn a
   * renamed model into a shipped bug. Empty means "not chosen yet" — Settings
   * fills it from the live list.
   */
  model: string;
  /**
   * Dollars per calendar month. Zero means unlimited.
   *
   * A default of five, not nothing. Templates cost fractions of a cent, so five
   * dollars is hundreds of them — high enough never to be hit in normal use,
   * low enough that a loop gone wrong stops before it matters.
   */
  monthlyCap: number;
};

export type SpendEntry = { month: string; cost: number; calls: number };

const DEFAULTS: AiSettings = {
  apiKey: "",
  model: "",
  monthlyCap: 5,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribeAi = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const loadAi = (): AiSettings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : DEFAULTS.apiKey,
      model: typeof raw.model === "string" ? raw.model : DEFAULTS.model,
      monthlyCap:
        typeof raw.monthlyCap === "number" && raw.monthlyCap >= 0
          ? raw.monthlyCap
          : DEFAULTS.monthlyCap,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveAi = (next: Partial<AiSettings>) => {
  localStorage.setItem(KEY, JSON.stringify({ ...loadAi(), ...next }));
  emit();
};

/* ------------------------------------------------------------------ *
 * Spend
 * ------------------------------------------------------------------ */

const SPEND_KEY = "mg.ai.spend.v1";

/** Calendar month, so the cap resets the way a bill does. */
const thisMonth = () => new Date().toISOString().slice(0, 7);

export const loadSpend = (): SpendEntry => {
  try {
    const raw = JSON.parse(localStorage.getItem(SPEND_KEY) ?? "{}");
    // A stored total from a previous month is not this month's spend.
    if (raw.month !== thisMonth()) return { month: thisMonth(), cost: 0, calls: 0 };
    return {
      month: raw.month,
      cost: Number(raw.cost) || 0,
      calls: Number(raw.calls) || 0,
    };
  } catch {
    return { month: thisMonth(), cost: 0, calls: 0 };
  }
};

export const recordSpend = (cost: number) => {
  const current = loadSpend();
  localStorage.setItem(
    SPEND_KEY,
    JSON.stringify({
      month: current.month,
      cost: current.cost + cost,
      calls: current.calls + 1,
    }),
  );
  emit();
};

/**
 * Checked BEFORE a call, not after.
 *
 * Refusing once the cap has already been passed is a cap that is always
 * exceeded by exactly one generation. This one blocks the call that would
 * cross it.
 */
export const overBudget = (settings = loadAi(), spend = loadSpend()) =>
  settings.monthlyCap > 0 && spend.cost >= settings.monthlyCap;
