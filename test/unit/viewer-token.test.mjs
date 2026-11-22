import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { signViewerToken, viewerTokenVideo, VIEWER_TOKEN_MAX_TTL, VIEWER_TOKEN_MIN_TTL } from '@wolvy/node';

// The published vector of docs.wolvy.net/viewer-tokens/#test-vectors.
const DOCS = {
  secret: 'd80d15d09b7c0e56b4d787f6a212ed8bf8d53c761b6df521278f030cb12a7781',
  viewerId: 'user-8813',
  video: 'a1b2c3d4e5f60718293a',
  exp: 1790000000,
  payload: 'eyJ2aWQiOiJ1c2VyLTg4MTMiLCJleHAiOjE3OTAwMDAwMDAsInZpZGVvIjoiYTFiMmMzZDRlNWY2MDcxODI5M2EifQ',
  vt: 'eyJ2aWQiOiJ1c2VyLTg4MTMiLCJleHAiOjE3OTAwMDAwMDAsInZpZGVvIjoiYTFiMmMzZDRlNWY2MDcxODI5M2EifQ.KPYNjR-agijPtfv9s1VbBOSs_QJmi3NMlQ7tsUXCY9M',
};
// The 1.x vector: the same token without a video, which Wolvy refuses since 2026-11-22.
const UNBOUND = 'eyJ2aWQiOiJ1c2VyLTg4MTMiLCJleHAiOjE3OTAwMDAwMDB9.XBNWyMiuLw0y7WlQkzO5s2N-eI8Ltxhs4N0uvDHM4ZM';
const V = { video: 'vidA1' };

// Made by Wolvy-APIs' own Validate::string + Wire\ViewerToken::mint with time() pinned
// (test/fixtures/viewer-token-vectors.php); covers PHP json_encode's escaping and trim.
const PHP_VECTORS = JSON.parse(readFileSync(new URL('../fixtures/viewer-token-vectors.json', import.meta.url), 'utf8'));

const decode = (vt) => JSON.parse(Buffer.from(vt.split('.')[0], 'base64url').toString('utf8'));

