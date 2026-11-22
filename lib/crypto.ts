import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key(b64 = process.env.ZEQQAT_ENCRYPTION_KEY): Buffer {
  if (!b64) throw new Error("ZEQQAT_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) throw new Error("ZEQQAT_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
}

export type EncryptedCredential = { ciphertext: string; iv: string; tag: string };

// AES-256-GCM. instance.credential is the only place a real secret is ever
// stored — never returned by any read path, per spec sections 6 and 9.
// withKey: another install's ZEQQAT_ENCRYPTION_KEY, for the self-host seed
// (lib/selfhost-seed.ts), which only that install can read.
export function encryptCredential(plaintext: string, withKey?: string): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(withKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential(enc: EncryptedCredential): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
