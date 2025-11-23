/**
 * Ward 2: Groups Screen Tests
 *
 * Feature: Groups
 * Scenario: User sees list of groups or empty state
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { GroupsScreen } from './GroupsScreen';
import * as groups from '../domain/groups';

jest.mock('../domain/groups');
const mockGroups = groups as jest.Mocked<typeof groups>;

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial render with no groups', () => {
    beforeEach(() => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [],
      });
    });

    it('should show the groups screen title after loading', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('My Groups')).toBeTruthy();
      });
    });

    it('should show empty state message when no groups', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText("You're not in any groups yet")).toBeTruthy();
      });
    });

    it('should show create group button', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('Create Group')).toBeTruthy();
      });
    });

    it('should show join group button', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('Join Group')).toBeTruthy();
      });
    });
  });

  describe('User info', () => {
    beforeEach(() => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [],
      });
    });

    it('should display signed in user email', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('test@example.com')).toBeTruthy();
      });
    });

    it('should show sign out button', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('Sign Out')).toBeTruthy();
      });
    });
  });

  describe('With groups', () => {
    const mockGroupsList: groups.GroupWithRole[] = [
      {
        id: 'group-1',
        name: 'Family',
        ownerId: mockUser.id,
        inviteCode: 'ABC123',
        createdAt: new Date().toISOString(),
        role: 'owner',
      },
      {
        id: 'group-2',
        name: 'Friends',
        ownerId: 'other-user',
        inviteCode: 'DEF456',
        createdAt: new Date().toISOString(),
        role: 'member',
      },
    ];

    beforeEach(() => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: mockGroupsList,
      });
    });

    it('should display group names', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('Family')).toBeTruthy();
        expect(getByText('Friends')).toBeTruthy();
      });
    });

    it('should display user role for each group', async () => {
      const { getByText } = render(<GroupsScreen />);

      await waitFor(() => {
        expect(getByText('Owner')).toBeTruthy();
        expect(getByText('Member')).toBeTruthy();
      });
    });
  });
});
