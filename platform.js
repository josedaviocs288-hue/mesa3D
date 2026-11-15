import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openPlatform(dataDir) {
  fs.mkdirSync(dataDir, {recursive:true});
  const db = new DatabaseSync(path.join(dataDir, 'mesa3d.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS restaurants (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, catalog TEXT NOT NULL, mp_credentials TEXT, version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','restaurant')), restaurant_id TEXT REFERENCES restaurants(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), items TEXT NOT NULL, customer_name TEXT, table_number TEXT, notes TEXT, total_cents INTEGER NOT NULL, status TEXT NOT NULL, payment_status TEXT NOT NULL, payment_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS billing (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), amount_cents INTEGER NOT NULL, status TEXT NOT NULL, payment_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id), verifier TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_events (payment_id TEXT PRIMARY KEY, kind TEXT NOT NULL, reference_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_billing_restaurant ON billing(restaurant_id,created_at);`);
  if(!db.prepare('PRAGMA table_info(restaurants)').all().some(c=>c.name==='version'))
    db.exec('ALTER TABLE restaurants ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
  return db;
}

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('Use uma senha com pelo menos 12 caracteres.');
  const salt=crypto.randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  const [kind,salt,hash]=String(encoded||'').split(':');
  if (kind!=='scrypt' || !salt || !hash) return false;
  const actual=crypto.scryptSync(String(password||''),Buffer.from(salt,'hex'),64);
  const expected=Buffer.from(hash,'hex');
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
export const randomId=()=>crypto.randomUUID();
export const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
export function createSession(db,userId) {
  const token=crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token),userId,Date.now()+7*86400000);
  return token;
}
export function encrypt(value) {
  const key=process.env.MESA3D_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) throw new Error('Configure MESA3D_ENCRYPTION_KEY com 32 bytes hexadecimais.');
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const content=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),content]).toString('base64');
}
export function decrypt(encoded) {
  if (!encoded) return null;
  const key=process.env.MESA3D_ENCRYPTION_KEY;
  const data=Buffer.from(encoded,'base64');
  const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString());
}
