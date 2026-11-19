import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verifyWebhook, WolvyError, WolvySignatureVerificationError } from '@wolvy/node';

// The test vector of docs.wolvy.net/webhooks/#verify.
const SECRET = 'whsec_56b87e856166601d9414d8e3b96f78fe26cbda605a38676a';
const T = 1790000000;
const BODY =
  '{"id":"evt_3f9a1c07b2e84d5a6c10","type":"video.ready","created_at":"2026-09-21T14:13:10+00:00",' +
  '"data":{"id":"a1b2c3d4e5f60718293a","object":"video","status":"ready"}}';
const V1 = 'e43bfc1bae59608bba1a11c2eef01cde3b04a7794673edf8365eafd94cd8e2aa';
const HEADER = `t=${T},v1=${V1}`;
const NOW = { now: 1790000100 };

const sign = (body, t, secret = SECRET) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

function rejects(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof WolvySignatureVerificationError, `expected a signature error, got ${error}`);
    assert.ok(error instanceof WolvyError);
    assert.equal(error.code, code);
    assert.equal(error.status, null);
    return true;
  });
}

describe('verifyWebhook', () => {
  it('accepts the docs test vector and returns the typed event', () => {
    const event = verifyWebhook(BODY, HEADER, SECRET, 300, NOW);
    assert.equal(event.type, 'video.ready');
    assert.equal(event.id, 'evt_3f9a1c07b2e84d5a6c10');
    assert.deepEqual(event.data, { id: 'a1b2c3d4e5f60718293a', object: 'video', status: 'ready' });
  });

  it('takes the body as a Buffer, a Uint8Array or a string', () => {
    assert.equal(verifyWebhook(Buffer.from(BODY), HEADER, SECRET, 300, NOW).type, 'video.ready');
    assert.equal(verifyWebhook(new TextEncoder().encode(BODY), HEADER, SECRET, 300, NOW).type, 'video.ready');
    const padded = Buffer.from(`xx${BODY}yy`);
    assert.equal(verifyWebhook(padded.subarray(2, padded.length - 2), HEADER, SECRET, 300, NOW).id, 'evt_3f9a1c07b2e84d5a6c10');
  });

  it('refuses a parsed object with a hint about the raw body', () => {
    assert.throws(() => verifyWebhook(JSON.parse(BODY), HEADER, SECRET, 300, NOW), /raw request body/);
  });

  it('detects a tampered body, timestamp or signature, and a wrong secret', () => {
    rejects(() => verifyWebhook(BODY.replace('"ready"}}', '"failed"}}'), HEADER, SECRET, 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(`${BODY} `, HEADER, SECRET, 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(BODY, `t=${T + 1},v1=${V1}`, SECRET, 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(BODY, `t=${T},v1=${V1.replace(/^e/, 'f')}`, SECRET, 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(BODY, HEADER, `${SECRET}x`, 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(BODY, HEADER, SECRET.slice('whsec_'.length), 300, NOW), 'signature_mismatch');
    rejects(() => verifyWebhook(BODY, `t=${T},v1=${V1.slice(0, 63)}`, SECRET, 300, NOW), 'signature_mismatch');
  });

  it('enforces the tolerance in both directions (default 300 s)', () => {
    assert.ok(verifyWebhook(BODY, HEADER, SECRET, undefined, { now: T + 300 }));
    assert.ok(verifyWebhook(BODY, HEADER, SECRET, undefined, { now: T - 300 }));
    rejects(() => verifyWebhook(BODY, HEADER, SECRET, undefined, { now: T + 301 }), 'timestamp_outside_tolerance');
    rejects(() => verifyWebhook(BODY, HEADER, SECRET, undefined, { now: T - 301 }), 'timestamp_outside_tolerance');
    rejects(() => verifyWebhook(BODY, HEADER, SECRET, 30, { now: T + 31 }), 'timestamp_outside_tolerance');
    assert.ok(verifyWebhook(BODY, HEADER, SECRET, Infinity, { now: T + 10 ** 7 }));
    assert.throws(() => verifyWebhook(BODY, HEADER, SECRET, -1, NOW), RangeError);
  });

  it('uses the real clock by default, so the 2026 vector is stale today or later', () => {
    const t = Math.floor(Date.now() / 1000);
    assert.ok(verifyWebhook(BODY, `t=${t},v1=${sign(BODY, t)}`, SECRET));
    rejects(() => verifyWebhook(BODY, `t=${t - 1000},v1=${sign(BODY, t - 1000)}`, SECRET), 'timestamp_outside_tolerance');
  });

  it('checks the signature before the time, so a forged old delivery reads as forged', () => {
    rejects(() => verifyWebhook(BODY, `t=1,v1=${V1}`, SECRET, 300, NOW), 'signature_mismatch');
  });

  it('parses the header leniently: spaces, order, repeated v1, upper-case hex, an Express array', () => {
    assert.ok(verifyWebhook(BODY, ` v1=${V1} , t=${T} `, SECRET, 300, NOW));
    assert.ok(verifyWebhook(BODY, `t=${T},v1=${'0'.repeat(64)},v1=${V1}`, SECRET, 300, NOW));
    assert.ok(verifyWebhook(BODY, `t=${T},v1=${V1.toUpperCase()}`, SECRET, 300, NOW));
    assert.ok(verifyWebhook(BODY, [`t=${T}`, `v1=${V1}`], SECRET, 300, NOW));
    assert.ok(verifyWebhook(BODY, `t=${T},v0=junk,v1=${V1}`, SECRET, 300, NOW));
  });

  it('refuses a missing or malformed header', () => {
    rejects(() => verifyWebhook(BODY, undefined, SECRET, 300, NOW), 'missing_signature_header');
    rejects(() => verifyWebhook(BODY, '', SECRET, 300, NOW), 'missing_signature_header');
    rejects(() => verifyWebhook(BODY, `v1=${V1}`, SECRET, 300, NOW), 'invalid_signature_header');
    rejects(() => verifyWebhook(BODY, `t=${T}`, SECRET, 300, NOW), 'invalid_signature_header');
    rejects(() => verifyWebhook(BODY, `t=abc,v1=${V1}`, SECRET, 300, NOW), 'invalid_signature_header');
    rejects(() => verifyWebhook(BODY, `t=-5,v1=${V1}`, SECRET, 300, NOW), 'invalid_signature_header');
    rejects(() => verifyWebhook(BODY, 'garbage', SECRET, 300, NOW), 'invalid_signature_header');
  });

  it('refuses a correctly signed body that is not a Wolvy event', () => {
    rejects(() => verifyWebhook('not json', `t=${T},v1=${sign('not json', T)}`, SECRET, 300, NOW), 'invalid_payload');
    rejects(() => verifyWebhook('[1]', `t=${T},v1=${sign('[1]', T)}`, SECRET, 300, NOW), 'invalid_payload');
  });

  it('verifies the exact bytes, including escaped slashes and unicode as PHP sends them', () => {
    const body = '{"id":"evt_00000000000000000001","type":"video.failed","created_at":"2026-11-19T10:00:00+00:00",' +
      '"data":{"id":"a1","object":"video","status":"failed","error":"source returned HTTP 404 for https:\\/\\/x.example\\/\\u00e9"}}';
    const event = verifyWebhook(body, `t=${T},v1=${sign(body, T)}`, SECRET, 300, NOW);
    assert.equal(event.type, 'video.failed');
    assert.equal(event.data.error, 'source returned HTTP 404 for https://x.example/é');
  });

  it('needs a secret', () => {
    assert.throws(() => verifyWebhook(BODY, HEADER, '', 300, NOW), TypeError);
  });
});