describe('signViewerToken', () => {
  it('reproduces the docs test vector byte for byte', () => {
    const vt = signViewerToken(DOCS.viewerId, 3600, DOCS.secret, { now: DOCS.exp - 3600, video: DOCS.video });
    assert.equal(vt, DOCS.vt);
    assert.equal(vt.split('.')[0], DOCS.payload);
  });

  it('accepts `now` as a Date', () => {
    const vt = signViewerToken(DOCS.viewerId, 60, DOCS.secret, { now: new Date((DOCS.exp - 60) * 1000 + 999), video: DOCS.video });
    assert.equal(vt, DOCS.vt);
  });

  it('matches the API for every PHP-made vector (escaping, unicode, trimming)', () => {
    assert.ok(PHP_VECTORS.length >= 10);
    for (const v of PHP_VECTORS) {
      const vt = signViewerToken(v.viewer_id, v.ttl, v.secret, { now: v.now, video: v.video });
      assert.equal(vt, v.vt, `viewer id ${JSON.stringify(v.viewer_id)}`);
    }
  });

  it('signs the base64url payload, not the JSON, with the secret as text', () => {
    const vt = signViewerToken('user-1', 600, 'abcd', { now: 1000, video: 'vidA1' });
    const [payload, sig] = vt.split('.');
    assert.equal(sig, createHmac('sha256', 'abcd').update(payload).digest('base64url'));
    assert.deepEqual(decode(vt), { vid: 'user-1', exp: 1600, video: 'vidA1' });
    assert.doesNotMatch(vt, /[+/=]/);
  });

  it('uses the current time by default', () => {
    const before = Math.floor(Date.now() / 1000);
    const { exp } = decode(signViewerToken('user-1', 3600, 's', V));
    const after = Math.floor(Date.now() / 1000);
    assert.ok(exp >= before + 3600 && exp <= after + 3600);
  });

  it('writes vid, exp and video, compact, slashes and non-ASCII escaped like PHP', () => {
    const vt = signViewerToken('élève/1', 60, 's', { now: 0, video: 'vidA1' });
    assert.equal(Buffer.from(vt.split('.')[0], 'base64url').toString(), '{"vid":"\\u00e9l\\u00e8ve\\/1","exp":60,"video":"vidA1"}');
  });

  it('trims what PHP trim() removes and nothing else', () => {
    assert.equal(decode(signViewerToken(' \t\n user-1 \r\0\x0B', 60, 's', { now: 0, video: 'vidA1' })).vid, 'user-1');
    assert.equal(decode(signViewerToken(' user-1 ', 60, 's', { now: 0, video: 'vidA1' })).vid, ' user-1 ');
  });

  it('enforces the API lifetime limits, 60 to 86400 seconds', () => {
    assert.equal(VIEWER_TOKEN_MIN_TTL, 60);
    assert.equal(VIEWER_TOKEN_MAX_TTL, 86400);
    assert.ok(signViewerToken('v', 60, 's', V));
    assert.ok(signViewerToken('v', 86400, 's', V));
    for (const ttl of [59, 86401, 0, -60, 3600.5, Number.NaN, Infinity, '3600', null, undefined]) {
      assert.throws(() => signViewerToken('v', ttl, 's', V), RangeError, `ttl ${ttl}`);
    }
  });

  it('enforces 1 to 64 UTF-8 bytes after trimming, like the API', () => {
    assert.ok(signViewerToken('x'.repeat(64), 60, 's', V));
    assert.ok(signViewerToken('é'.repeat(32), 60, 's', V));
    assert.throws(() => signViewerToken('x'.repeat(65), 60, 's', V), RangeError);
    assert.throws(() => signViewerToken('é'.repeat(33), 60, 's', V), RangeError);
    assert.throws(() => signViewerToken('', 60, 's', V), RangeError);
    assert.throws(() => signViewerToken('  \t ', 60, 's', V), RangeError);
    assert.throws(() => signViewerToken('bad\ud800', 60, 's', V), RangeError);
    assert.throws(() => signViewerToken(42, 60, 's', V), TypeError);
  });

  it('needs a secret and a valid `now`', () => {
    assert.throws(() => signViewerToken('v', 60, '', V), TypeError);
    assert.throws(() => signViewerToken('v', 60, undefined, V), TypeError);
    assert.throws(() => signViewerToken('v', 60, 's', { now: 1.5, video: 'vidA1' }), TypeError);
    assert.throws(() => signViewerToken('v', 60, 's', { now: new Date('nope'), video: 'vidA1' }), TypeError);
  });
});

describe('the video is required (since 2.0.0)', () => {
  it('puts the video claim after exp, byte-identical to the API', () => {
    assert.deepEqual(Object.keys(decode(DOCS.vt)), ['vid', 'exp', 'video']);
  });

  it('throws a TypeError for a 1.x call without a video, instead of a token Wolvy refuses', () => {
    assert.throws(() => signViewerToken(DOCS.viewerId, 3600, DOCS.secret), TypeError);
    assert.throws(() => signViewerToken(DOCS.viewerId, 3600, DOCS.secret, { now: DOCS.exp - 3600 }), TypeError);
    assert.throws(() => signViewerToken(DOCS.viewerId, 3600, DOCS.secret, { video: null }), TypeError);
  });

  it('refuses something that is not a video id', () => {
    assert.throws(() => signViewerToken('u', 3600, DOCS.secret, { video: 'not a video!' }), RangeError);
    assert.throws(() => signViewerToken('u', 3600, DOCS.secret, { video: '' }), RangeError);
    assert.throws(() => signViewerToken('u', 3600, DOCS.secret, { video: 'x'.repeat(65) }), RangeError);
    assert.throws(() => signViewerToken('u', 3600, DOCS.secret, { video: 42 }), RangeError);
  });

  it('viewerTokenVideo() reads the video without the secret', () => {
    assert.equal(viewerTokenVideo(DOCS.vt), DOCS.video);
    assert.equal(viewerTokenVideo(UNBOUND), null);
    assert.equal(viewerTokenVideo('not a token'), null);
    assert.equal(viewerTokenVideo('a.b'), null);
  });
});
