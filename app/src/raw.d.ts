/**
 * Vite's `?raw` suffix returns a module's contents as a string. TypeScript has
 * no idea about that, so the import needs declaring.
 *
 * Used by Docs.tsx to show the template guide and the contract without keeping
 * a second copy of either inside a component.
 */
declare module "*.md?raw" {
  const content: string;
  export default content;
}
