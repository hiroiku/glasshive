import { StartClient } from '@tanstack/react-start/client';
import { hydrateRoot } from 'react-dom/client';

// StrictMode は入れない。SSE の変更通知で届く更新と二重実行の相性が悪く、
// 同じ更新が二度描かれる。
hydrateRoot(document, <StartClient />);
