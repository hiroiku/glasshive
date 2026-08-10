import { fileURLToPath } from 'node:url';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '~': fileURLToPath(new URL('./src', import.meta.url)) };

/* テストはスレッドで走らせる。**プロセスには分けない。**

   分けるとワーカーの数だけ node を起こすことになり、そのぶんが待ち時間の大半を占める。
   分けずに済むのは、テストどうしが同じプロセスの中で衝突しないからである —
   作業ディレクトリを移すテストは 1 つも無く、`process.env` はスレッドごとに写しが渡り、
   書き込みは `mkdtemp` の下だけなので隣のスレッドと同じ場所を掴むこともない。 */
const pool = 'threads' as const;

export default defineConfig({
  test: {
    projects: [
      {
        // 内側の層。導出は文字列と数値だけで確かめられるので、ファイルは 1 つも要らない。
        test: {
          name: 'unit',
          pool,
          environment: 'node',
          include: [
            'test/{app-kernel,domain,application,interface,infrastructure,contracts}/**/*.spec.ts',
            // ランチャーは node のコードである。ブラウザーを模した環境に載せると `node:http` が歪む
            'test/frameworks/node/**/*.spec.ts',
          ],
        },
        resolve: { alias },
      },
      {
        /* 画面。`vite.config.ts` は継がず、要るプラグインだけを並べ直す。

           `tanstackStart` を入れてあるのは、ルートのファイルが `createFileRoute` を
           そのままでは解決できないからである。**エントリーと出力の指定は `vite.config.ts` と
           揃えておく** — 揃えないと、テストの側が別の場所へルートの木を書き出す。 */
        plugins: [
          tanstackStart({
            srcDirectory: 'src',
            start: { entry: './frameworks/tanstack/start.ts' },
            router: {
              entry: './frameworks/tanstack/router.tsx',
              routesDirectory: 'frameworks/tanstack/routes',
              generatedRouteTree: 'frameworks/tanstack/routeTree.gen.ts',
            },
            client: { entry: './frameworks/tanstack/client.tsx' },
            server: { entry: './frameworks/tanstack/server.ts' },
            spa: { enabled: true },
          }),
          viteReact(),
        ],
        test: {
          name: 'ui',
          pool,
          environment: 'happy-dom',
          include: ['test/frameworks/tanstack/**/*.spec.{ts,tsx}'],
          setupFiles: ['test/setup-ui.ts'],
          css: false,
        },
        resolve: { alias },
      },
      {
        // ビルド成果物そのものを外から叩く。`npm run build` を済ませてあることが前提。
        test: {
          name: 'smoke',
          pool,
          environment: 'node',
          include: ['test/smoke/**/*.spec.ts'],
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
