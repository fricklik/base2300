import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/base2300.mjs', import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, timeout: 30000 });

test('CLI round-trips binary and text without adding or trimming newlines', () => {
  for (const flags of [[], ['--experimental'], ['--native']]) {
    for (const input of [Buffer.from([0, 128, 255, 10, 13]), Buffer.from('\ufeff日本語 e\u0301 👩‍💻\0\r\n')]) {
      const encoded = run(['encode', ...flags], input);
      assert.equal(encoded.status, 0, encoded.stderr.toString());
      assert.equal(encoded.stdout.at(-1) === 10, false);
      const decoded = run(['decode', ...flags], encoded.stdout);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      assert.deepEqual(decoded.stdout, input);
    }
  }
});

test('CLI separates errors from stdout, rejects invalid UTF-8 wire and has help/version', () => {
  for (const [args, input] of [[['decode'], Buffer.from([255])], [['decode'], 'ア憶隅債\n'], [['encode', '--unknown'], 'abc'], [[], '']]) {
    const result = run(args, input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr.toString(), /base2300:/);
  }
  assert.match(run(['--help']).stdout.toString(), /Usage: base2300/);
  assert.match(run(['--version']).stdout.toString(), /^0\.1\.0\n$/);
});
