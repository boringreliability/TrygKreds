/**
 * Ward 5: SOS Domain Tests
 *
 * Feature: SOS panic button
 */

import fs from 'fs';
import path from 'path';

import {
  triggerSos,
  buildSosNotification,
  registerPushToken,
  removePushToken,
  getGroupSosEvents,
  deleteSosEvent,
} from './sos';
import * as auth from './auth';
import * as groups from './groups';
import * as locationService from '../services/location';

jest.mock('./auth');
jest.mock('./groups');
jest.mock('../services/location');

const mockAuth = auth as jest.Mocked<typeof auth>;
const mockGroups = groups as jest.Mocked<typeof groups>;
const mockLocationService = locationService as jest.Mocked<
  typeof locationService
>;

const mockSupabaseFrom = jest.fn();
const mockSupabaseRpc = jest.fn();
const mockInvoke = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockSupabaseFrom(table),
    rpc: (fn: string, params: unknown) => mockSupabaseRpc(fn, params),
    functions: {
      invoke: (fn: string, options: unknown) => mockInvoke(fn, options),
    },
  },
}));

const USER_ID = 'user-123';

const chainable = (finalResult: unknown) => ({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(finalResult),
  then: (resolve: (value: unknown) => void) => resolve(finalResult),
});

const signedIn = () => {
  mockAuth.getCurrentUser.mockResolvedValue({
    id: USER_ID,
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
  });
};

