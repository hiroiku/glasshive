import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 描いたものは検査ごとに片付ける。残すと、次の検査が前の画面を見てしまう
afterEach(() => cleanup());
