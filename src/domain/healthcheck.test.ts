/**
 * Ward 0: Domain Healthcheck Tests
 *
 * Tests for the healthcheck domain module
 */

import { add, isHealthy, APP_NAME, APP_VERSION } from './healthcheck';

describe('Healthcheck Domain', () => {
  describe('add function', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(add(-1, -1)).toBe(-2);
    });

    it('should add zero', () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('isHealthy function', () => {
    it('should return true', () => {
      expect(isHealthy()).toBe(true);
    });
  });

  describe('Constants', () => {
    it('should have correct app name', () => {
      expect(APP_NAME).toBe('TrygKreds');
    });

    it('should have a valid version', () => {
      expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
