// Real deliveries: the API's own workers sign and send them, verifyWebhook() checks them.
//
// The Developer API only delivers to public https URLs (port 443/8443, public DNS), so the
// endpoint is registered as https://<WOLVY_IT_WEBHOOK_HOST>/… and its delivery worker runs with
// https_proxy pointing at this process: a CONNECT proxy that hands the tunnel to a local TLS
// server holding a certificate for that host (signed by a test CA the worker is told to trust).
// The worker code is unchanged; only its network path is redirected.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { verifyWebhook, Wolvy, WolvySignatureVerificationError } from '@wolvy/node';
import { IT, SKIP_POLLER, SKIP_WEBHOOKS } from './env.mjs';

const run = promisify(execFile);
const wolvy = IT && new Wolvy({ apiKey: IT.apiKey, baseUrl: IT.baseUrl });

/** Deliveries received by the local receiver: { method, path, headers, body (Buffer) }. */
const received = [];
const tunnels = [];
let proxy;

async function startReceiver() {
  const tls = https.createServer({ cert: readFileSync(IT.tlsCert), key: readFileSync(IT.tlsKey) }, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    });
  });
  proxy = http.createServer((req, res) => res.writeHead(405).end());
  proxy.on('connect', (req, socket, head) => {
    tunnels.push(req.url);
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) socket.unshift(head);
    tls.emit('connection', socket);
  });
  await new Promise((resolve, reject) => proxy.once('error', reject).listen(IT.proxyPort, '127.0.0.1', resolve));
}

async function runWorker(cmd) {
  const proxyUrl = `http://127.0.0.1:${IT.proxyPort}`;
  const env = { ...process.env, https_proxy: proxyUrl, HTTPS_PROXY: proxyUrl, no_proxy: '', NO_PROXY: '' };
  return run(cmd, [], { env, timeout: 60_000 });
}

async function sql(statement) {
  await run(IT.sqlCmd, [statement], { timeout: 30_000 });
}

