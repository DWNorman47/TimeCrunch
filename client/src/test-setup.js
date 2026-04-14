import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL doesn't auto-cleanup with vitest — unmount rendered trees between tests
afterEach(() => cleanup());
