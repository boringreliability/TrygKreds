/**
 * Ward 1: Groups Screen Tests
 *
 * Feature: Authentication and basic app shell
 * Scenario: User sees empty list of groups after sign in
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { GroupsScreen } from './GroupsScreen';

// Mock the auth context
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
};

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    signOut: jest.fn(),
  }),
}));

describe('GroupsScreen', () => {
  describe('Initial render', () => {
    it('should show the groups screen title', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText('My Groups')).toBeTruthy();
    });

    it('should show empty state message when no groups', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText("You're not in any groups yet")).toBeTruthy();
    });

    it('should show create group button', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText('Create Group')).toBeTruthy();
    });

    it('should show join group button', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText('Join Group')).toBeTruthy();
    });
  });

  describe('User info', () => {
    it('should display signed in user email', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText('test@example.com')).toBeTruthy();
    });

    it('should show sign out button', () => {
      const { getByText } = render(<GroupsScreen />);

      expect(getByText('Sign Out')).toBeTruthy();
    });
  });
});
