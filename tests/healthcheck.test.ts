/**
 * Ward 0: Project Healthcheck Tests
 *
 * Feature: Project healthcheck
 *   In order to verify the project is correctly set up
 *   As a developer
 *   I want a simple healthcheck test to pass
 *
 * Scenario: Jest test suite runs successfully
 *   Given the project dependencies are installed
 *   When I run the test suite
 *   Then all tests should pass
 */

describe('Project Healthcheck', () => {
  describe('Basic arithmetic', () => {
    it('should correctly add 1 + 1', () => {
      expect(1 + 1).toBe(2);
    });

    it('should correctly multiply 2 * 3', () => {
      expect(2 * 3).toBe(6);
    });
  });

  describe('Environment', () => {
    it('should have Jest configured correctly', () => {
      expect(typeof describe).toBe('function');
      expect(typeof it).toBe('function');
      expect(typeof expect).toBe('function');
    });

    it('should support TypeScript', () => {
      const greeting: string = 'Hello, TrygKreds!';
      expect(greeting).toBe('Hello, TrygKreds!');
    });
  });
});
