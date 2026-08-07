/**
 * Jest setup, applied to every suite.
 */

import { configure } from '@testing-library/react-native';

/**
 * Give the async helpers (waitFor, findBy*) a wall-clock budget that survives
 * slow hardware.
 *
 * Their default is 1000ms, which is separate from Jest's own test timeout and is
 * the one that actually bites. React Native resolves many of its modules with
 * lazy require()s, so on a cold Babel cache that transformation happens *during*
 * the first render -- synchronous work that eats the budget without any of the
 * awaited promises being slow. Locally the first GroupMapScreen test takes ~370ms
 * warm and over 4s cold; a CI runner is slower again.
 *
 * This buys room for slow environments, not for slow assertions: a query that is
 * genuinely wrong still fails, just later.
 */
configure({ asyncUtilTimeout: 15000 });
