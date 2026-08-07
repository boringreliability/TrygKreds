/**
 * Ward 6: PrivacyScreen Tests
 *
 * Feature: Privacy controls
 * Scenarios: View who can see my location, Pause / resume, Pause everything,
 *            Resuming is always explicit
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PrivacyScreen } from './PrivacyScreen';
import * as privacy from '../domain/privacy';
import * as sharingControl from '../services/sharingControl';

jest.mock('../domain/privacy');
jest.mock('../services/sharingControl');

const mockPrivacy = privacy as jest.Mocked<typeof privacy>;
const mockSharing = sharingControl as jest.Mocked<typeof sharingControl>;

const mockUser = {
  id: 'user-me',
  email: 'me@example.com',
  createdAt: new Date().toISOString(),
};

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const family: privacy.GroupVisibility = {
  groupId: 'g-1',
  groupName: 'Family',
  sharingEnabled: true,
  viewers: [
    { userId: 'user-mor', displayName: 'Mor' },
    { userId: 'user-far', displayName: 'Far' },
  ],
};

const work: privacy.GroupVisibility = {
  groupId: 'g-2',
  groupName: 'Work',
  sharingEnabled: false,
  viewers: [],
};

describe('PrivacyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrivacy.getMyVisibility.mockResolvedValue({
      success: true,
      groups: [family, work],
    });
    mockSharing.startSharing.mockResolvedValue({ success: true });
    mockSharing.stopSharing.mockResolvedValue({ success: true });
    mockSharing.stopAllSharing.mockResolvedValue({ success: true });
  });

  describe('Who can see me', () => {
    it('should list viewers grouped by group name', async () => {
      const { getByText } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByText('Family')).toBeTruthy();
      });
      expect(getByText('Work')).toBeTruthy();
      expect(getByText('Mor')).toBeTruthy();
      expect(getByText('Far')).toBeTruthy();
    });

    it('should summarise how many groups can see me', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByTestId('privacy-summary').props.children).toMatch(
          /sharing your location with 1 group/i
        );
      });
    });

    it('should say plainly when nobody can see me', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [work],
      });

      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByTestId('privacy-summary').props.children).toMatch(
          /not sharing your location with anyone/i
        );
      });
    });

    it('should show a group that is not shared as such', async () => {
      const { getByText } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByText('Not shared')).toBeTruthy();
      });
    });

    it('should count viewers', async () => {
      const { getByText } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByText('2 people can see you')).toBeTruthy();
      });
    });

    // Ward 3.3's rule holds here too.
    it('should show a placeholder rather than a user id for an unnamed viewer', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [
          {
            ...family,
            viewers: [{ userId: 'user-xyz', displayName: null }],
          },
        ],
      });

      const { getByText, queryByText } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByText('Unknown member')).toBeTruthy();
      });
      expect(queryByText('user-xyz')).toBeNull();
    });

    it('should handle being in no groups', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [],
      });

      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByTestId('privacy-empty')).toBeTruthy();
      });
    });

    // Showing "nobody can see you" when we do not know would be the worst bug
    // this screen could have.
    it('should show an error rather than a reassuring default', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const { getByTestId, queryByText } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByTestId('privacy-error')).toBeTruthy();
      });
      expect(queryByText(/not sharing your location with anyone/i)).toBeNull();
    });
  });

  describe('Pause and resume', () => {
    it('should pause sharing for one group', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() =>
        expect(getByTestId('privacy-toggle-g-1')).toBeTruthy()
      );

      fireEvent(getByTestId('privacy-toggle-g-1'), 'valueChange', false);

      await waitFor(() => {
        expect(mockSharing.stopSharing).toHaveBeenCalledWith(
          mockUser.id,
          'g-1'
        );
      });
    });

    it('should resume sharing for one group', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() =>
        expect(getByTestId('privacy-toggle-g-2')).toBeTruthy()
      );

      fireEvent(getByTestId('privacy-toggle-g-2'), 'valueChange', true);

      await waitFor(() => {
        expect(mockSharing.startSharing).toHaveBeenCalledWith(
          mockUser.id,
          'g-2'
        );
      });
    });

    it('should leave the other group alone when pausing one', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() =>
        expect(getByTestId('privacy-toggle-g-1')).toBeTruthy()
      );

      fireEvent(getByTestId('privacy-toggle-g-1'), 'valueChange', false);

      await waitFor(() => {
        expect(mockSharing.stopSharing).toHaveBeenCalledTimes(1);
      });
      expect(mockSharing.stopSharing).not.toHaveBeenCalledWith(
        mockUser.id,
        'g-2'
      );
    });

    it('should re-read the server after a change', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() =>
        expect(getByTestId('privacy-toggle-g-1')).toBeTruthy()
      );
      expect(mockPrivacy.getMyVisibility).toHaveBeenCalledTimes(1);

      fireEvent(getByTestId('privacy-toggle-g-1'), 'valueChange', false);

      await waitFor(() => {
        expect(mockPrivacy.getMyVisibility).toHaveBeenCalledTimes(2);
      });
    });

    it('should report a failure to pause', async () => {
      mockSharing.stopSharing.mockResolvedValue({
        success: false,
        error: 'denied',
      });

      const { getByTestId, getByText } = render(<PrivacyScreen />);

      await waitFor(() =>
        expect(getByTestId('privacy-toggle-g-1')).toBeTruthy()
      );

      fireEvent(getByTestId('privacy-toggle-g-1'), 'valueChange', false);

      await waitFor(() => {
        expect(getByText('denied')).toBeTruthy();
      });
      // Still shown as shared, because it still is.
      expect(getByTestId('privacy-toggle-g-1').props.value).toBe(true);
    });
  });

  describe('Pause everything', () => {
    it('should offer the action while sharing with somebody', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => expect(getByTestId('pause-all-button')).toBeTruthy());
    });

    it('should not offer it when nothing is shared', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [work],
      });

      const { queryByTestId, getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => expect(getByTestId('privacy-summary')).toBeTruthy());
      expect(queryByTestId('pause-all-button')).toBeNull();
    });

    it('should stop sharing with everyone', async () => {
      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => expect(getByTestId('pause-all-button')).toBeTruthy());

      fireEvent.press(getByTestId('pause-all-button'));

      await waitFor(() => {
        expect(mockSharing.stopAllSharing).toHaveBeenCalledWith(mockUser.id);
      });
    });

    // Half-paused must not look like success.
    it('should report a partial failure', async () => {
      mockSharing.stopAllSharing.mockResolvedValue({
        success: false,
        error: 'Could not stop sharing with every group: denied',
      });

      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => expect(getByTestId('pause-all-button')).toBeTruthy());

      fireEvent.press(getByTestId('pause-all-button'));

      await waitFor(() => {
        expect(getByTestId('privacy-error').props.children).toMatch(/denied/);
      });
    });
  });

  // A privacy control must never turn sharing ON by inference.
  describe('Resuming is always explicit', () => {
    it('should offer no way to resume everything at once', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [{ ...family, sharingEnabled: false, viewers: [] }, work],
      });

      const { queryByTestId, queryByText, getByTestId } = render(
        <PrivacyScreen />
      );

      await waitFor(() => expect(getByTestId('privacy-summary')).toBeTruthy());

      expect(queryByTestId('resume-all-button')).toBeNull();
      expect(queryByText(/resume all/i)).toBeNull();
      expect(queryByText(/share with everyone/i)).toBeNull();
    });

    it('should still offer a per-group toggle for each paused group', async () => {
      mockPrivacy.getMyVisibility.mockResolvedValue({
        success: true,
        groups: [{ ...family, sharingEnabled: false, viewers: [] }, work],
      });

      const { getByTestId } = render(<PrivacyScreen />);

      await waitFor(() => {
        expect(getByTestId('privacy-toggle-g-1')).toBeTruthy();
        expect(getByTestId('privacy-toggle-g-2')).toBeTruthy();
      });
    });
  });

  it('should tell the user that pausing deletes the position', async () => {
    const { getByText } = render(<PrivacyScreen />);

    await waitFor(() => {
      expect(getByText(/deletes your stored position/i)).toBeTruthy();
    });
  });
});
