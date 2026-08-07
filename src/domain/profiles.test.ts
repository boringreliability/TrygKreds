/**
 * Ward 3.3: Profiles Domain Tests
 *
 * Feature: Display names for group members
 */

import {
  validateDisplayName,
  formatMemberName,
  memberInitial,
  getMyProfile,
  setMyDisplayName,
  getProfilesForUsers,
  MAX_DISPLAY_NAME_LENGTH,
} from './profiles';

const mockSupabaseFrom = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
  },
}));

const createChainableMock = (finalResult: unknown) => ({
  select: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(finalResult),
  then: (resolve: (value: unknown) => void) => resolve(finalResult),
});

describe('Profiles Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDisplayName', () => {
    it('should accept an ordinary name', () => {
      expect(validateDisplayName('Mor').isValid).toBe(true);
    });

    it('should reject an empty name', () => {
      const result = validateDisplayName('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Display name is required');
    });

    it('should reject a name that is only whitespace', () => {
      expect(validateDisplayName('   ').isValid).toBe(false);
    });

    it(`should reject a name longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, () => {
      const result = validateDisplayName(
        'x'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`
      );
    });

    it(`should accept a name of exactly ${MAX_DISPLAY_NAME_LENGTH} characters`, () => {
      expect(
        validateDisplayName('x'.repeat(MAX_DISPLAY_NAME_LENGTH)).isValid
      ).toBe(true);
    });

    it('should measure length after trimming', () => {
      const name = `  ${'x'.repeat(MAX_DISPLAY_NAME_LENGTH)}  `;
      expect(validateDisplayName(name).isValid).toBe(true);
    });

    // A display name is user-chosen and need not be a real name.
    it('should accept a nickname that is not a real name', () => {
      expect(validateDisplayName('Bamse 🐻').isValid).toBe(true);
    });
  });

  describe('formatMemberName', () => {
    it('should label the current user as You', () => {
      expect(formatMemberName('Mor', true)).toBe('You');
    });

    it('should use the display name for other members', () => {
      expect(formatMemberName('Mor', false)).toBe('Mor');
    });

    it('should trim the display name', () => {
      expect(formatMemberName('  Mor  ', false)).toBe('Mor');
    });

    // The whole point of the ward: never show a raw id to a human.
    it('should fall back to a neutral placeholder when no name is set', () => {
      expect(formatMemberName(null, false)).toBe('Unknown member');
      expect(formatMemberName(undefined, false)).toBe('Unknown member');
      expect(formatMemberName('   ', false)).toBe('Unknown member');
    });
  });

  describe('memberInitial', () => {
    it('should use Y for the current user', () => {
      expect(memberInitial('Mor', true)).toBe('Y');
    });

    it('should use the first letter of the display name, uppercased', () => {
      expect(memberInitial('mor', false)).toBe('M');
      expect(memberInitial('  far', false)).toBe('F');
    });

    it('should handle a multi-code-unit first character', () => {
      expect(memberInitial('🐻 Bamse', false)).toBe('🐻');
    });

    // Never expose a fragment of a user id.
    it('should use a question mark when no name is set', () => {
      expect(memberInitial(null, false)).toBe('?');
      expect(memberInitial(undefined, false)).toBe('?');
      expect(memberInitial('   ', false)).toBe('?');
    });
  });

  describe('getMyProfile', () => {
    it('should return the profile', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({
          data: { id: 'user-1', display_name: 'Mor' },
          error: null,
        })
      );

      const result = await getMyProfile('user-1');

      expect(result.success).toBe(true);
      expect(result.profile).toEqual({ id: 'user-1', displayName: 'Mor' });
    });

    it('should return a null display name when none is set', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({
          data: { id: 'user-1', display_name: null },
          error: null,
        })
      );

      const result = await getMyProfile('user-1');

      expect(result.success).toBe(true);
      expect(result.profile?.displayName).toBeNull();
    });

    it('should surface an error', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({ data: null, error: { message: 'boom' } })
      );

      const result = await getMyProfile('user-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });
  });

  describe('setMyDisplayName', () => {
    it('should store a trimmed display name', async () => {
      const mock = createChainableMock({
        data: { id: 'user-1', display_name: 'Mor' },
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(mock);

      const result = await setMyDisplayName('user-1', '  Mor  ');

      expect(result.success).toBe(true);
      expect(mock.upsert).toHaveBeenCalledWith({
        id: 'user-1',
        display_name: 'Mor',
      });
    });

    it('should validate before touching the server', async () => {
      const result = await setMyDisplayName('user-1', '   ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Display name is required');
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should reject an over-long name without touching the server', async () => {
      const result = await setMyDisplayName(
        'user-1',
        'x'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)
      );

      expect(result.success).toBe(false);
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should surface a server error', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({ data: null, error: { message: 'denied' } })
      );

      const result = await setMyDisplayName('user-1', 'Mor');

      expect(result.success).toBe(false);
      expect(result.error).toBe('denied');
    });
  });

  describe('getProfilesForUsers', () => {
    it('should return a lookup keyed by user id', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({
          data: [
            { id: 'user-1', display_name: 'Mor' },
            { id: 'user-2', display_name: 'Far' },
          ],
          error: null,
        })
      );

      const result = await getProfilesForUsers(['user-1', 'user-2']);

      expect(result.success).toBe(true);
      expect(result.profiles).toEqual({
        'user-1': { id: 'user-1', displayName: 'Mor' },
        'user-2': { id: 'user-2', displayName: 'Far' },
      });
    });

    it('should not query at all for an empty list', async () => {
      const result = await getProfilesForUsers([]);

      expect(result.success).toBe(true);
      expect(result.profiles).toEqual({});
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should de-duplicate ids before querying', async () => {
      const mock = createChainableMock({
        data: [{ id: 'user-1', display_name: 'Mor' }],
        error: null,
      });
      mockSupabaseFrom.mockReturnValue(mock);

      await getProfilesForUsers(['user-1', 'user-1', 'user-1']);

      expect(mock.in).toHaveBeenCalledWith('id', ['user-1']);
    });

    // RLS returns only the profiles the caller may see. A member whose profile
    // is missing from the response must not break the caller.
    it('should omit users whose profile is not visible', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({
          data: [{ id: 'user-1', display_name: 'Mor' }],
          error: null,
        })
      );

      const result = await getProfilesForUsers(['user-1', 'user-2']);

      expect(result.profiles?.['user-1']).toBeDefined();
      expect(result.profiles?.['user-2']).toBeUndefined();
    });

    it('should surface an error', async () => {
      mockSupabaseFrom.mockReturnValue(
        createChainableMock({ data: null, error: { message: 'nope' } })
      );

      const result = await getProfilesForUsers(['user-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('nope');
    });
  });
});
