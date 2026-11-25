/**
 * Ward 1: Login Screen Tests
 *
 * Feature: Authentication and basic app shell
 * Scenario: User signs in/up with email and password
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';
import * as auth from '../domain/auth';

// Mock the auth domain
jest.mock('../domain/auth');
const mockAuth = auth as jest.Mocked<typeof auth>;

// authRedirectUri is built from expo-linking at module load time, which needs
// an Expo runtime this test environment does not provide.
jest.mock('../services/authLink', () => ({
  // Deliberately not a realistic URL. If the component hardcoded
  // 'trygkreds://auth' instead of importing authRedirectUri, an assertion
  // against a realistic-looking value would pass anyway and prove nothing.
  // This sentinel can only reach signUp by way of the import.
  authRedirectUri: 'sentinel://from-authLink-module',
}));

describe('LoginScreen', () => {
  const mockOnAuthSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.validateEmail.mockImplementation((email) => email.includes('@'));
    mockAuth.validatePassword.mockImplementation((password) => ({
      isValid: password.length >= 8,
      error:
        password.length < 8
          ? 'Password must be at least 8 characters'
          : undefined,
    }));
  });

  describe('Initial render', () => {
    it('should show login form by default', () => {
      const { getByText, getByPlaceholderText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      expect(getByPlaceholderText('Email')).toBeTruthy();
      expect(getByPlaceholderText('Password')).toBeTruthy();
      expect(getByText('Sign In')).toBeTruthy();
      expect(getByText("Don't have an account? Sign Up")).toBeTruthy();
    });
  });

  describe('Toggle between Sign In and Sign Up', () => {
    it('should switch to sign up mode when tapping toggle', () => {
      const { getByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.press(getByText("Don't have an account? Sign Up"));

      expect(getByText('Sign Up')).toBeTruthy();
      expect(getByText('Already have an account? Sign In')).toBeTruthy();
    });

    it('should switch back to sign in mode', () => {
      const { getByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.press(getByText("Don't have an account? Sign Up"));
      fireEvent.press(getByText('Already have an account? Sign In'));

      expect(getByText('Sign In')).toBeTruthy();
    });
  });

  describe('Sign In', () => {
    it('should call signIn with valid credentials', async () => {
      mockAuth.signIn.mockResolvedValue({
        success: true,
        user: {
          id: '123',
          email: 'test@example.com',
          createdAt: new Date().toISOString(),
        },
      });

      const { getByPlaceholderText, getByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
      fireEvent.press(getByText('Sign In'));

      await waitFor(() => {
        expect(mockAuth.signIn).toHaveBeenCalledWith(
          'test@example.com',
          'password123'
        );
        expect(mockOnAuthSuccess).toHaveBeenCalled();
      });
    });

    it('should show error for invalid credentials', async () => {
      mockAuth.signIn.mockResolvedValue({
        success: false,
        error: 'Invalid login credentials',
      });

      const { getByPlaceholderText, getByText, findByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpassword');
      fireEvent.press(getByText('Sign In'));

      expect(await findByText('Invalid login credentials')).toBeTruthy();
      expect(mockOnAuthSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Sign Up', () => {
    it('should call signUp with valid credentials', async () => {
      mockAuth.signUp.mockResolvedValue({
        success: true,
        user: {
          id: '123',
          email: 'new@example.com',
          createdAt: new Date().toISOString(),
        },
      });

      const { getByPlaceholderText, getByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      // Switch to sign up mode
      fireEvent.press(getByText("Don't have an account? Sign Up"));

      fireEvent.changeText(getByPlaceholderText('Email'), 'new@example.com');
      fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
      fireEvent.press(getByText('Sign Up'));

      await waitFor(() => {
        expect(mockAuth.signUp).toHaveBeenCalledWith(
          'new@example.com',
          'password123',
          'sentinel://from-authLink-module'
        );
        expect(mockOnAuthSuccess).toHaveBeenCalled();
      });
    });

    it('should show error for weak password', async () => {
      mockAuth.signUp.mockResolvedValue({
        success: false,
        error: 'Password must be at least 8 characters',
      });

      const { getByPlaceholderText, getByText, findByText } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.press(getByText("Don't have an account? Sign Up"));
      fireEvent.changeText(getByPlaceholderText('Email'), 'new@example.com');
      fireEvent.changeText(getByPlaceholderText('Password'), 'short');
      fireEvent.press(getByText('Sign Up'));

      expect(
        await findByText('Password must be at least 8 characters')
      ).toBeTruthy();
      expect(mockOnAuthSuccess).not.toHaveBeenCalled();
    });
  });

  describe('Loading state', () => {
    it('should show loading indicator while signing in', async () => {
      // Create a promise that we can control
      let resolveSignIn: (value: auth.AuthResult) => void;
      const signInPromise = new Promise<auth.AuthResult>((resolve) => {
        resolveSignIn = resolve;
      });
      mockAuth.signIn.mockReturnValue(signInPromise);

      const { getByPlaceholderText, getByText, getByTestId } = render(
        <LoginScreen onAuthSuccess={mockOnAuthSuccess} />
      );

      fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
      fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
      fireEvent.press(getByText('Sign In'));

      expect(getByTestId('loading-indicator')).toBeTruthy();

      // Resolve the promise
      resolveSignIn!({
        success: true,
        user: {
          id: '123',
          email: 'test@example.com',
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(mockOnAuthSuccess).toHaveBeenCalled();
      });
    });
  });
});
