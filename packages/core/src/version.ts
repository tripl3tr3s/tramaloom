/**
 * Bumped whenever an existing module draws differently for the same document
 * and hash. Share links record it so old links can warn instead of silently
 * changing. New modules or new params whose defaults reproduce old output do
 * not need a bump. The golden test in test/golden.test.ts enforces this.
 */
export const ENGINE_VERSION = 1;
