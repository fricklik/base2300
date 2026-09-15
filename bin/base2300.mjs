#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { encode, decode, MAX_BASE2300_BYTES, MAX_BASE2300_TEXT_LENGTH } from '../dist/index.js';
import { encodeBase2300Advanced, extendBase2300WithNative, decodeBase2300AdvancedAsync } from '../dist/experimental.js';

const help = `Usage: base2300 <encode|decode> [--experimental] [--native] [FILE|-]

Read bytes from FILE or stdin and write the result to stdout.
Output has no added newline; decoding preserves the exact original bytes.
Default: stable CRC32-checked v1. Input limit: 4 MiB.

  --experimental  Compare portable profiles (fast effort); output may omit CRC32.
  --native        Also compare available native compression; implies --experimental.
  --help          Show this help.
  --version       Show the package version.

Decode with --experimental or --native for any portable experimental profile.
Legacy model-dependent LLM frames are unsupported.

Examples:
  base2300 encode message.txt > message.b2300
  base2300 decode message.b2300 > restored.txt
`;

async function boundedRead(stream, maximum) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maximum) throw new Error(`Input exceeds the ${maximum}-byte limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--version') {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const command = args.shift();
  if (command !== 'encode' && command !== 'decode') throw new Error('Expected encode or decode. See base2300 --help.');
  let experimental = false;
  let native = false;
  let file;
  for (const arg of args) {
    if (arg === '--experimental') experimental = true;
    else if (arg === '--native') { native = true; experimental = true; }
    else if (arg !== '-' && arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (file !== undefined) throw new Error('Only one input file is accepted.');
    else file = arg;
  }
  const stream = file === undefined || file === '-' ? process.stdin : createReadStream(file);
  const input = await boundedRead(stream, command === 'encode' ? MAX_BASE2300_BYTES : MAX_BASE2300_TEXT_LENGTH * 3);
  let output;
  if (command === 'encode') {
    if (experimental) {
      let selection = encodeBase2300Advanced(input, 'fast');
      if (native) selection = await extendBase2300WithNative(input, selection);
      output = selection.text;
    } else output = encode(input);
  } else {
    const wire = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    output = experimental ? await decodeBase2300AdvancedAsync(wire) : decode(wire);
  }
  if (!process.stdout.write(output)) await once(process.stdout, 'drain');
}

main().catch((error) => {
  process.stderr.write(`base2300: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
