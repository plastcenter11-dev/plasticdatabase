'use strict';

// Slows down password guessing on a server that is reachable from the internet.
//  - the same user name from the same address is locked for LOCK_MS after MAX_FAILS wrong passwords
//  - one address is limited to MAX_PER_IP sign-in attempts per WINDOW_MS, whoever it tries
// The counters live in memory: they reset when the server restarts, which is fine for this purpose.

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS) || 5;
const MAX_PER_IP = Number(process.env.LOGIN_MAX_PER_IP) || 40;

const fails = new Map();   // "ip|user" -> { count, lockedUntil, last }
const attempts = new Map(); // ip -> [timestamps]

const keyOf = (ip, username) => `${ip}|${String(username || '').toLowerCase().slice(0, 100)}`;

function prune(now) {
  for (const [k, v] of fails) if (now - v.last > WINDOW_MS && !(v.lockedUntil > now)) fails.delete(k);
  for (const [ip, list] of attempts) {
    const keep = list.filter(t => now - t < WINDOW_MS);
    if (keep.length) attempts.set(ip, keep); else attempts.delete(ip);
  }
}

// returns null when the attempt may go on, or { retryAfterSec } when it is blocked
function check(ip, username, now = Date.now()) {
  if (attempts.size > 5000 || fails.size > 5000) prune(now);
  const list = (attempts.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_IP) return { retryAfterSec: Math.ceil((WINDOW_MS - (now - list[0])) / 1000) };
  const f = fails.get(keyOf(ip, username));
  if (f && f.lockedUntil > now) return { retryAfterSec: Math.ceil((f.lockedUntil - now) / 1000) };
  list.push(now); attempts.set(ip, list);
  return null;
}

function recordFailure(ip, username, now = Date.now()) {
  const k = keyOf(ip, username);
  const f = fails.get(k) || { count: 0, lockedUntil: 0, last: now };
  if (f.lockedUntil && f.lockedUntil <= now) { f.count = 0; f.lockedUntil = 0; }
  f.count += 1; f.last = now;
  if (f.count >= MAX_FAILS) f.lockedUntil = now + LOCK_MS;
  fails.set(k, f);
}

function recordSuccess(ip, username) { fails.delete(keyOf(ip, username)); }

function reset() { fails.clear(); attempts.clear(); }

module.exports = { check, recordFailure, recordSuccess, reset, MAX_FAILS, LOCK_MS };
