/**
 * Where pasted templates live.
 *
 * localStorage, deliberately. A template is a few kilobytes of JSON that
 * belongs to the person using this machine, and putting it behind the render
 * server would mean it stops existing when the server is not running — which
 * is exactly when someone is most likely to be pasting one in and looking at
 * the Library.
 *
 * They are also exportable as a file, because a template that can only exist
 * inside one installation cannot be shared, backed up, or submitted for
 * inclusion — and the submission route is written into TERMS.md as something
 * people are invited to do.
 */

import { templateFileSchema, type TemplateFile } from "@engine/authoring/format";

const KEY = "motion.customTemplates.v1";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribeTemplates = (l: () => void) => {
  listeners.add(l);
  // Returns nothing on purpose — useEffect treats any returned value as a
  // cleanup function, and Set.delete's boolean is not one.
  return () => {
    listeners.delete(l);
  };
};

/**
 * Anything that no longer parses is dropped rather than crashing the Library.
 *
 * A stored template can stop being valid — the format gains a rule, or a file
 * was hand-edited. Losing one template from the grid is recoverable; a Library
 * that throws on load is not, and it would take every other template with it.
 */
export const loadTemplates = (): TemplateFile[] => {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: TemplateFile[] = [];
  for (const item of raw) {
    const parsed = templateFileSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
};

const write = (list: TemplateFile[]) => {
  localStorage.setItem(KEY, JSON.stringify(list));
  emit();
};

/**
 * Save, replacing any template with the same id.
 *
 * Replace rather than reject: pasting a corrected version of a template is the
 * common case — it is the second half of the fix-it-with-the-AI loop — and
 * making people delete the broken one first would be friction at precisely the
 * moment they are already annoyed.
 */
export const saveTemplate = (file: TemplateFile) => {
  const list = loadTemplates().filter((t) => t.id !== file.id);
  write([...list, file]);
};

export const removeTemplate = (id: string) => {
  write(loadTemplates().filter((t) => t.id !== id));
};
