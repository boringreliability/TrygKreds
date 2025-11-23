/**
 * Ward 5: SOS Screen Tests
 *
 * Feature: SOS panic button
 * Tests for triggering SOS and viewing SOS history
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SosScreen } from './SosScreen';
import * as sos from '../domain/sos';
import * as locationService from '../services/location';
import * as notification from '../services/notification';

jest.mock('../domain/sos');
jest.mock('../services/location');
jest.mock('../services/notification');

const mockSos = sos as jest.Mocked<typeof sos>;
const mockLocationService = locationService as jest.Mocked<typeof locationService>;
const mockNotification = notification as jest.Mocked<typeof notification>;

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

// Mock Alert
jest.spyOn(Alert, 'alert');

const defaultProps = {
  onBack: jest.fn(),
};

describe('SosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockSos.canTriggerSos.mockResolvedValue({
      canTrigger: true,
      cooldownRemaining: 0,
    });
    mockSos.getUserGroups.mockResolvedValue({
      groupIds: ['group-123'],
    });
    mockSos.getSosEventsForGroup.mockResolvedValue({
      success: true,
      events: [],
    });
    mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    });
    mockLocationService.getCurrentLocation.mockResolvedValue({
      success: true,
      coordinates: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
    });
  });

  describe('SOS button display', () => {
    it('should render the SOS button', async () => {
      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('sos-button')).toBeTruthy();
      });
    });

    it('should display "SOS" text on button', async () => {
      const { getByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('SOS')).toBeTruthy();
      });
    });
  });

  describe('Trigger SOS with location', () => {
    it('should show confirmation dialog when SOS button is pressed', async () => {
      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Trigger SOS',
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel' }),
          expect.objectContaining({ text: 'Send SOS' }),
        ])
      );
    });

    it('should trigger SOS with location when confirmed', async () => {
      mockSos.triggerSosForAllGroups.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'sos-123',
            userId: mockUser.id,
            groupId: 'group-123',
            latitude: 55.6761,
            longitude: 12.5683,
            accuracy: 10,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      mockNotification.sendSosNotification.mockResolvedValue({
        success: true,
        notificationsSent: 5,
      });

      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      // Simulate confirming the alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find(
        (btn: { text: string }) => btn.text === 'Send SOS'
      );
      confirmButton.onPress();

      await waitFor(() => {
        expect(mockSos.triggerSosForAllGroups).toHaveBeenCalledWith(
          mockUser.id,
          expect.objectContaining({
            latitude: 55.6761,
            longitude: 12.5683,
          })
        );
      });
    });

    it('should show confirmation after SOS is sent', async () => {
      mockSos.triggerSosForAllGroups.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'sos-123',
            userId: mockUser.id,
            groupId: 'group-123',
            latitude: 55.6761,
            longitude: 12.5683,
            accuracy: 10,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      mockNotification.sendSosNotification.mockResolvedValue({
        success: true,
        notificationsSent: 5,
      });

      const { getByTestId, getByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find(
        (btn: { text: string }) => btn.text === 'Send SOS'
      );
      confirmButton.onPress();

      await waitFor(() => {
        expect(getByText(/SOS sent/i)).toBeTruthy();
      });
    });
  });

  describe('Trigger SOS without location permission', () => {
    beforeEach(() => {
      mockLocationService.getForegroundPermissionStatus.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });
    });

    it('should still trigger SOS without location', async () => {
      mockSos.triggerSosForAllGroups.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'sos-123',
            userId: mockUser.id,
            groupId: 'group-123',
            latitude: null,
            longitude: null,
            accuracy: null,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      mockNotification.sendSosNotification.mockResolvedValue({
        success: true,
        notificationsSent: 5,
      });

      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find(
        (btn: { text: string }) => btn.text === 'Send SOS'
      );
      confirmButton.onPress();

      await waitFor(() => {
        expect(mockSos.triggerSosForAllGroups).toHaveBeenCalledWith(
          mockUser.id,
          null
        );
      });
    });
  });

  describe('Cancel SOS confirmation', () => {
    it('should not send SOS when cancelled', async () => {
      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const cancelButton = alertCall[2].find(
        (btn: { text: string }) => btn.text === 'Cancel'
      );
      cancelButton.onPress();

      expect(mockSos.triggerSosForAllGroups).not.toHaveBeenCalled();
    });
  });

  describe('SOS cooldown', () => {
    it('should show cooldown message when in cooldown', async () => {
      mockSos.canTriggerSos.mockResolvedValue({
        canTrigger: false,
        cooldownRemaining: 30000,
      });

      const { getAllByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const pleaseWaitElements = getAllByText(/Please wait/i);
        expect(pleaseWaitElements.length).toBeGreaterThan(0);
      });
    });

    it('should disable SOS button during cooldown', async () => {
      mockSos.canTriggerSos.mockResolvedValue({
        canTrigger: false,
        cooldownRemaining: 30000,
      });

      const { getByTestId } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        expect(sosButton.props.accessibilityState?.disabled).toBe(true);
      });
    });
  });

  describe('SOS history', () => {
    it('should display recent SOS events title', async () => {
      mockSos.getSosEventsForGroup.mockResolvedValue({
        success: true,
        events: [
          {
            id: 'sos-1',
            userId: 'user-1',
            groupId: 'group-123',
            latitude: 55.6761,
            longitude: 12.5683,
            accuracy: 10,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      const { getByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('Recent SOS Events')).toBeTruthy();
      });
    });

    it('should show empty state when no SOS history', async () => {
      mockSos.getSosEventsForGroup.mockResolvedValue({
        success: true,
        events: [],
      });

      const { getByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('No recent SOS events')).toBeTruthy();
      });
    });
  });

  describe('Error handling', () => {
    it('should show error message when SOS fails', async () => {
      mockSos.triggerSosForAllGroups.mockResolvedValue({
        success: false,
        error: 'Failed to send SOS',
      });

      const { getByTestId, getByText } = render(<SosScreen {...defaultProps} />);

      await waitFor(() => {
        const sosButton = getByTestId('sos-button');
        fireEvent.press(sosButton);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find(
        (btn: { text: string }) => btn.text === 'Send SOS'
      );
      confirmButton.onPress();

      await waitFor(() => {
        expect(getByText(/Failed to send SOS/i)).toBeTruthy();
      });
    });
  });
});
