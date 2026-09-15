import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeText } from '../dist/index.js';
import { encodeBase2300Advanced } from '../dist/experimental.js';
import { createDemoServer } from '../scripts/serve-demo.mjs';

// Execute the actual Worker module with its message endpoint simulated in Node.
// This checks the worker protocol and codecs, not browser rendering or worker isolation.
const endpoint = { postMessage() {} };
globalThis.self = endpoint;
await import('../demo/worker.js');
async function request(action, profile, input) {
  const messages = [];
  endpoint.postMessage = message => messages.push(message);
  await endpoint.onmessage({ data: { action, profile, input } });
  assert.equal(messages.length, 1);
  return messages[0];
}

test('demo Worker preserves BOM, CRLF, NUL, combining characters and supplementary scalars', async () => {
  for (const profile of ['checked', 'experimental']) {
    for (const input of ['', '\ufeff日本語\r\n\0e\u0301𠮟😀', '同じ情報を少ない文字で。'.repeat(30)]) {
      const encoded = await request('encode', profile, input);
      assert.equal(encoded.error, undefined);
      assert.match(encoded.note, /原バイトとの一致を確認/);
      assert.equal(encoded.rows.length, 3);
      assert.equal(encoded.rows[0].codePoints, [...input].length);
      const restored = await request('decode', profile, encoded.output);
      assert.equal(restored.error, undefined);
      assert.equal(restored.output, input);
    }
  }
});

test('demo Worker accepts 64 KiB text and its expanded wire, and bounds both directions', async () => {
  const input = 'a'.repeat(64 * 1024);
  const encoded = await request('encode', 'checked', input);
  assert.equal(encoded.error, undefined);
  assert.ok(new TextEncoder().encode(encoded.output).length > 64 * 1024);
  assert.equal((await request('decode', 'checked', encoded.output)).output, input);
  assert.match((await request('encode', 'checked', input + 'a')).error, /64 KiB/);
  assert.match((await request('encode', 'checked', '東'.repeat(21846))).error, /64 KiB/);
  const largerWire = encodeBase2300Advanced(new TextEncoder().encode(input + 'a'), 'fast').text;
  assert.match((await request('decode', 'experimental', largerWire)).error, /復元結果上限は64 KiB/);
});

test('demo Worker returns errors without pretending malformed text round-tripped', async () => {
  for (const [action, profile, input] of [
    ['encode', 'checked', '\ud800'], ['decode', 'checked', 'invalid'],
    ['decode', 'checked', encodeText('abc') + '\n'], ['unknown', 'checked', 'abc'],
    ['encode', 'unknown', 'abc'], ['encode', 'checked', 123],
  ]) {
    const result = await request(action, profile, input);
    assert.equal(typeof result.error, 'string');
    assert.equal(result.output, undefined);
  }
});

// Invoke the real HTTP request handler without opening a socket.
function serverRequest(server, url, method = 'GET') {
  return new Promise(resolve => {
    const response = {
      status: null, headers: {},
      writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, headers: this.headers, body }); },
    };
    server.emit('request', { url, method }, response);
  });
}

test('demo server handler serves local assets and rejects unrelated paths without a network listener', async () => {
  const server = createDemoServer();
  assert.equal((await serverRequest(server, '/')).headers.Location, '/demo/');
  const page = await serverRequest(server, '/demo/');
  assert.equal(page.status, 200);
  assert.match(page.headers['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(page.body.toString(), /元テキスト／復元結果上限 64 KiB/);
  const script = await serverRequest(server, '/dist/index.js', 'HEAD');
  assert.equal(script.status, 200);
  assert.equal(script.body, undefined);
  for (const url of ['/package.json', '/src/index.ts', '/demo/%2e%2e/package.json', '/demo/%2e%2e%2fpackage.json', '/demo/%00.js']) {
    assert.equal((await serverRequest(server, url)).status, 404);
  }
  assert.equal((await serverRequest(server, '/demo/', 'POST')).status, 405);
});
