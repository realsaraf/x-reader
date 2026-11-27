function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** On some system webviews, custom app URLs have limited Web Crypto support. */
export async function fingerprint(file: Blob) {
  const bytes = await file.arrayBuffer();
  if (crypto.subtle) return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return hex(sha256(new Uint8Array(bytes)));
}

export function annotationId() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}
