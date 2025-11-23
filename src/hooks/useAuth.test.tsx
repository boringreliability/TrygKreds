/**
 * Ward 1: useAuth Hook Tests
 *
 * Feature: Authentication and basic app shell
 * Tests for the useAuth hook and AuthProvider
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './useAuth';
import * as auth from '../domain/auth';

// Mock the auth domain
jest.mock('../domain/auth');
const mockAuth = auth as jest.Mocked<typeof auth>;

// Mock supabase auth state change listener
const mockOnAuthStateChange = jest.fn();
jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockOnAuthStateChange.mockImplementation(callback);
        return {
          data: { subscription: { unsubscribe: jest.fn() } },
        };
      },
    },
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.getCurrentUser.mockResolvedValue(null);
  });

  describe('Initial state', () => {
    it('should start with loading true', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('should have no user initially', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('When user is signed in', () => {
    it('should return user data', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      };
      mockAuth.getCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('signOut', () => {
    it('should clear user on sign out', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
      };
      mockAuth.getCurrentUser.mockResolvedValue(mockUser);
      mockAuth.signOut.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockAuth.signOut).toHaveBeenCalled();
    });
  });
});
