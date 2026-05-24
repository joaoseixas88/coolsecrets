import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  InvalidWebhookSignatureError,
  verifyInfisicalSignature,
} from '../src/webhook-verifier.js';

const SECRET = 'test-secret';

function signedHeader(rawBody: Buffer, timestamp: number, secret: string = SECRET): string {
  const sig = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `t=${timestamp};${sig}`;
}

describe('verifyInfisicalSignature', () => {
  it('accepts a valid signature within tolerance', () => {
    const body = Buffer.from('{"event":"test"}');
    const ts = 1_700_000_000;
    expect(() =>
      verifyInfisicalSignature({
        rawBody: body,
        header: signedHeader(body, ts),
        secret: SECRET,
        toleranceSeconds: 300,
        now: () => ts + 10,
      }),
    ).not.toThrow();
  });

  it('rejects a missing header', () => {
    expect(() =>
      verifyInfisicalSignature({
        rawBody: Buffer.from('{}'),
        header: undefined,
        secret: SECRET,
        toleranceSeconds: 300,
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a stale timestamp', () => {
    const body = Buffer.from('{}');
    const ts = 1_700_000_000;
    expect(() =>
      verifyInfisicalSignature({
        rawBody: body,
        header: signedHeader(body, ts),
        secret: SECRET,
        toleranceSeconds: 60,
        now: () => ts + 1_000,
      }),
    ).toThrow(/tolerance/);
  });

  it('rejects a signature computed with a different secret', () => {
    const body = Buffer.from('{}');
    const ts = 1_700_000_000;
    expect(() =>
      verifyInfisicalSignature({
        rawBody: body,
        header: signedHeader(body, ts, 'wrong-secret'),
        secret: SECRET,
        toleranceSeconds: 300,
        now: () => ts,
      }),
    ).toThrow(/does not match/);
  });

  it('rejects a malformed header', () => {
    expect(() =>
      verifyInfisicalSignature({
        rawBody: Buffer.from('{}'),
        header: 'gibberish',
        secret: SECRET,
        toleranceSeconds: 300,
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });
});
