import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMBED_BASE_URL, embedUrl, signViewerToken } from '@wolvy/node';

// The examples of docs.wolvy.net (api.js: EMBED_URL and the playback-token answer; embedding page).
const VIDEO = 'a1b2c3d4e5f60718293a';
const VT = 'eyJ2aWQiOiJ1c2VyLTg4MTMiLCJleHAiOjE3OTAwMDAwMDB9.XBNWyMiuLw0y7WlQkzO5s2N-eI8Ltxhs4N0uvDHM4ZM';

describe('embedUrl', () => {
  it('builds the docs example, unsigned and signed', () => {
    assert.equal(EMBED_BASE_URL, 'https://embed.wolvy.stream');
    assert.equal(embedUrl(VIDEO, 42), 'https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=');
    assert.equal(embedUrl(VIDEO, 42, VT), `https://embed.wolvy.stream/a1b2c3d4e5f60718293a/NDI=?vt=${VT}`);
  });

  it('base64-encodes the account id as text, from a number or a digit string', () => {
    assert.equal(embedUrl('v', '42'), embedUrl('v', 42));
    assert.match(embedUrl('v', 7), /\/Nw==$/);
    assert.match(embedUrl('v', 123456), /\/MTIzNDU2$/);
  });

  it('works with a token from signViewerToken()', () => {
    const vt = signViewerToken('user-8813', 3600, 'd80d15d09b7c0e56b4d787f6a212ed8bf8d53c761b6df521278f030cb12a7781', {
      now: 1789996400,
    });
    assert.equal(embedUrl(VIDEO, 42, vt), `https://embed.wolvy.stream/${VIDEO}/NDI=?vt=${VT}`);
  });

  it('leaves the token off when it is missing or empty', () => {
    for (const vt of [undefined, null, '']) assert.equal(embedUrl(VIDEO, 42, vt), `https://embed.wolvy.stream/${VIDEO}/NDI=`);
  });

  it('URL-encodes the video id and the token', () => {
    assert.equal(embedUrl('a b/c', 42, 'x+y=z'), 'https://embed.wolvy.stream/a%20b%2Fc/NDI=?vt=x%2By%3Dz');
  });

  it('refuses ids that would build a wrong URL', () => {
    for (const account of [0, -1, 1.5, '042', 'NDI=', '', NaN, null, undefined]) {
      assert.throws(() => embedUrl(VIDEO, account), TypeError, String(account));
    }
    assert.throws(() => embedUrl('', 42), TypeError);
    assert.throws(() => embedUrl(undefined, 42), TypeError);
    assert.throws(() => embedUrl(VIDEO, 42, 123), TypeError);
  });
});
