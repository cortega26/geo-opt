# Test-only TLS fixtures (Plan 074)

**NEVER TRUST THESE IN PRODUCTION. NEVER USE THESE KEYS OUTSIDE TESTS.**

Every key and certificate in this directory is a synthetic test fixture with no
real identity, generated locally for the deterministic HTTPS coverage in
`tests/fetcher.test.js` ("HTTPS certificate & IP pinning"). They are not
production credentials; the private keys are committed only so the suite stays
hermetic (zero network, zero runtime dependencies). If anything here ever ends
up in a trust store, in production config, or in a public CA bundle, that is a
bug.

## Contents

| File                                               | Purpose                                                                                        | Signed by |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| `TEST-ONLY-ca-key.pem` / `TEST-ONLY-ca-cert.pem`   | Test-only root CA (`CA:TRUE`, keyCertSign)                                                     | itself    |
| `TEST-ONLY-localhost-server-key.pem` / `-cert.pem` | Server cert, `SAN=DNS:localhost` — the trusted positive case                                   | test CA   |
| `TEST-ONLY-mismatch-server-key.pem` / `-cert.pem`  | Server cert, `SAN=DNS:example.test` — hostname-mismatch negative                               | test CA   |
| `TEST-ONLY-untrusted-server-key.pem` / `-cert.pem` | Self-signed cert, `SAN=DNS:localhost` — untrusted-CA negative                                  | itself    |
| `fetch-child.mjs`                                  | Child process that runs the real `fetchUrl` with the test CA trusted via `NODE_EXTRA_CA_CERTS` | —         |

The test CA is only trusted inside the child process spawned with
`NODE_EXTRA_CA_CERTS`; the main test process never trusts it, so the negative
cases exercise the production trust store untouched.

## Expiry

All certificates expire **2036-07-31** (generated 2026-08-03, validity 3650
days). Regenerate before that date — a stale fixture will make the TLS suite
fail, and the tests only verify fixture regeneration is documented here, not
that it has happened.

## Regeneration

Requires `openssl` (3.x). Run from this directory:

```sh
set -euo pipefail

# 1. Test-only CA (self-signed, CA:TRUE, keyCertSign)
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout TEST-ONLY-ca-key.pem -out TEST-ONLY-ca-cert.pem \
  -subj "/CN=geo-opt test-only CA - DO NOT TRUST OUTSIDE TESTS" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# 2. localhost server cert (trusted positive case), signed by the test CA
openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout TEST-ONLY-localhost-server-key.pem -out localhost.csr \
  -subj "/CN=localhost"
printf 'subjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > localhost.ext
openssl x509 -req -in localhost.csr -CA TEST-ONLY-ca-cert.pem -CAkey TEST-ONLY-ca-key.pem \
  -CAcreateserial -days 3650 -sha256 -out TEST-ONLY-localhost-server-cert.pem \
  -extfile localhost.ext

# 3. mismatch server cert (hostname-mismatch negative), signed by the test CA
openssl req -newkey rsa:2048 -sha256 -nodes \
  -keyout TEST-ONLY-mismatch-server-key.pem -out mismatch.csr \
  -subj "/CN=example.test"
printf 'subjectAltName=DNS:example.test\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > mismatch.ext
openssl x509 -req -in mismatch.csr -CA TEST-ONLY-ca-cert.pem -CAkey TEST-ONLY-ca-key.pem \
  -CAcreateserial -days 3650 -sha256 -out TEST-ONLY-mismatch-server-cert.pem \
  -extfile mismatch.ext

# 4. untrusted self-signed cert (untrusted-CA negative)
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout TEST-ONLY-untrusted-server-key.pem -out TEST-ONLY-untrusted-server-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

# Cleanup intermediates
rm -f localhost.csr mismatch.csr localhost.ext mismatch.ext TEST-ONLY-ca-cert.srl
```

Then verify with:

```sh
openssl verify -CAfile TEST-ONLY-ca-cert.pem TEST-ONLY-localhost-server-cert.pem
# (should print: TEST-ONLY-localhost-server-cert.pem: OK)
openssl verify -CAfile TEST-ONLY-ca-cert.pem TEST-ONLY-mismatch-server-cert.pem
# (should print: TEST-ONLY-mismatch-server-cert.pem: OK)
```

If a fixture was tampered with, `npm test` fails with a TLS error in the
"HTTPS certificate & IP pinning" describe.
