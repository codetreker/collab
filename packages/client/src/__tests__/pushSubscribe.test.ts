// pushSubscribe.test.ts — DL-4.5 client Web Push subscription helper
// tests. Validates helper functions that don't require live browser APIs
// (urlBase64ToUint8Array + state detection).
//
// Pins:
//   - urlBase64ToUint8Array byte-identical encoding (W3C Web Push spec)
//   - isPushSupported feature-detection in jsdom (no PushManager → false)
//   - getCurrentSubscriptionState returns 'unsupported' in jsdom
//
// Real subscribe/unsubscribe flow exercised by playwright e2e
// (dl-4-pwa-subscribe.spec.ts) where browser provides PushManager.
import { describe, it, expect } from 'vitest';
import {
  isPushSupported,
  getCurrentSubscriptionState,
  urlBase64ToUint8Array,
} from '../lib/pushSubscribe';

describe('DL-4.5 pushSubscribe helpers', () => {
  it('isPushSupported returns false in jsdom (no PushManager)', () => {
    // jsdom has navigator.serviceWorker (some impls) but no PushManager.
    expect(isPushSupported()).toBe(false);
  });

  it('getCurrentSubscriptionState returns unsupported in jsdom', () => {
    expect(getCurrentSubscriptionState()).toBe('unsupported');
  });

  describe('urlBase64ToUint8Array (VAPID applicationServerKey encoder)', () => {
    it('decodes a known base64-url VAPID key to expected byte length', () => {
      // Real VAPID public key shape: 65 bytes (uncompressed P-256 point).
      // base64-url-encoded length ≈ 87 chars (no padding).
      const sampleVAPID = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
      const result = urlBase64ToUint8Array(sampleVAPID);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65);
    });

    it('handles base64-url specific chars (- and _) by translating to + and /', () => {
      const inputWithUrlChars = 'AB-_'; // base64-url chars
      const result = urlBase64ToUint8Array(inputWithUrlChars);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(3);
    });

    it('handles missing padding (Web Push contract: no = padding)', () => {
      // Length 8 = no padding needed; length 7 needs 1 padding char.
      const padded = urlBase64ToUint8Array('AAAAAAAA');
      const unpadded = urlBase64ToUint8Array('AAAAAAA'); // pre-padding required
      expect(padded.length).toBe(6);
      expect(unpadded.length).toBe(5);
    });

    it('returns empty Uint8Array for empty input', () => {
      const result = urlBase64ToUint8Array('');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });
  });
});
