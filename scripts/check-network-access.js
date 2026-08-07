#!/usr/bin/env node
/**
 * Network access guard.
 *
 * The dependency allowlist stops a tracking SDK arriving as a package. This
 * stops one arriving as five lines of hand-written code: a fetch() to an
 * endpoint, a hardcoded host, a WebSocket to somewhere that is not your
 * Supabase instance.
 *
 * Two rules over our own source (src/ and app/):
 *
 *   1. No absolute http(s) URL whose host is not explicitly allowed.
 *   2. No direct fetch / XMLHttpRequest / WebSocket / navigator.sendBeacon.
 *      All network access goes through the Supabase client, which is configured
 *      from EXPO_PUBLIC_SUPABASE_URL, so the destination is the operator's
 *      choice rather than something baked into the source.
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
const SCANNED_DIRS = ['src', 'app'];
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Hosts our own source may name literally.
 *
 * The real Supabase host is never in here: it comes from
 * EXPO_PUBLIC_SUPABASE_URL at runtime. That is what makes the app self-hostable,
 * and it is why this list stays this short.
 */
const ALLOWED_HOSTS = new Set([
  // Dev-time fallback in src/config/env.ts, used when no Supabase URL is set.
  // Not a real host.
  'placeholder.supabase.co',
]);

/** Direct network primitives. All traffic must go through the Supabase client. */
const FORBIDDEN_CALLS = [
  {
    pattern: /(?<![.\w])fetch\s*\(/,
    what: 'fetch()',
  },
  {
    pattern: /XMLHttpRequest/,
    what: 'XMLHttpRequest',
  },
  {
    pattern: /new\s+WebSocket\s*\(/,
    what: 'WebSocket',
  },
  {
    pattern: /sendBeacon\s*\(/,
    what: 'navigator.sendBeacon()',
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
  const files = SCANNED_DIRS.flatMap(listSourceFiles).sort();
  const errors = [];

  for (const file of files) {
    const contents = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const lines = contents.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Rule 1: absolute URLs must point at an allowed host.
      const urlMatches = line.matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g);
      for (const match of urlMatches) {
        const host = match[1];
        // Template literals such as `https://${host}` produce no usable host.
        if (host.includes('$')) continue;
        if (!ALLOWED_HOSTS.has(host)) {
          errors.push(
            `${file}:${lineNumber} references host "${host}", which is not in ALLOWED_HOSTS.`
          );
        }
      }

      // Rule 2: no direct network primitives.
      if (CALL_EXEMPT_FILES.has(file)) return;
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

  if (errors.length > 0) {
    console.error('\nNetwork access check FAILED\n');
    for (const error of errors) {
      console.error(`  x ${error}`);
    }
    console.error(
      [
        '',
        'PRIVACY.md promises the app talks only to the Supabase instance it is',
        'configured with. Either remove the call, or -- if it is genuinely needed --',
        'add it to ALLOWED_HOSTS / CALL_EXEMPT_FILES in',
        'scripts/check-network-access.js with a reason, and disclose it in',
        'PRIVACY.md in the same pull request.',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  console.log(
    `Network access check passed: ${files.length} source files, no host or network call outside the Supabase client.`
  );
}

main();
