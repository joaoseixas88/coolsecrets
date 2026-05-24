import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWebhookSignatureError';
  }
}

interface ParsedSignature {
  timestamp: number;
  signature: string;
}

function parseSignatureHeader(header: string): ParsedSignature {
  let timestampRaw: string | undefined;
  let signature: string | undefined;

  for (const segment of header.split(';').map((s) => s.trim())) {
    if (!segment) continue;
    if (segment.startsWith('t=')) {
      timestampRaw = segment.slice(2);
      continue;
    }
    if (segment.startsWith('v1=')) {
      signature ??= segment.slice(3);
      continue;
    }
    signature ??= segment;
  }

  if (!timestampRaw || !signature) {
    throw new InvalidWebhookSignatureError('Signature header is missing `t` or signature component.');
  }

  const timestamp = Number.parseInt(timestampRaw, 10);
  if (!Number.isFinite(timestamp)) {
    throw new InvalidWebhookSignatureError('Signature timestamp is not a valid integer.');
  }

  return { timestamp, signature };
}

function fromHex(hex: string): Buffer | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    return null;
  }
  return Buffer.from(hex, 'hex');
}

function timestampToSeconds(timestamp: number): number {
  return timestamp >= 1e12 ? Math.floor(timestamp / 1000) : timestamp;
}

export interface VerifyInfisicalSignatureOptions {
  rawBody: Buffer;
  header: string | undefined;
  secret: string;
  toleranceSeconds: number;
  now?: () => number;
}

export function verifyInfisicalSignature(options: VerifyInfisicalSignatureOptions): void {
  const { rawBody, header, secret, toleranceSeconds } = options;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  if (!header) {
    throw new InvalidWebhookSignatureError('Missing x-infisical-signature header.');
  }

  const { timestamp, signature } = parseSignatureHeader(header);
  const timestampSeconds = timestampToSeconds(timestamp);

  const skewSeconds = Math.abs(now() - timestampSeconds);
  if (skewSeconds > toleranceSeconds) {
    throw new InvalidWebhookSignatureError(
      `Webhook timestamp is outside tolerance (${skewSeconds}s > ${toleranceSeconds}s).`,
    );
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest();

  const provided = fromHex(signature);
  if (!provided || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new InvalidWebhookSignatureError('Signature does not match payload.');
  }
}
