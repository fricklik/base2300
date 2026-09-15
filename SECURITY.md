# Security and trust boundaries

Base2300 is an experimental encoding library. It is not encryption or an
authentication mechanism. CRC32 detects many accidental changes but an attacker
can recompute it. Experimental minimal frames have no checksum and can silently
decode altered data.

Original input bytes and decoded bytes are capped at 4 MiB. Encoded text has a
separate length bound and its UTF-8 representation can exceed 4 MiB. The payload
limit does not bound CPU time or peak memory: candidate search, BigInt conversion and decompression still
consume resources. Use a Worker or a separately limited process for untrusted
inputs. Apply stricter limits and cancellation in your application.

Do not normalize, case-fold, trim or line-wrap the encoded text. Do not infer
validity from a recognized first character. Complete decoding is required.
Never execute decoded text as code or HTML. This package does not manage file
names, content types, origin authentication, or encrypted storage.

## Reporting

For ordinary bugs, open an issue with a small, non-sensitive reproducer. For a
potentially exploitable vulnerability, use the repository's private vulnerability
reporting if enabled; otherwise contact its maintainer through the contact method
listed on their public profile before posting exploit details. No private mailbox
or response-time commitment is established in this initial local release.

Only the current source tree is maintained. No security audit or production
support guarantee is claimed.
