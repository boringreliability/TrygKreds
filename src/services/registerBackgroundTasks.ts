/**
 * Registers background task handlers as a side effect of being imported.
 *
 * This has to happen at module load, before React renders anything. The OS can
 * deliver a background event into a cold start, and a task whose handler is not
 * yet defined at that moment is simply dropped -- silently, and only on the
 * launches that matter.
 *
 * Imported for its side effect by app/_layout.tsx.
 */

import { defineBackgroundLocationTask } from './backgroundLocation';

defineBackgroundLocationTask();
