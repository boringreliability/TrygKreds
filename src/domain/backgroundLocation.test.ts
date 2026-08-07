/**
 * Ward 4: Background location decision tests
 *
 * Feature: Background location updates
 *
 * These are arithmetic. The module under test has no imports at all, so nothing
 * here needs a device, a renderer or a mock.
 */

import fs from 'fs';
import path from 'path';

import {
  BACKGROUND_LOCATION_CONFIG,
  distanceBetweenMeters,
  shouldSendUpdate,
  canRunBackgroundUpdates,
  type BackgroundLocationConfig,
  type LocationFix,
  type LastSentPosition,
} from './backgroundLocation';

// A deliberately strict config, so each test exercises one rule.
const config: BackgroundLocationConfig = {
  minIntervalMs: 5 * 60 * 1000,
  minDistanceMeters: 100,
  maxAccuracyMeters: 250,
  accuracy: 'balanced',
};

const NOW = 1_700_000_000_000;

const fix = (overrides: Partial<LocationFix> = {}): LocationFix => ({
  latitude: 55.6761,
  longitude: 12.5683,
  accuracy: 10,
  timestamp: NOW,
  ...overrides,
});

const lastSent = (
  overrides: Partial<LastSentPosition> = {}
): LastSentPosition => ({
  latitude: 55.6761,
  longitude: 12.5683,
  sentAt: NOW - 10 * 60 * 1000, // long enough ago that the interval has passed
  ...overrides,
});

