/**
 * Ward 3: Group Map Screen Tests
 *
 * Feature: Basic location sharing
 * Tests for viewing member locations on a map
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GroupMapScreen } from './GroupMapScreen';
import * as location from '../domain/location';
import * as locationService from '../services/location';

jest.mock('../domain/location');
jest.mock('../services/location');

const mockLocation = location as jest.Mocked<typeof location>;
const mockLocationService = locationService as jest.Mocked<typeof locationService>;

// Mock react-native-maps - uses the mock from jest.config.js moduleNameMapper

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

const defaultProps = {
  groupId: 'group-123',
  groupName: 'Family',
  onBack: jest.fn(),
};

describe('GroupMapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockLocation.getLocationSharingStatus.mockResolvedValue({
      success: true,
      status: { userId: mockUser.id, groupId: 'group-123', sharingEnabled: false },
    });
    mockLocation.getGroupMemberLocations.mockResolvedValue({
      success: true,
      locations: [],
    });
    mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
  });

  describe('Map display', () => {
    it('should render the map view', async () => {
      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('map-view')).toBeTruthy();
      });
    });

    it('should display group name in header', async () => {
      const { getByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('Family')).toBeTruthy();
      });
    });
  });

  describe('View members on the map', () => {
    const mockLocations: location.MemberLocation[] = [
      {
        id: 'loc-1',
        userId: 'user-1',
        groupId: 'group-123',
        latitude: 55.6761,
        longitude: 12.5683,
        accuracy: 10,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'loc-2',
        userId: 'user-2',
        groupId: 'group-123',
        latitude: 55.6762,
        longitude: 12.5684,
        accuracy: 15,
        updatedAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: mockLocations,
      });
    });

    it('should display markers for members with locations', async () => {
      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('marker-55.6761')).toBeTruthy();
        expect(getByTestId('marker-55.6762')).toBeTruthy();
      });
    });

    it('should show last seen time for members', async () => {
      const { getAllByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const lastSeenTexts = getAllByText(/Last seen/i);
        expect(lastSeenTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Enable location sharing', () => {
    it('should show location sharing toggle', async () => {
      const { getByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/Share my location/i)).toBeTruthy();
      });
    });

    it('should request permission when enabling sharing', async () => {
      mockLocationService.requestForegroundPermission.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });
      mockLocationService.getCurrentLocation.mockResolvedValue({
        success: true,
        coordinates: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
      });
      mockLocation.enableLocationSharing.mockResolvedValue({ success: true });
      mockLocation.updateMyLocation.mockResolvedValue({
        success: true,
        location: {
          id: 'loc-123',
          userId: mockUser.id,
          groupId: 'group-123',
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: 10,
          updatedAt: new Date().toISOString(),
        },
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const toggle = getByTestId('location-sharing-toggle');
        fireEvent(toggle, 'valueChange', true);
      });

      await waitFor(() => {
        expect(mockLocationService.requestForegroundPermission).toHaveBeenCalled();
      });
    });

    it('should update location after enabling sharing', async () => {
      mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });
      mockLocationService.requestForegroundPermission.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });
      mockLocationService.getCurrentLocation.mockResolvedValue({
        success: true,
        coordinates: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
      });
      mockLocation.enableLocationSharing.mockResolvedValue({ success: true });
      mockLocation.updateMyLocation.mockResolvedValue({
        success: true,
        location: {
          id: 'loc-123',
          userId: mockUser.id,
          groupId: 'group-123',
          latitude: 55.6761,
          longitude: 12.5683,
          accuracy: 10,
          updatedAt: new Date().toISOString(),
        },
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const toggle = getByTestId('location-sharing-toggle');
        fireEvent(toggle, 'valueChange', true);
      });

      await waitFor(() => {
        expect(mockLocation.enableLocationSharing).toHaveBeenCalledWith(
          mockUser.id,
          'group-123'
        );
        expect(mockLocation.updateMyLocation).toHaveBeenCalled();
      });
    });
  });

  describe('Deny location permission', () => {
    it('should show explanation when permission is denied', async () => {
      mockLocationService.requestForegroundPermission.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const { getByTestId, getByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const toggle = getByTestId('location-sharing-toggle');
        fireEvent(toggle, 'valueChange', true);
      });

      await waitFor(() => {
        expect(getByText(/Location permission is required/i)).toBeTruthy();
      });
    });

    it('should not enable sharing when permission is denied', async () => {
      mockLocationService.requestForegroundPermission.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const toggle = getByTestId('location-sharing-toggle');
        fireEvent(toggle, 'valueChange', true);
      });

      await waitFor(() => {
        expect(mockLocation.enableLocationSharing).not.toHaveBeenCalled();
      });
    });
  });

  describe('Disable location sharing', () => {
    beforeEach(() => {
      mockLocation.getLocationSharingStatus.mockResolvedValue({
        success: true,
        status: { userId: mockUser.id, groupId: 'group-123', sharingEnabled: true },
      });
    });

    it('should disable sharing and remove location', async () => {
      mockLocation.disableLocationSharing.mockResolvedValue({ success: true });
      mockLocation.removeMyLocation.mockResolvedValue({ success: true });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        const toggle = getByTestId('location-sharing-toggle');
        fireEvent(toggle, 'valueChange', false);
      });

      await waitFor(() => {
        expect(mockLocation.disableLocationSharing).toHaveBeenCalledWith(
          mockUser.id,
          'group-123'
        );
        expect(mockLocation.removeMyLocation).toHaveBeenCalledWith(
          mockUser.id,
          'group-123'
        );
      });
    });
  });

  describe('Members list', () => {
    it('should show member count', async () => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: [
          {
            id: 'loc-1',
            userId: 'user-1',
            groupId: 'group-123',
            latitude: 55.6761,
            longitude: 12.5683,
            accuracy: 10,
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      const { getByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/1 member/i)).toBeTruthy();
      });
    });
  });
});
