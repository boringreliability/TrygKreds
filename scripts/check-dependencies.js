#!/usr/bin/env node
/**
 * Dependency allowlist guard.
 *
 * PRIVACY.md promises no third-party SDKs with network access: no analytics, no
 * ad networks, no crash reporting, no device identifiers. A promise like that
 * decays silently -- someone adds a package for a good reason, it pulls in a
 * telemetry client, and nobody notices.
 *
 * So every runtime dependency has to be listed below, with a reason and an
 * explicit note about whether it talks to the network. Adding a dependency means
 * editing this file on purpose, in a diff a reviewer can see. That friction is
 * the entire point: the list is the documentation.
 *
 * This guard covers `dependencies` only. devDependencies do not ship in the app
 * binary, and holding them to the same list would make the guard noisy enough
 * that people would stop reading it.
 *
 * Run: node scripts/check-dependencies.js
 * Exits non-zero on any violation, so CI fails rather than warns.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * network: 'none'       -- no network access whatsoever
 *          'supabase'   -- talks only to the Supabase instance the app is configured with
 *          'thirdParty' -- reaches a third party; MUST be disclosed in PRIVACY.md
 */
const ALLOWED_RUNTIME_DEPENDENCIES = {
  '@supabase/supabase-js': {
    reason: 'The only backend client. Talks to your own Supabase instance.',
    network: 'supabase',
  },

  // --- Expo / React Native platform ---------------------------------------
  expo: {
    reason: 'Application framework.',
    network: 'none',
  },
  'expo-constants': {
    reason: 'Reads app config at runtime. Required peer of expo-router.',
    network: 'none',
  },
  'expo-linking': {
    reason: 'Deep links for navigation. Required peer of expo-router.',
    network: 'none',
  },
  'expo-location': {
    reason:
      'Reads the device position via the OS location service. No network service of its own.',
    network: 'none',
  },
  'expo-router': {
    reason: 'Navigation.',
    network: 'none',
  },
  'expo-status-bar': {
    reason: 'Status bar styling.',
    network: 'none',
  },
  'expo-task-manager': {
    reason:
      'Runs the Ward 4 background location task. Required by expo-location for startLocationUpdatesAsync. Hands positions to our own code; no service of its own.',
    network: 'none',
  },
  react: {
    reason: 'UI library.',
    network: 'none',
  },
  'react-dom': {
    reason:
      'Web rendering. Required peer of expo-router, which pulls in vaul/@radix-ui for its web modals.',
    network: 'none',
  },
  'react-native': {
    reason: 'Mobile runtime.',
    network: 'none',
  },
  'react-native-web': {
    reason: 'Web target. Required peer of expo-router and react-native-maps.',
    network: 'none',
  },

  // --- UI plumbing required by expo-router --------------------------------
  'react-native-gesture-handler': {
    reason: 'Gesture handling. Required peer of expo-router.',
    network: 'none',
  },
  'react-native-reanimated': {
    reason: 'Animations. Required peer of expo-router.',
    network: 'none',
  },
  'react-native-worklets': {
    reason: 'Runtime for react-native-reanimated 4.',
    network: 'none',
  },
  'react-native-safe-area-context': {
    reason: 'Safe area insets. Required peer of expo-router.',
    network: 'none',
  },
  'react-native-screens': {
    reason: 'Native screen primitives. Required peer of expo-router.',
    network: 'none',
  },

  'expo-device': {
    reason:
      'Reports whether the app is running on a physical device. Expo push tokens cannot be minted on a simulator, so registration is skipped there. Reads local device characteristics only; nothing is transmitted.',
    network: 'none',
  },

  // --- Third-party network paths, each disclosed in PRIVACY.md -------------
  'expo-notifications': {
    reason:
      'SOS push notifications. Minting a push token contacts Expo\'s servers, and delivery goes through Expo\'s relay to Apple and Google, so Expo sees the token and the notification content. The SOS payload therefore carries no coordinates -- only who and which group. Disclosed under "Limitations" in PRIVACY.md.',
    network: 'thirdParty',
  },
  'react-native-maps': {
    reason:
      'Renders the group map. Uses MapKit on iOS and Google Maps on Android, so tiles are fetched from Apple or Google and the viewport is visible to them. Disclosed under "Limitations" in PRIVACY.md. Carries no analytics SDK of its own.',
    network: 'thirdParty',
  },
};