describe('webhook deliveries (local copy)', { skip: SKIP_WEBHOOKS }, () => {
  before(startReceiver);
  after(() => proxy?.close());

  it('a test delivery from POST /v1/webhook-endpoints/{id}/test verifies with verifyWebhook()', { timeout: 90_000 }, async () => {
    const endpoint = await wolvy.webhookEndpoints.create({
      url: `https://${IT.webhookHost}/hooks/wolvy-sdk-node`,
      events: ['video.ready'],
    });
    try {
      const queued = await wolvy.webhookEndpoints.sendTest(endpoint.id);
      assert.deepEqual(queued, { object: 'webhook_delivery', id: queued.id, event_type: 'webhook.test', endpoint_id: endpoint.id, status: 'pending' });

      const before = received.length;
      await runWorker(IT.dispatchCmd);
      const mine = received.slice(before).filter((d) => d.headers['wolvy-delivery-id'] === String(queued.id));
      assert.equal(mine.length, 1, `delivered once through ${tunnels.join(', ')}`);
      const delivery = mine[0];

      assert.equal(delivery.method, 'POST');
      assert.equal(delivery.path, '/hooks/wolvy-sdk-node');
      assert.equal(delivery.headers['content-type'], 'application/json');
      assert.equal(delivery.headers['user-agent'], 'Wolvy-Webhooks/1.0');
      assert.equal(delivery.headers['wolvy-event-type'], 'webhook.test');
      assert.match(delivery.headers['wolvy-signature'], /^t=\d+,v1=[0-9a-f]{64}$/);

      const event = verifyWebhook(delivery.body, delivery.headers['wolvy-signature'], endpoint.secret);
      assert.equal(event.type, 'webhook.test');
      assert.match(event.id, /^evt_[0-9a-f]{20}$/);
      assert.deepEqual(event.data, {
        object: 'test',
        message: 'If you can verify this signature, your endpoint is configured correctly.',
      });
      assert.ok(Math.abs(Date.parse(event.created_at) / 1000 - Date.now() / 1000) < 300);

      // The same delivery, altered or checked with another secret, is refused.
      const tampered = Buffer.from(delivery.body.toString().replace('"test"', '"tset"'));
      assert.throws(() => verifyWebhook(tampered, delivery.headers['wolvy-signature'], endpoint.secret), (e) => e instanceof WolvySignatureVerificationError && e.code === 'signature_mismatch');
      assert.throws(() => verifyWebhook(delivery.body, delivery.headers['wolvy-signature'], 'whsec_' + '0'.repeat(48)), (e) => e.code === 'signature_mismatch');
      assert.throws(() => verifyWebhook(JSON.stringify(JSON.parse(delivery.body.toString()), null, 2), delivery.headers['wolvy-signature'], endpoint.secret), (e) => e.code === 'signature_mismatch');
      const t = Number(/t=(\d+)/.exec(delivery.headers['wolvy-signature'])[1]);
      assert.throws(() => verifyWebhook(delivery.body, delivery.headers['wolvy-signature'], endpoint.secret, 300, { now: t + 301 }), (e) => e.code === 'timestamp_outside_tolerance');

      const [row] = await wolvy.webhookDeliveries.list({ endpoint_id: endpoint.id }).toArray();
      assert.equal(row.id, queued.id);
      assert.equal(row.status, 'delivered');
      assert.equal(row.response_code, 200);
      assert.equal(row.attempt, 1);
    } finally {
      await wolvy.webhookEndpoints.delete(endpoint.id);
    }
  });

  it('security.event and usage.threshold_reached from the event poller arrive as typed events', { skip: SKIP_POLLER, timeout: 90_000 }, async () => {
    const endpoint = await wolvy.webhookEndpoints.create({
      url: `https://${IT.webhookHost}/hooks/wolvy-sdk-node-events`,
      events: ['security.event', 'usage.threshold_reached'],
    });
    const usage = await wolvy.usage.retrieve();
    try {
      // What the origin would write: a security event of this account, and storage at 85 %.
      await sql(
        `INSERT INTO security_events (event_type, severity, user_id, video_id, viewer_id, viewer_verified, source, ip, country)
         VALUES ('drm_device_revoked', 'critical', ${IT.accountId}, 'a1b2c3d4e5f60718293a', 'user-8813', 1, 'web', '203.0.113.24', 'EG')`,
      );
      const available = Math.floor(usage.storage.limit_bytes * 0.15);
      await sql(`UPDATE user_plans SET available_storage = ${available} WHERE user_id = ${IT.accountId} AND is_active = 1`);

      const before = received.length;
      await runWorker(IT.pollerCmd);
      await runWorker(IT.dispatchCmd);
      const events = received
        .slice(before)
        .filter((d) => d.path === '/hooks/wolvy-sdk-node-events')
        .map((d) => verifyWebhook(d.body, d.headers['wolvy-signature'], endpoint.secret));

      const security = events.filter((e) => e.type === 'security.event');
      assert.equal(security.length, 1);
      assert.deepEqual(Object.keys(security[0].data).sort(), ['event_type', 'id', 'object', 'severity', 'video_id', 'viewer_id']);
      assert.equal(security[0].data.object, 'security_event');
      assert.equal(security[0].data.event_type, 'drm_device_revoked');
      assert.equal(security[0].data.severity, 'critical');
      assert.equal(security[0].data.viewer_id, 'user-8813');

      const thresholds = events.filter((e) => e.type === 'usage.threshold_reached');
      assert.equal(thresholds.length, 1, 'storage crossed 80 % (not 100 %); bandwidth crossed nothing');
      const data = thresholds[0].data;
      assert.equal(data.object, 'usage_threshold');
      assert.equal(data.metric, 'storage');
      assert.equal(data.threshold_percent, 80);
      assert.equal(data.limit_bytes, usage.storage.limit_bytes);
      assert.equal(data.available_bytes, available);
      assert.equal(data.used_bytes, usage.storage.limit_bytes - available);
      assert.equal(data.used_percent, 85);
      assert.equal(typeof data.period.start, 'string');
    } finally {
      await sql(`UPDATE user_plans SET available_storage = ${usage.storage.available_bytes} WHERE user_id = ${IT.accountId} AND is_active = 1`);
      // The poller remembers a threshold it announced for the whole billing period; forget it so the
      // suite can run again.
      await sql(`DELETE FROM api_event_cursors WHERE source LIKE 'usage:${IT.accountId}:%'`);
      await wolvy.webhookEndpoints.delete(endpoint.id);
    }
  });
});
