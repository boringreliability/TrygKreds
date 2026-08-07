/**
 * send-sos-notification
 *
 * Sends SOS push notifications to the members of the caller's groups.
 *
 * This runs on your Supabase instance with the service role, because that is the
 * only thing permitted to read from push_tokens -- end users hold no privilege on
 * that table at all, not even for their own rows.
 *
 * THE PAYLOAD CARRIES NO COORDINATES. It names the sender and the group and
 * nothing else. A notification passes through Expo's relay and then Apple's or
 * Google's push service, and none of them need to know where anyone is.
 * Recipients open the app and read the position from the database, where row
 * level security still applies. `supabase/functions/send-sos-notification` is
 * checked for coordinate fields by a test in src/domain/sos.test.ts -- if you add
 * one here, that test fails and PRIVACY.md has to change in the same pull
 * request.
 *
 * Deno runtime. Not covered by the Jest suite; see the note in README.
 */

// @ts-expect-error -- Deno-style remote import, resolved at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Expo's push relay. The one outbound host this function talks to. */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects oversized batches; it documents 100 messages per request. */
const MAX_MESSAGES_PER_REQUEST = 100;

interface RequestBody {
  groupIds?: string[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// @ts-expect-error -- Deno global, present at runtime.
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // @ts-expect-error -- Deno global.
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error -- Deno global.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Function is not configured' }, 500);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  // Identify the caller from their own JWT. The service-role client below can
  // read anything, so the sender must never be taken from the request body.
  const callerClient = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser(authHeader.replace('Bearer ', ''));

  if (userError || !user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const requestedGroupIds = body.groupIds ?? [];
  if (requestedGroupIds.length === 0) {
    return jsonResponse({ error: 'No groups given' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Only groups the caller actually belongs to. Taking the request at its word
  // would let anyone notify any group by guessing a UUID.
  const { data: ownMemberships, error: membershipError } = await admin
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .in('group_id', requestedGroupIds);

  if (membershipError) {
    return jsonResponse({ error: membershipError.message }, 500);
  }

  const groupIds = (ownMemberships ?? []).map(
    (row: { group_id: string }) => row.group_id
  );

  if (groupIds.length === 0) {
    return jsonResponse({ error: 'Not a member of any given group' }, 403);
  }

  // The sender's chosen name, for the notification text.
  const { data: senderProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const senderName =
    (senderProfile?.display_name as string | null)?.trim() || 'A group member';

  const { data: groupRows } = await admin
    .from('groups')
    .select('id, name')
    .in('id', groupIds);

  const groupNames = new Map<string, string>(
    (groupRows ?? []).map((row: { id: string; name: string }) => [
      row.id,
      row.name,
    ])
  );

  // Everyone in those groups except the sender.
  const { data: recipients, error: recipientsError } = await admin
    .from('group_members')
    .select('user_id, group_id')
    .in('group_id', groupIds)
    .neq('user_id', user.id);

  if (recipientsError) {
    return jsonResponse({ error: recipientsError.message }, 500);
  }

  const recipientIds = [
    ...new Set(
      (recipients ?? []).map((row: { user_id: string }) => row.user_id)
    ),
  ];

  if (recipientIds.length === 0) {
    return jsonResponse({ sent: 0, reason: 'no-recipients' });
  }

  // The only read of push_tokens anywhere in the system.
  const { data: tokens, error: tokensError } = await admin
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', recipientIds);

  if (tokensError) {
    return jsonResponse({ error: tokensError.message }, 500);
  }

  if (!tokens || tokens.length === 0) {
    return jsonResponse({ sent: 0, reason: 'no-tokens' });
  }

  // Which group to mention to each recipient.
  const groupForRecipient = new Map<string, string>();
  for (const row of recipients ?? []) {
    const r = row as { user_id: string; group_id: string };
    if (!groupForRecipient.has(r.user_id)) {
      groupForRecipient.set(r.user_id, r.group_id);
    }
  }

  const messages = (tokens as { user_id: string; token: string }[]).map(
    ({ user_id, token }) => {
      const groupId = groupForRecipient.get(user_id);
      const groupName = (groupId && groupNames.get(groupId)) || 'your group';

      return {
        to: token,
        title: 'SOS',
        body: `${senderName} needs help — sent an SOS in ${groupName}. Open TrygKreds to see their last known location.`,
        sound: 'default',
        priority: 'high',
        // Enough to open the right group, and nothing more. No coordinates.
        data: { type: 'sos', groupId },
      };
    }
  );

  let sent = 0;
  const failures: string[] = [];

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (response.ok) {
        sent += batch.length;
      } else {
        failures.push(`Expo responded ${response.status}`);
      }
    } catch (error) {
      // A failed batch must not lose the others. The SOS event is already
      // recorded either way, so an undelivered notification is a degraded
      // outcome rather than a lost alert.
      failures.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return jsonResponse({
    sent,
    recipients: recipientIds.length,
    failures: failures.length > 0 ? failures : undefined,
  });
});
