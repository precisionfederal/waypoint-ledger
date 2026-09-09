import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** The unit suite. It imports the SAME modules the app and the Cloudflare functions
 *  import — never a copy — so a rule that changes in lib/ or cf/functions/ is caught here. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
