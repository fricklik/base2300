# Contributing

Base2300 explores reversible representations with fewer Unicode code points.
Unexpected expansion and negative results are valuable contributions.
English and Japanese issues and pull requests are welcome.

## Development

Use Node.js 22 or newer:

```sh
npm ci
npm run check
npm run benchmark
npm run demo
```

The package has no runtime dependencies. Keep the core usable in a browser,
without a server, a network request, or a separately installed model.

## Proposing a codec change

1. Describe the target input distribution and which length metric improves.
2. Report the entire output, including headers, padding and integrity checks.
3. Include cases that expand, invalid UTF-8, empty input and Unicode boundaries.
4. Verify exact byte recovery. Preserve BOMs and normalization forms.
5. State memory/time costs and all shared dictionaries or model dependencies.
6. Keep existing vectors unchanged. A new wire format needs its own identifier
   and a documented decoder; never reorder the alphabet or reuse a reserved mode.

The public `encode`/`decode` API retains CRC32. CRC-free experiments belong in
the experimental entry point. A smaller output obtained by dropping integrity
checks must be identified as such. Do not train a model or build a dictionary
from the benchmark cases and then report those cases as independent evaluation.

## Reviewing and releasing

Keep changes focused, explain behavior and evidence, and treat collaborators
respectfully. Do not include private payloads in reports. See [SECURITY.md](SECURITY.md)
for potentially exploitable issues and [the release guide](docs/releasing.md)
for distribution checks.

Contributions are under the [MIT license](LICENSE); preserve all third-party
notices. When updating Unicode-derived data, keep its Unicode license and use
a new wire identifier if its contents or ordering change.
