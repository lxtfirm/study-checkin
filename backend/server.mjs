import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const encoded = (value, size) => typeof value === 'string' &&
  /^[\w-]+$/.test(value) && Buffer.from(value, 'base64url').length === size;
const maxAhead = 365 * 86400_000;
const staleAfter = 120_000;

function subscriptionOf(value) {
  if (typeof value?.endpoint !== 'string' || value.endpoint.length > 2048) return null;
  let url;
  try { url = new URL(value.endpoint); } catch { return null; }
  const host = url.hostname;
  const allowed = host.endsWith('.push.apple.com') ||
    (host === 'fcm.googleapis.com' && url.pathname.startsWith('/fcm/send/')) ||
    (host === 'updates.push.services.mozilla.com' && url.pathname.startsWith('/wpush/'));
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password ||
    url.search || url.hash || url.pathname.length < 2 || !encoded(value.keys?.p256dh, 65) ||
    !encoded(value.keys?.auth, 16)) return null;
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

async function bodyOf(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw 415;
  const parts = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw 413;
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts)); } catch { throw 400; }
}

export function createFocusServer({ file, origin, code, publicKey, send, now = Date.now }) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timers (
      device INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE, id TEXT NOT NULL,
      revision INTEGER NOT NULL, due INTEGER, next INTEGER, touched INTEGER NOT NULL,
      handed INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (device, id)
    );
    CREATE INDEX IF NOT EXISTS timers_next ON timers(next);
  `);
  const findTimer = db.prepare('SELECT * FROM timers WHERE device=? AND id=?');
  const enroll = db.prepare(`INSERT INTO devices(endpoint,token,subscription) VALUES(?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET token=excluded.token, subscription=excluded.subscription`);
  const saveTimer = db.prepare(`INSERT INTO timers(device,id,revision,due,next,touched) VALUES(?,?,?,?,?,?)
    ON CONFLICT(device,id) DO UPDATE SET revision=excluded.revision,due=excluded.due,next=excluded.next,
      touched=excluded.touched,handed=0,attempts=0`);
  const authenticate = db.prepare('SELECT id FROM devices WHERE token=?');
  const queue = db.prepare(`SELECT t.*,d.subscription FROM timers t JOIN devices d ON t.device=d.id
    WHERE t.next<=? ORDER BY t.next LIMIT 30`);
  const claim = db.prepare('UPDATE timers SET handed=1,next=? WHERE device=? AND id=? AND revision=?');
  const complete = db.prepare('UPDATE timers SET next=? WHERE device=? AND id=? AND revision=?');
  const retry = db.prepare('UPDATE timers SET next=?,attempts=attempts+1 WHERE device=? AND id=? AND revision=?');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id=? AND subscription=?');
  let enrollWindow = 0, failures = 0;

  const server = createServer({ requestTimeout: 10000 }, async (req, res) => {
    function reply(status, value) {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    }
    try {
      const path = req.url;
      if (path === '/api/focus/config' && req.method === 'GET') return reply(200, { publicKey });
      if (req.headers.origin !== origin) throw 403;
      if (path === '/api/focus/devices' && req.method === 'POST') {
        const at = now();
        if (at - enrollWindow >= 60000) { enrollWindow = at; failures = 0; }
        if (failures >= 10) throw 429;
        const data = await bodyOf(req);
        if (typeof data?.code !== 'string' || !same(data.code, code)) { failures++; throw 403; }
        const subscription = subscriptionOf(data.subscription);
        if (!subscription) throw 400;
        const token = randomBytes(32).toString('base64url');
        enroll.run(subscription.endpoint, digest(token), JSON.stringify(subscription));
        return reply(201, { token });
      }
      const id = path?.split('/').at(-1);
      if (req.method !== 'PUT' || !uuid.test(id || '') || path !== `/api/focus/timers/${id}`) throw 404;
      const token = /^Bearer ([\w-]{43})$/.exec(req.headers.authorization || '')?.[1];
      const device = token && authenticate.get(digest(token));
      if (!device) throw 401;
      const data = await bodyOf(req);
      const { revision, dueAt } = data || {};
      if (!Number.isSafeInteger(revision) || revision < 1 || (dueAt !== null && !Number.isSafeInteger(dueAt))) throw 400;
      const previous = findTimer.get(device.id, id);
      if (previous && revision < previous.revision) throw 409;
      if (previous?.revision === revision) {
        if ((previous.due === null) !== (dueAt === null)) throw 409;
        return reply(200, { dueAt: previous.due, alreadySent: dueAt === null && !!previous.handed });
      }
      const at = now();
      if (dueAt !== null && (dueAt <= at || dueAt > at + maxAhead)) throw 400;
      saveTimer.run(device.id, id, revision, dueAt, dueAt, at);
      const alreadySent = dueAt === null && !!previous?.handed;
      if (alreadySent) db.prepare('UPDATE timers SET handed=1 WHERE device=? AND id=?').run(device.id, id);
      return reply(200, { dueAt, alreadySent });
    } catch (error) {
      if (typeof error !== 'number') console.error('Focus API error:', error.code || error.name);
      if (!res.destroyed) reply(typeof error === 'number' ? error : 500, { error: 'request_failed' });
    }
  });

  let draining = false;
  async function deliver() {
    if (draining) return;
    draining = true;
    try {
      for (const row of queue.all(now())) {
        const args = [row.device, row.id, row.revision];
        if (now() - row.due >= staleAfter) { complete.run(null, ...args); continue; }
        if (!claim.run(now() + 15000, ...args).changes) continue;
        try {
          await send(JSON.parse(row.subscription), JSON.stringify({ type: 'focus-ended', id: row.id }));
          complete.run(null, ...args);
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410) removeDevice.run(row.device, row.subscription);
          else if (row.attempts < 2) retry.run(now() + 3000 * (row.attempts + 1), ...args);
          else {
            complete.run(null, ...args);
            console.error('Focus push delivery failed:', error.statusCode || error.code || error.name);
          }
        }
      }
      db.prepare('DELETE FROM timers WHERE touched<? AND (due IS NULL OR due<?)')
        .run(now() - 7 * 86400_000, now() - 7 * 86400_000);
    } finally { draining = false; }
  }
  return { server, deliver, closeDatabase: () => db.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { FOCUS_ORIGIN: origin, FOCUS_ENROLL_CODE: code, VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject, FOCUS_DB: file = 'focus.sqlite',
    FOCUS_PORT: port = '8787' } = process.env;
  if (!origin || !/^https:\/\/[^/]+$/.test(origin) || !code || code.length < 20 ||
    !publicKey || !privateKey || !subject) throw new Error('Missing or invalid Focus server environment.');
  const { default: webPush } = await import('web-push');
  webPush.setVapidDetails(subject, publicKey, privateKey);
  const { server, deliver } = createFocusServer({ file, origin, code, publicKey,
    send: (subscription, payload) => webPush.sendNotification(subscription, payload, {
      TTL: 30, urgency: 'high', timeout: 10000,
    }),
  });
  server.listen(Number(port), '127.0.0.1', () => console.log(`Focus API listening on 127.0.0.1:${server.address().port}`));
  setInterval(() => deliver().catch(error => console.error('Focus scheduler error:', error.code || error.name)), 500);
}
