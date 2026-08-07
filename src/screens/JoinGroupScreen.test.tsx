/**
 * Ward 2: JoinGroupScreen Tests
 *
 * Feature: Groups
 * Scenario: Join a group via invite code
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JoinGroupScreen } from './JoinGroupScreen';
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
  }),
}));

describe('JoinGroupScreen', () => {
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render join group form', () => {
    const { getByPlaceholderText, getAllByText, getByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    expect(getByPlaceholderText('Invite code')).toBeTruthy();
    // Title and button both have "Join Group" text
    expect(getAllByText('Join Group').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('should join group with valid invite code', async () => {
    mockGroups.joinGroup.mockResolvedValue({
      success: true,
      groupId: 'group-123',
    });

    const { getByPlaceholderText, getAllByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'ABC123');
    const joinButtons = getAllByText('Join Group');
    fireEvent.press(joinButtons[joinButtons.length - 1]);

    await waitFor(() => {
      expect(mockGroups.joinGroup).toHaveBeenCalledWith('ABC123');
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('should show error for invalid invite code', async () => {
    mockGroups.joinGroup.mockResolvedValue({
      success: false,
      error: 'Invalid invite code',
    });

    const { getByPlaceholderText, getAllByText, findByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'INVALID');
    const joinButtons = getAllByText('Join Group');
    fireEvent.press(joinButtons[joinButtons.length - 1]);

    expect(await findByText('Invalid invite code')).toBeTruthy();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('should show error when already a member', async () => {
    mockGroups.joinGroup.mockResolvedValue({
      success: false,
      error: 'You are already a member of this group',
    });

    const { getByPlaceholderText, getAllByText, findByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'ABC123');
    const joinButtons = getAllByText('Join Group');
    fireEvent.press(joinButtons[joinButtons.length - 1]);

    expect(
      await findByText('You are already a member of this group')
    ).toBeTruthy();
  });

  it('should show error for empty invite code', async () => {
    const { getAllByText, findByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    const joinButtons = getAllByText('Join Group');
    fireEvent.press(joinButtons[joinButtons.length - 1]);

    expect(await findByText('Invite code is required')).toBeTruthy();
    expect(mockGroups.joinGroup).not.toHaveBeenCalled();
  });

  it('should call onCancel when cancel is pressed', () => {
    const { getByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.press(getByText('Cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should normalize invite code to uppercase', async () => {
    mockGroups.joinGroup.mockResolvedValue({
      success: true,
      groupId: 'group-123',
    });

    const { getByPlaceholderText, getAllByText } = render(
      <JoinGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Invite code'), 'abc123');
    const joinButtons = getAllByText('Join Group');
    fireEvent.press(joinButtons[joinButtons.length - 1]);

    await waitFor(() => {
      expect(mockGroups.joinGroup).toHaveBeenCalledWith('ABC123');
    });
  });
});
