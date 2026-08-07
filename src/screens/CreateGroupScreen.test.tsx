/**
 * Ward 2: CreateGroupScreen Tests
 *
 * Feature: Groups
 * Scenario: Create a new group
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateGroupScreen } from './CreateGroupScreen';
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

describe('CreateGroupScreen', () => {
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups.validateGroupName.mockImplementation((name) => {
      if (!name.trim())
        return { isValid: false, error: 'Group name is required' };
      if (name.length > 50)
        return {
          isValid: false,
          error: 'Group name must be 50 characters or less',
        };
      return { isValid: true };
    });
  });

  it('should render create group form', () => {
    const { getByPlaceholderText, getAllByText, getByText } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    expect(getByPlaceholderText('Group name')).toBeTruthy();
    // Title and button both have "Create Group" text
    expect(getAllByText('Create Group').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('should create group with valid name', async () => {
    mockGroups.createGroup.mockResolvedValue({
      success: true,
      group: {
        id: 'group-123',
        name: 'Family',
        ownerId: mockUser.id,
        inviteCode: 'ABC123',
        createdAt: new Date().toISOString(),
        memberCount: 1,
      },
    });

    const { getByPlaceholderText, getAllByText } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Group name'), 'Family');
    // Press the button (last element with this text)
    const createButtons = getAllByText('Create Group');
    fireEvent.press(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(mockGroups.createGroup).toHaveBeenCalledWith(
        'Family',
        mockUser.id
      );
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('should show error for empty name', async () => {
    const { getAllByText, findByText } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    const createButtons = getAllByText('Create Group');
    fireEvent.press(createButtons[createButtons.length - 1]);

    expect(await findByText('Group name is required')).toBeTruthy();
    expect(mockGroups.createGroup).not.toHaveBeenCalled();
  });

  it('should show error from server', async () => {
    mockGroups.createGroup.mockResolvedValue({
      success: false,
      error: 'Failed to create group',
    });

    const { getByPlaceholderText, getAllByText, findByText } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Group name'), 'Family');
    const createButtons = getAllByText('Create Group');
    fireEvent.press(createButtons[createButtons.length - 1]);

    expect(await findByText('Failed to create group')).toBeTruthy();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('should call onCancel when cancel is pressed', () => {
    const { getByText } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.press(getByText('Cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show loading state while creating', async () => {
    let resolveCreate: (value: groups.GroupResult) => void;
    const createPromise = new Promise<groups.GroupResult>((resolve) => {
      resolveCreate = resolve;
    });
    mockGroups.createGroup.mockReturnValue(createPromise);

    const { getByPlaceholderText, getAllByText, getByTestId } = render(
      <CreateGroupScreen onSuccess={mockOnSuccess} onCancel={mockOnCancel} />
    );

    fireEvent.changeText(getByPlaceholderText('Group name'), 'Family');
    const createButtons = getAllByText('Create Group');
    fireEvent.press(createButtons[createButtons.length - 1]);

    expect(getByTestId('loading-indicator')).toBeTruthy();

    resolveCreate!({
      success: true,
      group: {
        id: 'group-123',
        name: 'Family',
        ownerId: mockUser.id,
        inviteCode: 'ABC123',
        createdAt: new Date().toISOString(),
        memberCount: 1,
      },
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});
