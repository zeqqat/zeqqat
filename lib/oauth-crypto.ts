import { createHash, randomBytes } from "crypto";

// Random URL-safe token, used for client_id, raw authorization codes, and
// raw access/refresh tokens (the DB stores only the hash — spec section 7:
// "Store hashes, never the value. Tokens are shown once.").
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// PKCE S256: base64url(sha256(code_verifier)) === code_challenge.
export function pkceS256(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
