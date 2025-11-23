/**
 * Ward 1: Auth Domain Tests
 *
 * Feature: Authentication and basic app shell
 * Tests for auth domain logic (mocking Supabase client)
 */

import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  validateEmail,
  validatePassword,
  type User,
} from './auth';

// Mock Supabase client
const mockSupabaseAuth = {
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  getUser: jest.fn(),
};

// Mock the supabase module
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSupabaseAuth.signUp(...args),
      signInWithPassword: (...args: unknown[]) =>
        mockSupabaseAuth.signInWithPassword(...args),
      signOut: () => mockSupabaseAuth.signOut(),
      getUser: () => mockSupabaseAuth.getUser(),
    },
  },
}));

describe('Auth Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateEmail', () => {
    it('should return true for valid email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@nodomain.com')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return valid for password with 8+ characters', () => {
      const result = validatePassword('password123');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for password shorter than 8 characters', () => {
      const result = validatePassword('short');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters');
    });

    it('should return invalid for empty password', () => {
      const result = validatePassword('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Password is required');
    });
  });

  describe('signUp', () => {
    it('should sign up user with valid credentials', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      };

      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: { id: mockUser.id, email: mockUser.email, created_at: mockUser.createdAt } },
        error: null,
      });

      const result = await signUp('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return error for invalid email', async () => {
      const result = await signUp('invalid-email', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
      expect(mockSupabaseAuth.signUp).not.toHaveBeenCalled();
    });

    it('should return error for weak password', async () => {
      const result = await signUp('test@example.com', 'short');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters');
      expect(mockSupabaseAuth.signUp).not.toHaveBeenCalled();
    });

    it('should handle Supabase error', async () => {
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already exists' },
      });

      const result = await signUp('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already exists');
    });
  });

  describe('signIn', () => {
    it('should sign in user with valid credentials', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      };

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: mockUser.id, email: mockUser.email, created_at: mockUser.createdAt } },
        error: null,
      });

      const result = await signIn('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return error for invalid credentials', async () => {
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });

      const result = await signIn('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid login credentials');
    });

    it('should return error for invalid email format', async () => {
      const result = await signIn('invalid', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
      expect(mockSupabaseAuth.signInWithPassword).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('should sign out successfully', async () => {
      mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

      const result = await signOut();

      expect(result.success).toBe(true);
      expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
    });

    it('should handle sign out error', async () => {
      mockSupabaseAuth.signOut.mockResolvedValue({
        error: { message: 'Network error' },
      });

      const result = await signOut();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('getCurrentUser', () => {
    it('should return user when signed in', async () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      };

      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: { id: mockUser.id, email: mockUser.email, created_at: mockUser.createdAt } },
        error: null,
      });

      const user = await getCurrentUser();

      expect(user).toEqual(mockUser);
    });

    it('should return null when not signed in', async () => {
      mockSupabaseAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });
  });
});
