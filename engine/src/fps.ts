/**
 * The frame rate, on its own so it can be imported without pulling in Root.
 *
 * Root registers every composition, which means importing it from a module
 * that Root itself imports would be a cycle — and a cycle around a `const` is
 * the fragile kind, resolving to undefined depending on which module the
 * bundler happens to evaluate first. Re-exported from Root so nothing that
 * already imports it there has to change.
 */
export const FPS = 30;
