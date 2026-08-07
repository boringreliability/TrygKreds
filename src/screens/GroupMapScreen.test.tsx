/**
 * Ward 3: Group Map Screen Tests
 *
 * Feature: Basic location sharing
 * Tests for viewing member locations on a map
 */

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

    it('should disable sharing, which also deletes the stored position', async () => {
      mockLocation.disableLocationSharing.mockResolvedValue({ success: true });

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
      });

      // Deleting the position is disableLocationSharing's job now, so the
      // screen must NOT need a second call to get it right.
      expect(mockLocation.removeMyLocation).not.toHaveBeenCalled();
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
  // Ward 3.3: before profiles existed, every marker and list row read "Member".
  // These assertions use the real formatMemberName/memberInitial helpers --
  // only the location domain is mocked.
  describe('Display names', () => {
    const locationFor = (
      id: string,
      userId: string,
      displayName: string | null
    ) => ({
      id,
      userId,
      groupId: 'group-123',
      latitude: 55.6761,
      longitude: 12.5683,
      accuracy: 10,
      updatedAt: new Date().toISOString(),
      displayName,
    });

    it('should label members by their display name', async () => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: [
          locationFor('loc-1', 'user-1', 'Mor'),
          locationFor('loc-2', 'user-2', 'Far'),
        ],
      });

      const { getAllByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        // Once on the marker, once in the "Last seen" list.
        expect(getAllByText('Mor').length).toBeGreaterThan(0);
        expect(getAllByText('Far').length).toBeGreaterThan(0);
      });
    });

    it('should label my own marker as You', async () => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: [locationFor('loc-1', mockUser.id, 'Mette')],
      });

      const { getAllByText, queryByText } = render(
        <GroupMapScreen {...defaultProps} />
      );

      await waitFor(() => {
        expect(getAllByText('You').length).toBeGreaterThan(0);
      });
      expect(queryByText('Mette')).toBeNull();
    });

    it('should show a neutral placeholder for a member with no display name', async () => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: [locationFor('loc-1', 'user-1', null)],
      });

      const { getAllByText } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getAllByText('Unknown member').length).toBeGreaterThan(0);
      });
    });

    it('should never render a raw user id', async () => {
      mockLocation.getGroupMemberLocations.mockResolvedValue({
        success: true,
        locations: [
          locationFor('loc-1', 'user-1', null),
          locationFor('loc-2', 'user-2', 'Far'),
        ],
      });

      const { getAllByText, queryAllByText } = render(
        <GroupMapScreen {...defaultProps} />
      );

      // "Far" appears twice (marker + list row), hence the All variants here.
      await waitFor(() => {
        expect(getAllByText('Far').length).toBeGreaterThan(0);
      });
      expect(queryAllByText('user-1')).toHaveLength(0);
      expect(queryAllByText('user-2')).toHaveLength(0);
      // Nor the old generic label.
      expect(queryAllByText('Member')).toHaveLength(0);
    });
  });
});