describe('SOS Domain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signedIn();
    mockGroups.getMyGroups.mockResolvedValue({
      success: true,
      groups: [
        {
          id: 'group-a',
          name: 'Family',
          ownerId: USER_ID,
          inviteCode: 'AAAA111111',
          createdAt: new Date().toISOString(),
          role: 'owner',
        },
      ],
    });
    mockLocationService.getCurrentLocation.mockResolvedValue({
      success: true,
      coordinates: { latitude: 55.6761, longitude: 12.5683, accuracy: 10 },
    });
    mockSupabaseFrom.mockReturnValue(
      chainable({ data: [{ id: 'sos-1' }], error: null })
    );
    mockInvoke.mockResolvedValue({ data: { sent: 2 }, error: null });
    mockSupabaseRpc.mockResolvedValue({ data: null, error: null });
  });

  // The push notification is the one part of an SOS that leaves the database and
  // passes through Apple, Google and Expo's relay. None of them need coordinates.
  describe('buildSosNotification', () => {
    it('should name the sender and the group', () => {
      const payload = buildSosNotification('Mor', 'Family');

      expect(payload.title).toMatch(/SOS/i);
      expect(payload.body).toContain('Mor');
      expect(payload.body).toContain('Family');
    });

    it('should never contain coordinates', () => {
      const payload = buildSosNotification('Mor', 'Family');
      const serialised = JSON.stringify(payload);

      expect(serialised).not.toMatch(/latitude|longitude|55\.6|12\.5/);
    });

    it('should fall back to a neutral name when none is set', () => {
      const payload = buildSosNotification(null, 'Family');

      expect(payload.body).toContain('A group member');
    });
  });

  // The Edge Function builds the payload that actually goes to Expo. It is Deno
  // code and not otherwise covered by this suite, so the privacy-relevant
  // property is asserted by reading it: coordinates must never appear in what
  // leaves the database. PRIVACY.md names this test.
  describe('the Edge Function payload', () => {
    const functionSource = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        'supabase',
        'functions',
        'send-sos-notification',
        'index.ts'
      ),
      'utf8'
    );

    // Comments in that file legitimately discuss coordinates; strip them first so
    // this checks the code rather than the prose explaining the rule.
    const functionCode = functionSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    it('should not reference coordinate fields at all', () => {
      expect(functionCode).not.toMatch(/latitude/i);
      expect(functionCode).not.toMatch(/longitude/i);
      expect(functionCode).not.toMatch(/\bcoords\b/i);
    });

    it('should not read from member_locations', () => {
      expect(functionCode).not.toMatch(/member_locations/);
    });

    it('should not select coordinates from sos_events', () => {
      // It has no reason to read sos_events at all: it is told which groups to
      // notify, and the alert text needs only a name and a group.
      expect(functionCode).not.toMatch(/sos_events/);
    });

    it("should only post to Expo's documented push endpoint", () => {
      const hosts = [
        ...functionCode.matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g),
      ].map((match) => match[1]);

      for (const host of hosts) {
        expect(['exp.host', 'esm.sh']).toContain(host);
      }
    });
  });

  describe('triggerSos', () => {
    it('should record an event for every group the user is in', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: true,
        groups: [
          {
            id: 'group-a',
            name: 'Family',
            ownerId: USER_ID,
            inviteCode: 'AAAA111111',
            createdAt: new Date().toISOString(),
            role: 'owner',
          },
          {
            id: 'group-b',
            name: 'Work',
            ownerId: 'other',
            inviteCode: 'BBBB222222',
            createdAt: new Date().toISOString(),
            role: 'member',
          },
        ],
      });

      const result = await triggerSos();

      expect(result.success).toBe(true);
      expect(result.groupIds).toEqual(['group-a', 'group-b']);
    });

    it('should include the current position when available', async () => {
      const mock = chainable({ data: [{ id: 'sos-1' }], error: null });
      mockSupabaseFrom.mockReturnValue(mock);

      await triggerSos();

      expect(mock.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: USER_ID,
          group_id: 'group-a',
          latitude: 55.6761,
          longitude: 12.5683,
        }),
      ]);
    });

    // The alert matters more than the coordinates.
    it('should record the event without coordinates when permission was refused', async () => {
      mockLocationService.getCurrentLocation.mockResolvedValue({
        success: false,
        error: 'Location permission not granted',
      });
      const mock = chainable({ data: [{ id: 'sos-1' }], error: null });
      mockSupabaseFrom.mockReturnValue(mock);

      const result = await triggerSos();

      expect(result.success).toBe(true);
      expect(mock.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          latitude: null,
          longitude: null,
          accuracy: null,
        }),
      ]);
    });

    it('should record the event without coordinates when no fix is available', async () => {
      mockLocationService.getCurrentLocation.mockResolvedValue({
        success: false,
        error: 'Location unavailable',
      });

      const result = await triggerSos();

      expect(result.success).toBe(true);
      expect(result.hadLocation).toBe(false);
    });

    it('should report that it had a location when it did', async () => {
      const result = await triggerSos();

      expect(result.hadLocation).toBe(true);
    });

    it('should notify after recording, not before', async () => {
      const order: string[] = [];
      const mock = chainable({ data: [{ id: 'sos-1' }], error: null });
      mock.select = jest.fn(() => {
        order.push('record');
        return mock;
      }) as never;
      mockSupabaseFrom.mockReturnValue(mock);
      mockInvoke.mockImplementation(async () => {
        order.push('notify');
        return { data: { sent: 1 }, error: null };
      });

      await triggerSos();

      expect(order).toEqual(['record', 'notify']);
    });

    it('should ask the Edge Function to send the notifications', async () => {
      await triggerSos();

      expect(mockInvoke).toHaveBeenCalledWith(
        'send-sos-notification',
        expect.objectContaining({
          body: expect.objectContaining({ groupIds: ['group-a'] }),
        })
      );
    });

    // Recording comes first, so an undelivered alert is still visible in the app.
    it('should keep the recorded event when notification fails', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'relay unavailable' },
      });

      const result = await triggerSos();

      expect(result.success).toBe(true);
      expect(result.notified).toBe(false);
      expect(result.notifyError).toBe('relay unavailable');
    });

    it('should report a successful notification', async () => {
      const result = await triggerSos();

      expect(result.notified).toBe(true);
    });

    it('should fail when the event cannot be recorded', async () => {
      mockSupabaseFrom.mockReturnValue(
        chainable({ data: null, error: { message: 'insert denied' } })
      );

      const result = await triggerSos();

      expect(result.success).toBe(false);
      expect(result.error).toBe('insert denied');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should refuse when signed out', async () => {
      mockAuth.getCurrentUser.mockResolvedValue(null);

      const result = await triggerSos();

      expect(result.success).toBe(false);
      expect(result.error).toBe('You must be signed in to send an SOS');
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should refuse when the user is in no groups', async () => {
      mockGroups.getMyGroups.mockResolvedValue({ success: true, groups: [] });

      const result = await triggerSos();

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not a member of any group');
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should fail when the group lookup fails', async () => {
      mockGroups.getMyGroups.mockResolvedValue({
        success: false,
        error: 'network down',
      });

      const result = await triggerSos();

      expect(result.success).toBe(false);
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('registerPushToken', () => {
    // The table is sealed: registration is a function call, never a table write.
    it('should register through the database function', async () => {
      const result = await registerPushToken('ExponentPushToken[abc]', 'ios');

      expect(result.success).toBe(true);
      expect(mockSupabaseRpc).toHaveBeenCalledWith('register_push_token', {
        p_token: 'ExponentPushToken[abc]',
        p_platform: 'ios',
      });
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });

    it('should surface an error', async () => {
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: { message: 'denied' },
      });

      const result = await registerPushToken('ExponentPushToken[abc]', 'ios');

      expect(result.success).toBe(false);
      expect(result.error).toBe('denied');
    });

    it('should reject an empty token without calling the server', async () => {
      const result = await registerPushToken('  ', 'ios');

      expect(result.success).toBe(false);
      expect(mockSupabaseRpc).not.toHaveBeenCalled();
    });
  });

  describe('removePushToken', () => {
    it('should remove through the database function', async () => {
      const result = await removePushToken('ExponentPushToken[abc]');

      expect(result.success).toBe(true);
      expect(mockSupabaseRpc).toHaveBeenCalledWith('remove_my_push_token', {
        p_token: 'ExponentPushToken[abc]',
      });
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('getGroupSosEvents', () => {
    it('should return the events for a group', async () => {
      mockSupabaseFrom.mockReturnValue(
        chainable({
          data: [
            {
              id: 'sos-1',
              user_id: USER_ID,
              group_id: 'group-a',
              latitude: 55.6761,
              longitude: 12.5683,
              accuracy: 10,
              created_at: '2026-08-07T10:00:00Z',
            },
          ],
          error: null,
        })
      );

      const result = await getGroupSosEvents('group-a');

      expect(result.success).toBe(true);
      expect(result.events?.[0]).toEqual({
        id: 'sos-1',
        userId: USER_ID,
        groupId: 'group-a',
        latitude: 55.6761,
        longitude: 12.5683,
        accuracy: 10,
        createdAt: '2026-08-07T10:00:00Z',
      });
    });

    it('should handle an event with no coordinates', async () => {
      mockSupabaseFrom.mockReturnValue(
        chainable({
          data: [
            {
              id: 'sos-1',
              user_id: USER_ID,
              group_id: 'group-a',
              latitude: null,
              longitude: null,
              accuracy: null,
              created_at: '2026-08-07T10:00:00Z',
            },
          ],
          error: null,
        })
      );

      const result = await getGroupSosEvents('group-a');

      expect(result.events?.[0].latitude).toBeNull();
    });
  });

  describe('deleteSosEvent', () => {
    it('should delete the event', async () => {
      const mock = chainable({ data: null, error: null });
      mockSupabaseFrom.mockReturnValue(mock);

      const result = await deleteSosEvent('sos-1');

      expect(result.success).toBe(true);
      expect(mock.delete).toHaveBeenCalled();
    });

    it('should surface an error', async () => {
      mockSupabaseFrom.mockReturnValue(
        chainable({ data: null, error: { message: 'nope' } })
      );

      const result = await deleteSosEvent('sos-1');

      expect(result.success).toBe(false);
    });
  });
});
