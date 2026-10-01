# Test signing chain for App Store payloads

**Test-only. Nothing here is trusted outside the test suite.**

A real StoreKit transaction is signed by Apple, which these tests cannot do. So
they are signed by a stand-in chain built the same way as Apple's:

- `trusted-*`: root → intermediate → leaf. The intermediate and leaf carry
  Apple's marker extensions (`1.2.840.113635.100.6.2.1` and
  `1.2.840.113635.100.6.11.1`). Tests trust `trusted-root.pem` in place of
  Apple Root CA - G3.
- `rogue-*`: an equally valid chain with an untrusted root. It must always be refused.
- `unmarked-leaf.*`: issued by the trusted intermediate but missing the StoreKit
  marker. It must always be refused.

The `.key` files are the leaves' signing keys, needed to sign test payloads.
The CA keys were deleted after issuing, so no new certificates can be minted
from this chain. Certificates are valid for 100 years so the suite does not rot.

Production code trusts only `APPLE_ROOT_CA_G3_PEM` in `src/app-store.ts`; a root
is used from here only when a test passes `appStoreRoots`/`trustedRoots`.

`ext.cnf` is the OpenSSL config these were issued with.
