import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFocusServer } from './server.mjs';

test('focus jobs survive restart; pause and finish revoke delivery; resume replaces deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'study-push-'));
  const file = join(directory, 'test.sqlite');
  const origin = 'https://study.example.com';
  const code = 'temporary-test-enrollment-code';
  const id = randomUUID();
  const canceledId = randomUUID();
  let time = Date.now();
  const sent = [];
  const options = { file, origin, code, publicKey: 'test-key', now: () => time,
    send: async (_, payload) => sent.push(JSON.parse(payload)) };
  let instance, url;
  async function start() {
    instance = createFocusServer(options);
    await new Promise(resolve => instance.server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${instance.server.address().port}/api/focus`;
  }
  async function stop() {
    await new Promise((resolve, reject) => instance.server.close(error => error ? reject(error) : resolve()));
    instance.closeDatabase();
    instance = null;
  }
  await start();
  try {
    const sub = { endpoint: 'https://web.push.apple.com/test', keys: {
      p256dh: Buffer.alloc(65, 1).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url'),
    } };
    const request = (path, method, data, headers = {}) => fetch(url + path, { method,
      headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(data),
    });
    assert.equal((await request('/devices', 'POST', { code: 'wrong', subscription: sub })).status, 403);
    assert.equal((await request('/devices', 'POST', { code, subscription: { ...sub, endpoint: 'https://127.0.0.1/push' } })).status, 400);
    const enrolled = await request('/devices', 'POST', { code, subscription: sub });
    assert.equal(enrolled.status, 201);
    const { token } = await enrolled.json();
    const update = (timer, revision, dueAt) => request(`/timers/${timer}`, 'PUT', { revision, dueAt },
      { authorization: `Bearer ${token}` });
    assert.equal((await request(`/timers/${id}`, 'PUT', { revision: 1, dueAt: time + 1000 })).status, 401);
    assert.equal((await update(id, 1, time + 1000)).status, 200);
    assert.deepEqual(await (await update(id, 2, null)).json(), { dueAt: null, alreadySent: false });
    assert.equal((await update(id, 1, time + 1000)).status, 409);
    time += 1100;
    await instance.deliver();
    assert.deepEqual(sent, []);
    const deadline = time + 1000;
    assert.equal((await (await update(id, 3, deadline)).json()).dueAt, deadline);
    assert.equal((await (await update(id, 3, deadline + 500)).json()).dueAt, deadline);
    await update(canceledId, 1, deadline);
    await update(canceledId, 2, null);
    await stop();
    await start();
    await instance.deliver();
    assert.deepEqual(sent, []);
    time = deadline;
    await instance.deliver();
    await instance.deliver();
    assert.deepEqual(sent, [{ type: 'focus-ended', id }]);
    assert.deepEqual(await (await update(id, 4, null)).json(), { dueAt: null, alreadySent: true });
  } finally {
    if (instance) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
