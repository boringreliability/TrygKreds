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
import * as sharingControl from '../services/sharingControl';

jest.mock('../domain/location');
jest.mock('../services/location');
jest.mock('../services/sharingControl');

const mockLocation = location as jest.Mocked<typeof location>;
const mockLocationService = locationService as jest.Mocked<
  typeof locationService
>;
const mockSharing = sharingControl as jest.Mocked<typeof sharingControl>;

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
      status: {
        userId: mockUser.id,
        groupId: 'group-123',
        sharingEnabled: false,
      },
    });
    mockLocation.getGroupMemberLocations.mockResolvedValue({
      success: true,
      locations: [],
    });
    mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    // Ward 6: the screen delegates the enable/disable lifecycle -- including the
    // background task rule -- to sharingControl.
    mockSharing.startSharing.mockResolvedValue({
      success: true,
      backgroundRunning: true,
    });
    mockSharing.stopSharing.mockResolvedValue({
      success: true,
      backgroundRunning: false,
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
        expect(
          mockLocationService.requestForegroundPermission
        ).toHaveBeenCalled();
      });
    });

    // Ward 6: sending the position on enable is sharingControl's job, tested in
    // src/services/sharingControl.test.ts. The screen's job is to delegate.
    it('should delegate enabling to sharingControl', async () => {
      mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', true);
      });

      await waitFor(() => {
        expect(mockSharing.startSharing).toHaveBeenCalledWith(
          mockUser.id,
          'group-123'
        );
      });
      // The screen must not reimplement any of it.
      expect(mockLocation.enableLocationSharing).not.toHaveBeenCalled();
      expect(mockLocation.updateMyLocation).not.toHaveBeenCalled();
    });
  });

  describe('Deny location permission', () => {
    it('should show explanation when permission is denied', async () => {
      mockLocationService.requestForegroundPermission.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const { getByTestId, getByText } = render(
        <GroupMapScreen {...defaultProps} />
      );

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
        status: {
          userId: mockUser.id,
          groupId: 'group-123',
          sharingEnabled: true,
        },
      });
    });

    it('should delegate disabling to sharingControl', async () => {
      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', false);
      });

      await waitFor(() => {
        expect(mockSharing.stopSharing).toHaveBeenCalledWith(
          mockUser.id,
          'group-123'
        );
      });

      // Deleting the position and stopping the background task both belong to
      // stopSharing. The screen must not need to remember either.
      expect(mockLocation.removeMyLocation).not.toHaveBeenCalled();
      expect(mockLocation.disableLocationSharing).not.toHaveBeenCalled();
    });

    it('should keep showing sharing as on when stopping failed', async () => {
      mockSharing.stopSharing.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', false);
      });

      // Still shown as sharing, because it still is.
      await waitFor(() => {
        expect(getByTestId('location-sharing-toggle').props.value).toBe(true);
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
  // Ward 6: the background-task rules ("stop only when nothing is shared
  // anywhere", "a refused background permission is not a failure") moved into
  // sharingControl and are tested in src/services/sharingControl.test.ts. What
  // remains the screen's responsibility is surfacing the outcome.
  describe('Sharing outcome', () => {
    beforeEach(() => {
      mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });
      // Not sharing on first load; the screen re-reads after a change, so a
      // successful enable must be reflected on the second read the way a real
      // server would. A mock that kept saying "off" would contradict itself.
      mockLocation.getLocationSharingStatus
        .mockResolvedValueOnce({
          success: true,
          status: {
            userId: mockUser.id,
            groupId: 'group-123',
            sharingEnabled: false,
          },
        })
        .mockResolvedValue({
          success: true,
          status: {
            userId: mockUser.id,
            groupId: 'group-123',
            sharingEnabled: true,
          },
        });
    });

    it('should show sharing as on after a successful enable', async () => {
      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', true);
      });

      await waitFor(() => {
        expect(getByTestId('location-sharing-toggle').props.value).toBe(true);
      });
    });

    it('should leave sharing off when enabling failed', async () => {
      mockSharing.startSharing.mockResolvedValue({
        success: false,
        error: 'denied',
      });
      // Nothing changed server-side, so every read reports off.
      mockLocation.getLocationSharingStatus.mockReset();
      mockLocation.getLocationSharingStatus.mockResolvedValue({
        success: true,
        status: {
          userId: mockUser.id,
          groupId: 'group-123',
          sharingEnabled: false,
        },
      });

      const { getByTestId } = render(<GroupMapScreen {...defaultProps} />);

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', true);
      });

      await waitFor(() => {
        expect(getByTestId('location-sharing-toggle').props.value).toBe(false);
      });
    });

    // Foreground sharing still works without background permission, so this
    // must not read as a failure to share.
    it('should still show sharing as on without background permission', async () => {
      mockSharing.startSharing.mockResolvedValue({
        success: true,
        backgroundRunning: false,
      });

      const { getByTestId, queryByText } = render(
        <GroupMapScreen {...defaultProps} />
      );

      await waitFor(() => {
        fireEvent(getByTestId('location-sharing-toggle'), 'valueChange', true);
      });

      await waitFor(() => {
        expect(getByTestId('location-sharing-toggle').props.value).toBe(true);
      });
      expect(queryByText(/permission is required/i)).toBeNull();
    });
  });
});
