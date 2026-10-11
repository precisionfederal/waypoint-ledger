import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** The unit suite. It imports the SAME modules the app and the Cloudflare functions
 *  import — never a copy — so a rule that changes in lib/ or cf/functions/ is caught here. */
export default defineConfig({
  // Next preserves JSX for its compiler; Vitest must transform it for Node.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    // Heavy data checks take 5-13 s while agents and image jobs load the machine (load average 97
    // on 2026-09-30 night); a busy machine must not fail a correct answer. No assertion changes.
    testTimeout: 20_000,
  },
});
