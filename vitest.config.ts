import { fileURLToPath } from 'node:url';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '~': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        // 内側の層。導出は文字と数だけで確かめられるので、ファイルは 1 つも要らない。
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'test/{app-kernel,domain,application,interface,infrastructure,contracts}/**/*.spec.ts',
            // 起動口は node のコードである。ブラウザーの見立てに載せると node:http が歪む
            'test/frameworks/node/**/*.spec.ts',
          ],
        },
        resolve: { alias },
      },
      {
        // 画面。vite.config.ts は継いでいない — tanstackStart は道の生成と入口の解決を
        // 伴うので、検査の走らせ役に混ぜると壊れる。
        plugins: [viteReact()],
        test: {
          name: 'ui',
          environment: 'happy-dom',
          include: ['test/frameworks/tanstack/**/*.spec.{ts,tsx}'],
          setupFiles: ['test/setup-ui.ts'],
          css: false,
        },
        resolve: { alias },
      },
      {
        // 配りものそのものを外から叩く。npm run build を済ませてあることが前提。
        test: {
          name: 'smoke',
          environment: 'node',
          include: ['test/smoke/**/*.spec.ts'],
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
