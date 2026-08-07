#!/usr/bin/env node
/**
 * Network access guard.
 *
 * The dependency allowlist stops a tracking SDK arriving as a package. This
 * stops one arriving as five lines of hand-written code: a fetch() to an
 * endpoint, a hardcoded host, a WebSocket to somewhere that is not your
 * Supabase instance.
 *
 * Two scopes, because client code and server code have genuinely different
 * rules:
 *
 *   app    (src/, app/)             -- no absolute URL outside the host allowlist,
 *                                      and no direct network primitives at all.
 *                                      Everything goes through the Supabase
 *                                      client, configured from
 *                                      EXPO_PUBLIC_SUPABASE_URL, so the
 *                                      destination is the operator's choice
 *                                      rather than baked into the source.
 *   server (supabase/functions/)    -- runs on the operator's own Supabase
 *                                      instance. fetch() is the point of an Edge
 *                                      Function, so it is allowed, but every host
 *                                      it reaches must be listed here, and any
 *                                      host that receives user data must also be
 *                                      disclosed in PRIVACY.md.
 *
 * Comments and string contents are treated alike on purpose. A URL in a comment
 * is not a request, but it is where a request usually starts, and the cost of
 * mentioning a link in a doc comment is one allowlist entry.
 *
 * Run: node scripts/check-network-access.js
 * Exits non-zero on any violation, so CI fails rather than warns.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Hosts our own client source may name literally.
 *
 * The real Supabase host is never in here: it comes from
 * EXPO_PUBLIC_SUPABASE_URL at runtime. That is what makes the app self-hostable,
 * and it is why this list stays this short.
 */
const APP_HOSTS = new Set([
  // Dev-time fallback in src/config/env.ts, used when no Supabase URL is set.
  // Not a real host.
  'placeholder.supabase.co',
]);

/**
 * Hosts the server-side functions may reach.
 *
 * `disclose: true` means the host receives data about a user, so it must appear
 * in PRIVACY.md. `disclose: false` is for build- and deploy-time module fetches,
 * which carry no user data.
 */
const SERVER_HOSTS = {
  'exp.host': {
    disclose: true,
    why: "Expo's push relay, used to deliver SOS notifications. Receives the push token and the notification text -- which is why the payload carries no coordinates.",
  },
  'esm.sh': {
    disclose: false,
    why: 'Module CDN for the Deno import of @supabase/supabase-js, resolved at deploy time. Carries no user data.',
  },
};

/** Direct network primitives, forbidden in app code. */
const FORBIDDEN_CALLS = [
  { pattern: /(?<![.\w])fetch\s*\(/, what: 'fetch()' },
  { pattern: /XMLHttpRequest/, what: 'XMLHttpRequest' },
  { pattern: /new\s+WebSocket\s*\(/, what: 'WebSocket' },
  { pattern: /sendBeacon\s*\(/, what: 'navigator.sendBeacon()' },
];

const SCOPES = [
  {
    name: 'app',
    dirs: ['src', 'app'],
    hosts: APP_HOSTS,
    forbidDirectCalls: true,
  },
  {
    name: 'server',
    dirs: ['supabase/functions'],
    hosts: new Set(Object.keys(SERVER_HOSTS)),
    forbidDirectCalls: false,
  },
];

/**
 * Files exempt from the forbidden-call rule.
 *
 * Empty, and meant to stay that way. An entry here is a documented hole in the
 * guarantee, so it needs a reason next to it.
 */
const CALL_EXEMPT_FILES = new Set([]);

function listSourceFiles(dir) {
  const absolute = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absolute)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      files.push(...listSourceFiles(relative));
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relative);
    }
  }
  return files;
}

function main() {
  const errors = [];
  let scannedCount = 0;
  const serverHostsSeen = new Set();

  for (const scope of SCOPES) {
    const files = scope.dirs.flatMap(listSourceFiles).sort();
    scannedCount += files.length;

    for (const file of files) {
      const contents = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

      contents.split('\n').forEach((line, index) => {
        const lineNumber = index + 1;

        // Rule 1: absolute URLs must point at a host this scope allows.
        for (const match of line.matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g)) {
          const host = match[1];
          // Template literals such as `https://${host}` yield no usable host.
          if (host.includes('$')) continue;

          if (!scope.hosts.has(host)) {
            errors.push(
              `${file}:${lineNumber} references host "${host}", which is not allowed in ${scope.name} code.`
            );
          } else if (scope.name === 'server') {
            serverHostsSeen.add(host);
          }
        }

        // Rule 2: no direct network primitives in app code.
        if (!scope.forbidDirectCalls || CALL_EXEMPT_FILES.has(file)) return;
        for (const forbidden of FORBIDDEN_CALLS) {
          if (forbidden.pattern.test(line)) {
            errors.push(
              `${file}:${lineNumber} uses ${forbidden.what} directly. ` +
                'Route network access through the Supabase client.'
            );
          }
        }
      });
    }
  }

  // Rule 3: a server host that receives user data must be disclosed.
  const privacyPath = path.join(REPO_ROOT, 'PRIVACY.md');
  if (fs.existsSync(privacyPath)) {
    const privacy = fs.readFileSync(privacyPath, 'utf8');
    for (const host of serverHostsSeen) {
      if (SERVER_HOSTS[host].disclose && !privacy.includes(host)) {
        errors.push(
          `"${host}" receives user data but is not mentioned in PRIVACY.md.`
        );
      }
    }
  } else {
    errors.push(
      'PRIVACY.md is missing. The privacy contract is part of the build.'
    );
  }

  if (errors.length > 0) {
    console.error('\nNetwork access check FAILED\n');
    for (const error of errors) {
      console.error(`  x ${error}`);
    }
    console.error(
      [
        '',
        'PRIVACY.md describes exactly which hosts this project talks to. Either',
        'remove the call, or -- if it is genuinely needed -- add the host to',
        'APP_HOSTS or SERVER_HOSTS in scripts/check-network-access.js with a',
        'reason, and disclose it in PRIVACY.md in the same pull request.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  console.log(
    `Network access check passed: ${scannedCount} source files scanned.`
  );
  console.log(
    '  App code: no host or network call outside the Supabase client.'
  );
  console.log(
    serverHostsSeen.size === 0
      ? '  Server code: reaches no external host.'
      : `  Server code reaches: ${[...serverHostsSeen].sort().join(', ')}`
  );
}

main();
