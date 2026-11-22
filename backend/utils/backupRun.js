'use strict';

// Helpers of the daily backup script (scripts/backup.js), kept apart so they can be tested.
//
// Why: the nightly task is made up for when the computer was off (StartWhenAvailable), so it often runs the
// moment Windows has started, while MySQL is still getting ready. mysqldump then fails on its first try with
// "2026: SSL connection error" and, with no retry, a whole day went without a backup.

const isLocalHost = (host) => ['', 'localhost', '127.0.0.1', '::1'].includes(String(host || '').trim().toLowerCase());

// mysqldump arguments. On the same machine the connection never leaves it, so TLS adds nothing but a way
// to fail; a database on another machine keeps the default (TLS when the server offers it).
function dumpArgs({ host, user, password, database }) {
  return [
    `--host=${host}`, `--user=${user}`, `--password=${password}`,
    ...(isLocalHost(host) ? ['--ssl-mode=DISABLED'] : []),
    '--single-transaction', '--routines', '--triggers', database,
  ];
}

// the real wait between two attempts (the script is synchronous: spawnSync)
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Runs `attempt()` (returns { status, stderr, error }) until it succeeds, at most `attempts` times with `waitMs`
// between. Returns the successful result, or throws the last failure.
function withRetry(attempt, { attempts = 6, waitMs = 20000, sleep = sleepSync, log = () => {} } = {}) {
  let last;
  for (let n = 1; n <= attempts; n++) {
    last = attempt();
    if (!last.error && last.status === 0) return last;
    const why = last.error ? last.error.message : `code ${last.status}: ${String(last.stderr || '').trim().split('\n').pop()}`;
    log(`attempt ${n}/${attempts} failed (${why})`);
    if (n < attempts) sleep(waitMs);
  }
  if (last.error) throw last.error;
  throw new Error(`mysqldump exited with code ${last.status}: ${last.stderr}`);
}

module.exports = { isLocalHost, dumpArgs, withRetry };