describe('Background location decision logic', () => {
  // The whole point of putting this in src/domain is that it stays free of the
  // platform. A test is the only thing that keeps it that way.
  describe('module purity', () => {
    it('should not import from expo-* or react-native', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'backgroundLocation.ts'),
        'utf8'
      );

      expect(source).not.toMatch(/from\s+['"]expo/);
      expect(source).not.toMatch(/from\s+['"]react-native/);
      expect(source).not.toMatch(/require\(\s*['"]expo/);
      expect(source).not.toMatch(/require\(\s*['"]react-native/);
    });

    it('should have no imports whatsoever', () => {
      const source = fs.readFileSync(
        path.join(__dirname, 'backgroundLocation.ts'),
        'utf8'
      );

      expect(source).not.toMatch(/^\s*import\s/m);
    });
  });

  describe('BACKGROUND_LOCATION_CONFIG', () => {
    // Battery is a product requirement, not an optimisation.
    it('should default to balanced accuracy, not highest', () => {
      expect(BACKGROUND_LOCATION_CONFIG.accuracy).toBe('balanced');
    });

    it('should not poll more often than every few minutes', () => {
      expect(BACKGROUND_LOCATION_CONFIG.minIntervalMs).toBeGreaterThanOrEqual(
        60 * 1000
      );
    });

    it('should require a meaningful movement before sending', () => {
      expect(BACKGROUND_LOCATION_CONFIG.minDistanceMeters).toBeGreaterThan(0);
    });

    it('should reject fixes worse than its accuracy threshold', () => {
      expect(BACKGROUND_LOCATION_CONFIG.maxAccuracyMeters).toBeGreaterThan(0);
    });
  });

  describe('distanceBetweenMeters', () => {
    it('should be zero for the same point', () => {
      expect(
        distanceBetweenMeters(
          { latitude: 55.6761, longitude: 12.5683 },
          { latitude: 55.6761, longitude: 12.5683 }
        )
      ).toBe(0);
    });

    it('should measure a known distance', () => {
      // Copenhagen city hall to Nyhavn is roughly 1.4 km.
      const metres = distanceBetweenMeters(
        { latitude: 55.6759, longitude: 12.5655 },
        { latitude: 55.6797, longitude: 12.5913 }
      );

      expect(metres).toBeGreaterThan(1200);
      expect(metres).toBeLessThan(1800);
    });

    it('should be symmetric', () => {
      const a = { latitude: 55.6761, longitude: 12.5683 };
      const b = { latitude: 56.15, longitude: 10.21 };

      expect(distanceBetweenMeters(a, b)).toBeCloseTo(
        distanceBetweenMeters(b, a),
        6
      );
    });

    it('should handle the antimeridian without exploding', () => {
      const metres = distanceBetweenMeters(
        { latitude: 0, longitude: 179.999 },
        { latitude: 0, longitude: -179.999 }
      );

      // A couple of hundred metres apart, not most of the way round the planet.
      expect(metres).toBeLessThan(1000);
    });
  });

  describe('shouldSendUpdate', () => {
    it('should send the first fix immediately', () => {
      const decision = shouldSendUpdate({
        lastSent: null,
        current: fix(),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(true);
      expect(decision.reason).toBe('first-fix');
    });

    it('should send the first fix even inside the minimum interval', () => {
      // Nothing is stored yet, so there is no interval to respect.
      const decision = shouldSendUpdate({
        lastSent: null,
        current: fix({ timestamp: NOW }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(true);
    });

    it('should drop a fix that arrives before the minimum interval', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent({ sentAt: NOW - 60 * 1000 }),
        current: fix({ latitude: 56.15, longitude: 10.21 }), // far away
        config,
        now: NOW,
      });

      expect(decision.send).toBe(false);
      expect(decision.reason).toBe('too-soon');
    });

    it('should treat the interval as a hard floor, however far the user moved', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent({ sentAt: NOW - 1 }),
        current: fix({ latitude: -33.86, longitude: 151.2 }), // other side of the world
        config,
        now: NOW,
      });

      expect(decision.send).toBe(false);
      expect(decision.reason).toBe('too-soon');
    });

    it('should accept a fix exactly at the minimum interval', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent({
          sentAt: NOW - config.minIntervalMs,
          latitude: 56.15,
          longitude: 10.21,
        }),
        current: fix(),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(true);
    });

    it('should drop a fix that has not moved far enough', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent(),
        // ~11 m north
        current: fix({ latitude: 55.6762 }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(false);
      expect(decision.reason).toBe('not-moved');
    });

    it('should send when the user moved beyond the minimum distance', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent(),
        // ~1.4 km away
        current: fix({ latitude: 55.6797, longitude: 12.5913 }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(true);
      expect(decision.reason).toBe('moved');
    });

    it('should drop an inaccurate fix', () => {
      const decision = shouldSendUpdate({
        lastSent: lastSent(),
        current: fix({
          latitude: 55.6797,
          longitude: 12.5913,
          accuracy: 2000,
        }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(false);
      expect(decision.reason).toBe('inaccurate');
    });

    it('should accept a fix exactly at the accuracy threshold', () => {
      const decision = shouldSendUpdate({
        lastSent: null,
        current: fix({ accuracy: config.maxAccuracyMeters }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(true);
    });

    // Not every platform reports accuracy. Discarding a fix because the number
    // is missing would mean sending nothing at all on those devices.
    it('should accept a fix with unknown accuracy', () => {
      for (const accuracy of [null, undefined]) {
        const decision = shouldSendUpdate({
          lastSent: null,
          current: fix({ accuracy }),
          config,
          now: NOW,
        });

        expect(decision.send).toBe(true);
      }
    });

    it('should drop coordinates outside the valid range', () => {
      const cases: Partial<LocationFix>[] = [
        { latitude: 91 },
        { latitude: -91 },
        { longitude: 181 },
        { longitude: -181 },
        { latitude: Number.NaN },
        { longitude: Number.NaN },
      ];

      for (const overrides of cases) {
        const decision = shouldSendUpdate({
          lastSent: null,
          current: fix(overrides),
          config,
          now: NOW,
        });

        expect(decision.send).toBe(false);
        expect(decision.reason).toBe('invalid');
      }
    });

    it('should reject nonsense before anything else', () => {
      // Invalid coordinates with poor accuracy: the coordinates are the more
      // fundamental problem, and the reason should say so.
      const decision = shouldSendUpdate({
        lastSent: null,
        current: fix({ latitude: 91, accuracy: 5000 }),
        config,
        now: NOW,
      });

      expect(decision.reason).toBe('invalid');
    });

    it('should not be confused by a clock that went backwards', () => {
      // A last-sent timestamp in the future would make elapsed time negative.
      // That must not read as "the interval has passed".
      const decision = shouldSendUpdate({
        lastSent: lastSent({ sentAt: NOW + 60 * 60 * 1000 }),
        current: fix({ latitude: 56.15, longitude: 10.21 }),
        config,
        now: NOW,
      });

      expect(decision.send).toBe(false);
      expect(decision.reason).toBe('too-soon');
    });
  });

  describe('canRunBackgroundUpdates', () => {
    it('should allow updates when signed in and sharing with a group', () => {
      expect(
        canRunBackgroundUpdates({ isSignedIn: true, sharingGroupCount: 1 })
      ).toBe(true);
    });

    it('should refuse when signed out', () => {
      expect(
        canRunBackgroundUpdates({ isSignedIn: false, sharingGroupCount: 3 })
      ).toBe(false);
    });

    it('should refuse when not sharing with any group', () => {
      expect(
        canRunBackgroundUpdates({ isSignedIn: true, sharingGroupCount: 0 })
      ).toBe(false);
    });

    it('should refuse when both conditions fail', () => {
      expect(
        canRunBackgroundUpdates({ isSignedIn: false, sharingGroupCount: 0 })
      ).toBe(false);
    });
  });
});
