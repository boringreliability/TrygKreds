/**
 * Mock for expo-task-manager
 *
 * defineTask stores the handler so tests can invoke it directly -- that handler
 * is the only part of the background task the OS would normally call.
 */

type TaskHandler = (body: {
  data?: unknown;
  error?: unknown;
}) => void | Promise<void>;

const definedTasks = new Map<string, TaskHandler>();

export const defineTask = jest.fn((name: string, handler: TaskHandler) => {
  definedTasks.set(name, handler);
});

export const isTaskDefined = jest.fn((name: string) => definedTasks.has(name));

export const unregisterTaskAsync = jest.fn(async (name: string) => {
  definedTasks.delete(name);
});

export const isTaskRegisteredAsync = jest.fn(async (name: string) =>
  definedTasks.has(name)
);

/** Test helpers, not part of the real module. */
export const __getTaskHandler = (name: string) => definedTasks.get(name);
export const __resetTasks = () => definedTasks.clear();

export default {
  defineTask,
  isTaskDefined,
  unregisterTaskAsync,
  isTaskRegisteredAsync,
};
