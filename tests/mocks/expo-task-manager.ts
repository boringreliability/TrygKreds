/**
 * Mock for expo-task-manager module
 */

export const defineTask = jest.fn();
export const isTaskRegisteredAsync = jest.fn();
export const unregisterTaskAsync = jest.fn();
export const getRegisteredTasksAsync = jest.fn();

export default {
  defineTask,
  isTaskRegisteredAsync,
  unregisterTaskAsync,
  getRegisteredTasksAsync,
};