/**
 * Package name fragments that must never appear in a runtime dependency.
 *
 * The allowlist alone already blocks these. This is a second, louder net so that
 * an attempt to add one produces an explanation rather than a bare "not on the
 * allowlist".
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /analytics/i, why: 'an analytics SDK' },
  { pattern: /telemetry/i, why: 'a telemetry SDK' },
  {
    pattern: /mixpanel|amplitude|posthog|segment|heap-analytics/i,
    why: 'a product analytics SDK',
  },
  { pattern: /sentry|bugsnag|crashlytics|rollbar/i, why: 'a crash reporter' },
  {
    pattern: /admob|applovin|adjust|appsflyer|facebook-ads|google-mobile-ads/i,
    why: 'an advertising or attribution SDK',
  },
  {
    pattern: /firebase/i,
    why: 'Firebase, which bundles analytics and device identifiers',
  },
  {
    pattern: /device-info|fingerprintjs|advertising-id|idfa/i,
    why: 'a device-identification library',
  },
  {
    pattern: /tracking-transparency/i,
    why: 'an ad-tracking consent library, which implies ad tracking',
  },
];

function fail(messages) {
  console.error('\nDependency check FAILED\n');
  for (const message of messages) {
    console.error(`  x ${message}`);
  }
  console.error(
    [
      '',
      'Every runtime dependency must be listed in ALLOWED_RUNTIME_DEPENDENCIES in',
      'scripts/check-dependencies.js, with a reason and its network behaviour.',
      '',
      'If the addition is legitimate, add it to that list in this pull request and',
      'say why. If it reaches a third party over the network, it must also be',
      'disclosed in PRIVACY.md before this check will pass.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

function main() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const privacyPath = path.join(__dirname, '..', 'PRIVACY.md');

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = Object.keys(pkg.dependencies || {}).sort();

  const errors = [];

  // 1. Nothing outside the allowlist.
  for (const name of dependencies) {
    if (
      !Object.prototype.hasOwnProperty.call(ALLOWED_RUNTIME_DEPENDENCIES, name)
    ) {
      const forbidden = FORBIDDEN_PATTERNS.find((entry) =>
        entry.pattern.test(name)
      );
      errors.push(
        forbidden
          ? `"${name}" looks like ${forbidden.why}. TrygKreds does not ship one. See PRIVACY.md.`
          : `"${name}" is not on the runtime dependency allowlist.`
      );
    }
  }

  // 2. Nothing matching a forbidden pattern, even if somebody allowlisted it.
  for (const name of dependencies) {
    const forbidden = FORBIDDEN_PATTERNS.find((entry) =>
      entry.pattern.test(name)
    );
    if (forbidden && ALLOWED_RUNTIME_DEPENDENCIES[name]) {
      errors.push(
        `"${name}" is allowlisted but matches a forbidden pattern (${forbidden.why}). ` +
          'Remove it, or remove the pattern and justify that in PRIVACY.md.'
      );
    }
  }

  // 3. Anything reaching a third party must actually be disclosed.
  if (fs.existsSync(privacyPath)) {
    const privacy = fs.readFileSync(privacyPath, 'utf8');
    for (const name of dependencies) {
      const entry = ALLOWED_RUNTIME_DEPENDENCIES[name];
      if (entry && entry.network === 'thirdParty' && !privacy.includes(name)) {
        errors.push(
          `"${name}" is marked as reaching a third party but is not mentioned in PRIVACY.md.`
        );
      }
    }
  } else {
    errors.push(
      'PRIVACY.md is missing. The privacy contract is part of the build.'
    );
  }

  if (errors.length > 0) {
    fail(errors);
  }

  // Stale allowlist entries are worth surfacing but are not a failure: a removed
  // dependency is never a privacy regression.
  const stale = Object.keys(ALLOWED_RUNTIME_DEPENDENCIES)
    .filter((name) => !dependencies.includes(name))
    .sort();

  const thirdParty = dependencies.filter(
    (name) => ALLOWED_RUNTIME_DEPENDENCIES[name].network === 'thirdParty'
  );

  console.log(
    `Dependency check passed: ${dependencies.length} runtime dependencies, all allowlisted.`
  );
  console.log(
    thirdParty.length === 0
      ? '  No dependency reaches a third party.'
      : `  Reaches a third party (disclosed in PRIVACY.md): ${thirdParty.join(', ')}`
  );
  if (stale.length > 0) {
    console.log(
      `  Note: allowlisted but no longer installed: ${stale.join(', ')}`
    );
  }
}

main();
