/**
 * Ward 5: SosButton Tests
 *
 * Feature: SOS panic button
 * Scenarios: Trigger SOS, Confirmation guards against an accidental press,
 *            Cancelling records nothing, Notification delivery failure
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SosButton } from './SosButton';
import * as sos from '../domain/sos';

jest.mock('../domain/sos');
const mockSos = sos as jest.Mocked<typeof sos>;

describe('SosButton', () => {
  const onSent = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSos.triggerSos.mockResolvedValue({
      success: true,
      groupIds: ['group-a'],
      hadLocation: true,
      notified: true,
    });
  });

  it('should render the SOS button', () => {
    const { getByTestId } = render(<SosButton />);

    expect(getByTestId('sos-button')).toBeTruthy();
  });

  it('should be reachable by an accessibility label', () => {
    const { getByLabelText } = render(<SosButton />);

    expect(getByLabelText('Send SOS to your groups')).toBeTruthy();
  });

  // The guard exists, but it must not send anything on its own.
  it('should ask for confirmation before sending', () => {
    const { getByTestId } = render(<SosButton />);

    fireEvent.press(getByTestId('sos-button'));

    expect(getByTestId('sos-confirm-dialog')).toBeTruthy();
    expect(mockSos.triggerSos).not.toHaveBeenCalled();
  });

  // One extra tap, no more. A guard that takes four taps fails in the emergency
  // it exists for.
  it('should send after exactly one confirming tap', async () => {
    const { getByTestId } = render(<SosButton onSent={onSent} />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    await waitFor(() => {
      expect(mockSos.triggerSos).toHaveBeenCalledTimes(1);
    });
  });

  it('should report a successful send', async () => {
    const { getByTestId, getByText } = render(<SosButton onSent={onSent} />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    await waitFor(() => {
      expect(getByText(/SOS sent to your groups/i)).toBeTruthy();
    });
    expect(onSent).toHaveBeenCalledWith(true);
  });

  it('should record nothing when cancelled', async () => {
    const { getByTestId, queryByTestId } = render(<SosButton />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-cancel-button'));

    await waitFor(() => {
      expect(queryByTestId('sos-confirm-dialog')).toBeNull();
    });
    expect(mockSos.triggerSos).not.toHaveBeenCalled();
  });

  // Saying "sent" when the relay was down would be a lie at the worst possible
  // moment.
  it('should be honest when the alert may not have been delivered', async () => {
    mockSos.triggerSos.mockResolvedValue({
      success: true,
      groupIds: ['group-a'],
      hadLocation: true,
      notified: false,
      notifyError: 'relay unavailable',
    });

    const { getByTestId, getByText } = render(<SosButton onSent={onSent} />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    await waitFor(() => {
      expect(getByText(/may not have been delivered/i)).toBeTruthy();
    });
    expect(onSent).toHaveBeenCalledWith(false);
  });

  it('should still confirm success when no location was available', async () => {
    mockSos.triggerSos.mockResolvedValue({
      success: true,
      groupIds: ['group-a'],
      hadLocation: false,
      notified: true,
    });

    const { getByTestId, getByText } = render(<SosButton />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    await waitFor(() => {
      expect(getByText(/SOS sent/i)).toBeTruthy();
    });
  });

  it('should show an error and keep the dialog open on failure', async () => {
    mockSos.triggerSos.mockResolvedValue({
      success: false,
      error: 'You are not a member of any group',
    });

    const { getByTestId } = render(<SosButton />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    await waitFor(() => {
      expect(getByTestId('sos-error')).toBeTruthy();
    });
    // Kept open so the user can retry without hunting for the button again.
    expect(getByTestId('sos-confirm-dialog')).toBeTruthy();
  });

  it('should not send twice while a send is in flight', async () => {
    let resolveSend: (value: sos.TriggerSosResult) => void = () => {};
    mockSos.triggerSos.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    const { getByTestId } = render(<SosButton />);

    fireEvent.press(getByTestId('sos-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));
    fireEvent.press(getByTestId('sos-confirm-button'));

    expect(mockSos.triggerSos).toHaveBeenCalledTimes(1);

    resolveSend({
      success: true,
      groupIds: ['group-a'],
      hadLocation: true,
      notified: true,
    });
    await waitFor(() => expect(getByTestId('sos-status')).toBeTruthy());
  });
});
