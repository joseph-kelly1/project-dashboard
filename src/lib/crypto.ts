import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function key(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

// Payload layout: base64( iv[12] | authTag[16] | ciphertext )
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([
    decipher.update(buf.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}

export function keyHint(secretKey: string): string {
  const prefix = secretKey.slice(0, secretKey.indexOf("_", 3) + 1) || "sk_";
  return `${prefix}…${secretKey.slice(-4)}`;
}
