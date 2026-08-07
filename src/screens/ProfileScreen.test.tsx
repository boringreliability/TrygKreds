/**
 * Ward 3.3: ProfileScreen Tests
 *
 * Feature: Display names for group members
 * Scenarios: Set my display name, Change my display name,
 *            A display name is required and bounded
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import * as profiles from '../domain/profiles';

jest.mock('../domain/profiles');
const mockProfiles = profiles as jest.Mocked<typeof profiles>;

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
};

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

const MAX = 40;

describe('ProfileScreen', () => {
  const mockOnSaved = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // The real validator is a pure function; mirror it so the screen's
    // behaviour is what is under test here, not the validation rules.
    mockProfiles.validateDisplayName.mockImplementation((name: string) => {
      const trimmed = name.trim();
      if (!trimmed)
        return { isValid: false, error: 'Display name is required' };
      if (trimmed.length > MAX) {
        return {
          isValid: false,
          error: `Display name must be ${MAX} characters or less`,
        };
      }
      return { isValid: true };
    });

    mockProfiles.getMyProfile.mockResolvedValue({
      success: true,
      profile: { id: mockUser.id, displayName: null },
    });
  });

  it('should show the current display name once loaded', async () => {
    mockProfiles.getMyProfile.mockResolvedValue({
      success: true,
      profile: { id: mockUser.id, displayName: 'Mor' },
    });

    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => {
      expect(getByTestId('display-name-input').props.value).toBe('Mor');
    });
  });

  it('should start empty when no display name is set', async () => {
    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => {
      expect(getByTestId('display-name-input').props.value).toBe('');
    });
  });

  it('should save a display name', async () => {
    mockProfiles.setMyDisplayName.mockResolvedValue({
      success: true,
      profile: { id: mockUser.id, displayName: 'Mor' },
    });

    const { getByTestId } = render(<ProfileScreen onSaved={mockOnSaved} />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), 'Mor');
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => {
      expect(mockProfiles.setMyDisplayName).toHaveBeenCalledWith(
        mockUser.id,
        'Mor'
      );
      expect(mockOnSaved).toHaveBeenCalled();
    });
  });

  it('should confirm that the name was saved', async () => {
    mockProfiles.setMyDisplayName.mockResolvedValue({
      success: true,
      profile: { id: mockUser.id, displayName: 'Mette' },
    });

    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), 'Mette');
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => {
      expect(getByTestId('profile-saved')).toBeTruthy();
    });
  });

  it('should reject an empty display name without calling the server', async () => {
    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), '   ');
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => {
      expect(getByTestId('profile-error')).toBeTruthy();
    });
    expect(mockProfiles.setMyDisplayName).not.toHaveBeenCalled();
  });

  it('should reject an over-long display name without calling the server', async () => {
    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(
      getByTestId('display-name-input'),
      'x'.repeat(MAX + 1)
    );
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => {
      expect(getByTestId('profile-error')).toBeTruthy();
    });
    expect(mockProfiles.setMyDisplayName).not.toHaveBeenCalled();
  });

  it('should surface a server error', async () => {
    mockProfiles.setMyDisplayName.mockResolvedValue({
      success: false,
      error: 'denied',
    });

    const { getByTestId, getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), 'Mor');
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => {
      expect(getByText('denied')).toBeTruthy();
    });
  });

  it('should clear a previous error when the name is edited', async () => {
    const { getByTestId, queryByTestId } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), '');
    fireEvent.press(getByTestId('save-display-name-button'));

    await waitFor(() => expect(getByTestId('profile-error')).toBeTruthy());

    fireEvent.changeText(getByTestId('display-name-input'), 'M');

    expect(queryByTestId('profile-error')).toBeNull();
  });

  it('should cap input length at the maximum', async () => {
    const { getByTestId } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());

    expect(getByTestId('display-name-input').props.maxLength).toBe(MAX);
  });

  it('should offer cancel only when a handler is given', async () => {
    const { getByTestId, queryByTestId, unmount } = render(<ProfileScreen />);

    await waitFor(() => expect(getByTestId('display-name-input')).toBeTruthy());
    expect(queryByTestId('profile-cancel-button')).toBeNull();
    unmount();

    const withCancel = render(<ProfileScreen onCancel={mockOnCancel} />);
    await waitFor(() =>
      expect(withCancel.getByTestId('display-name-input')).toBeTruthy()
    );

    fireEvent.press(withCancel.getByTestId('profile-cancel-button'));
    expect(mockOnCancel).toHaveBeenCalled();
  });
});
