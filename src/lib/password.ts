import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const run = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await run(pw, salt)).toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [s, k] = stored.split(":"); if (!s || !k) return false;
  const a = await run(pw, Buffer.from(s, "hex")); const b = Buffer.from(k, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
