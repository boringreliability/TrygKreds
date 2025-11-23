/**
 * Simple healthcheck module for Ward 0
 * Demonstrates that the domain layer is working correctly
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function isHealthy(): boolean {
  return true;
}

export const APP_NAME = 'TrygKreds';
export const APP_VERSION = '1.0.0';
