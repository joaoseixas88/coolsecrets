export async function readStdin(
  stream: NodeJS.ReadableStream = process.stdin,
): Promise<string | null> {
  if ('isTTY' in stream && stream.isTTY) {
    return null;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const input = Buffer.concat(chunks).toString('utf8').trim();

  return input.length > 0 ? input : null;
}
