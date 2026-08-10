import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 描いたものはテストごとに片付ける。残すと、次のテストが前の画面を見てしまう
afterEach(() => cleanup());
