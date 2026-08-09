import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // 開発中も手元だけで待ち受ける。Host が合わない求めは Vite 自身が 403 で断る —
  // 127.0.0.1 に縛るだけでは、名前を差し替えて手元に化けた求めを止められない。
  server: {
    host: '127.0.0.1',
    // 配りものの隣。組んだものと開発中のものを、番号で見分けられる
    port: 4484,
    strictPort: true,
    allowedHosts: ['127.0.0.1', 'localhost'],
  },

  // tsconfig の paths(~/*)をそのまま効かせる
  resolve: { tsconfigPaths: true },

  /* 配りものを 1 つで完結させる。外に置いたままにすると、npx で入った先に
     その名前が無い日が来る — 観る人には「起動しない」としか見えない。

     **組み立てのときだけ束ねる。** 開発中に束ねると、react のような古い形の名前を
     Vite の走らせ役がそのまま評価できず、`module is not defined` で画面が出なくなる。
     開発中は素のまま読み込ませればよく、配りものの中身には関わらない。 */
  ...(command === 'build' ? { environments: { ssr: { resolve: { noExternal: true } } } } : {}),

  plugins: [
    tanstackStart({
      srcDirectory: 'src',

      // 入口は 4 つとも srcDirectory からの相対で解かれる。
      // server の入口を自分で置くのは必須で、置かないと出る名前が仮の入口名になり、
      // 起動口から参照する道が版ごとに動く。
      start: { entry: './frameworks/tanstack/start.ts' },
      router: {
        entry: './frameworks/tanstack/router.tsx',
        routesDirectory: 'frameworks/tanstack/routes',
        generatedRouteTree: 'frameworks/tanstack/routeTree.gen.ts',
      },
      client: { entry: './frameworks/tanstack/client.tsx' },
      server: { entry: './frameworks/tanstack/server.ts' },

      // 画面はブラウザーだけが描く。サーバーが描くと、観測の求めと描画が同じ処理に混ざる。
      spa: { enabled: true },

      // 層の境目を束ね役に守らせる。外の世界に触る層がブラウザー側の束に紛れ込んだら
      // 組み立てが落ちる — 人の目で見張る代わりに、機械が毎回見る。
      //
      // files は既定を「足す」のではなく「置き換える」ので、既定の **/*.server.* を
      // 自分で並べ直している。これを落とすと、名前で示したサーバー専用の見張りが黙って消える。
      // (specifiers の方は既定と混ぜられるため、こちらは足すだけでよい)
      importProtection: {
        behavior: { dev: 'error', build: 'error' },
        client: {
          files: [
            '**/*.server.*',
            '**/src/composition/**',
            '**/src/infrastructure/**',
            '**/src/interface/controllers/**',
          ],
          specifiers: [
            'node:fs',
            'node:fs/promises',
            'node:child_process',
            'node:os',
            'node:path',
            'node:http',
          ],
        },
      },
    }),
    viteReact(),
  ],
}));
