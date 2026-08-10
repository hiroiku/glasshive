import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { thirdPartyNotices } from './scripts/generate-third-party-notices.ts';

export default defineConfig(({ command }) => ({
  // 開発中もローカルだけで待ち受ける。`Host` が合わない求めは Vite 自身が 403 で断る —
  // 127.0.0.1 に縛るだけでは、`Host` を差し替えてローカルに化けた求めを止められない。
  server: {
    host: '127.0.0.1',
    /* パッケージ版と同じポート番号から試す。開発サーバーもパッケージ版も同じ glasshive なので、
       ユーザーが覚えるポート番号は 1 つでよい。

       **空いていなければ次のポートへ譲る。** パッケージ版が既に 4483 を握っているときに
       起動そのものを断ると、動かしたまま手を入れられなくなる。
       譲った先のポート番号は Vite が起動時に出力する。 */
    port: 4483,
    strictPort: false,
    allowedHosts: ['127.0.0.1', 'localhost'],
  },

  // `tsconfig` の `paths`(`~/*`)をそのまま効かせる
  resolve: { tsconfigPaths: true },

  /* パッケージを 1 つで完結させる。外部依存のままにすると、`npx` で入れた先に
     その名前が無い日が来る — ユーザーには「起動しない」としか見えない。

     **バンドルするのはビルドのときだけ。** 開発中にバンドルすると、react のような CommonJS の
     パッケージを Vite の開発時のランタイムがそのまま評価できず、`module is not defined` で
     画面が出なくなる。開発中は素のまま読み込ませればよく、パッケージの中身には関わらない。 */
  ...(command === 'build' ? { environments: { ssr: { resolve: { noExternal: true } } } } : {}),

  plugins: [
    tanstackStart({
      srcDirectory: 'src',

      // エントリーは 4 つとも `srcDirectory` からの相対で解決される。
      // `server` のエントリーを自分で置くのは必須で、置かないと出力されるファイル名が
      // 仮のエントリー名になり、ランチャーから参照するパスが版ごとに動く。
      start: { entry: './frameworks/tanstack/start.ts' },
      router: {
        entry: './frameworks/tanstack/router.tsx',
        routesDirectory: 'frameworks/tanstack/routes',
        generatedRouteTree: 'frameworks/tanstack/routeTree.gen.ts',
      },
      client: { entry: './frameworks/tanstack/client.tsx' },
      server: { entry: './frameworks/tanstack/server.ts' },

      // 画面はブラウザーだけが描く。サーバー側でレンダリングすると、観測の求めと描画が
      // 同じ処理に混ざる。
      spa: { enabled: true },

      // 層の境界をバンドラーに守らせる。外の世界に触る層がブラウザー側のバンドルに紛れ込んだら
      // ビルドが落ちる — レビューで見つける前提にせず、バンドラーが毎回検証する。
      //
      // `files` は既定を「足す」のではなく「置き換える」ので、既定の `**/*.server.*` を
      // 自分で並べ直している。これを落とすと、ファイル名でサーバー専用と示したもののガードが
      // 黙って消える。(`specifiers` の方は既定と混ぜられるため、こちらは足すだけでよい)
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

    // 取り込んだパッケージのライセンス表示を書き出す。バンドルし終えた後のモジュールの一覧を
    // 見るので、他のプラグインより後ろに置く
    thirdPartyNotices(),
  ],
}));
