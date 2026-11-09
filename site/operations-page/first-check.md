## Check this receipt for free.

**Verify the original. Change one byte. Check it again.**

A real 385-byte checkpoint has two separate signed records: an original POPCORN v2 receipt and a FreeTSA timestamp from October 14, 2026. The exact bytes, both records, public verification material and a complete offline checker are printed below. No account, wallet, purchase or download is required to use this printed example. Use tools already available to you.

### Do the check

1. Save the complete JSON block below as `sample.json` and the complete JavaScript block as `verify-free-sample.mjs`. Keep the encoded bytes and signed fields unchanged.
2. If Node is available, run the command below. `sample-files` must be a new directory; the checker refuses to overwrite an existing one. It makes no network requests or payments.
3. Read the individual results. The checker also changes the first checkpoint byte from `F` to `G`, checks the changed digest and saves both files. If OpenSSL is available, run the separate commands below to check the FreeTSA timestamp against each file.
4. Report which checks passed, which altered-data checks failed as expected, and anything you could not check. If you cannot run these tools, say so; reading the packet is not a verification result.

```sh
node verify-free-sample.mjs sample.json sample-files
```

### What you should see

**Original: PASS. Altered checkpoint: digest mismatch.** The Node report should contain 12 `PASS` checks, `altered_digest_matches_receipt: false` and `original_signature_still_valid: true`. The unchanged signature still signs the original receipt; it does not authenticate the changed checkpoint. The overall `PASS` includes successful detection of that deliberate mismatch.

The original checkpoint must be exactly 385 bytes with SHA-256 `03eecd1ed8866d816e183834fbf7f94543ecca18d0a1adc0f3b798252e6058a2`. Its receipt is `pwr_eb7e440aaff765e9d803c42d96c171c6`, with POPCORN witness time `2026-10-14T23:26:25.273Z`. Keep those historical values; this is not a current-time request.

The Node checker verifies the POPCORN signature and the retained FreeTSA file hashes. It deliberately reports `freetsa_rfc3161_signature_verified: false`: OpenSSL performs that separate signature and timestamp check. With the printed certificate material, the first command below should return `Verification: OK` and exit 0; the second should return `Verification: FAILED` with a message-imprint mismatch and exit nonzero.

```sh
openssl ts -verify -data sample-files/checkpoint.txt -in sample-files/checkpoint.tsr -CAfile sample-files/freetsa-root.pem -untrusted sample-files/freetsa-signer.pem
openssl ts -verify -data sample-files/checkpoint-tampered.txt -in sample-files/checkpoint.tsr -CAfile sample-files/freetsa-root.pem -untrusted sample-files/freetsa-signer.pem
```

These commands were checked locally against the retained files: the original passed and the altered checkpoint failed. OpenSSL may also warn that the supplied signing certificate is not a CA certificate; the final verification result and exit code distinguish the two checks.

### The complete historical packet

Copy this whole JSON block. The base64url checkpoint preserves its exact line endings; the readable text is for inspection. The original POPCORN response, compact JWS, public key, native FreeTSA response and both PEM certificates are included.

```json
{
  "evaluation_only": true,
  "historical_evidence_date_utc": "2026-10-14",
  "new_payment_authorized": false,
  "purpose": "Verify the two original attestations against the same retained checkpoint bytes. Then change a checkpoint byte and check again.",
  "exact_checkpoint": {
    "encoding": "base64url",
    "byte_length": 385,
    "bytes": "RlJFRVRTQS1QT1BDT1JOLUlOVEVST1AtVEVTVC8xLjAKY2hlY2twb2ludDogZmlyc3Qgam9pbnQgY2hlY2twb2ludApwb3Bjb3JuX25vZGU6IDc2Ny0yNjc2LmNvbQpmcmVldHNhOiBmcmVldHNhLm9yZyAoUkZDIDMxNjEpCnRlcm1zOiBGcmVlVFNBIHJlcXVlc3RzIGF0IG9yIHVuZGVyIG9uZSBwZXIgc2Vjb25kIHBlciBJUCwgcGVyIG9wZXJhdG9yIHJlcGx5IG9mIDIwMjYtMTAtMTQKcHVycG9zZTogcmV0YWluIG9uZSBGcmVlVFNBIHRpbWVzdGFtcCByZXNwb25zZSBhbmQgb25lIFBPUENPUk4gcmVjZWlwdCBmb3IgdGhpcyBleGFjdCB0ZXh0LCBlYWNoIGluIGl0cyBuYXRpdmUgZm9ybWF0LCBlYWNoIHZlcmlmaWVkIGJ5IGl0cyBvd24gcGF0aApkYXRlOiAyMDI2LTEwLTE0Cg",
    "utf8_for_reading": "FREETSA-POPCORN-INTEROP-TEST/1.0\ncheckpoint: first joint checkpoint\npopcorn_node: 767-2676.com\nfreetsa: freetsa.org (RFC 3161)\nterms: FreeTSA requests at or under one per second per IP, per operator reply of 2026-10-14\npurpose: retain one FreeTSA timestamp response and one POPCORN receipt for this exact text, each in its native format, each verified by its own path\ndate: 2026-10-14\n",
    "sha256_hex": "03eecd1ed8866d816e183834fbf7f94543ecca18d0a1adc0f3b798252e6058a2"
  },
  "popcorn_response": {
    "witness_receipt": {
      "receipt_id": "pwr_eb7e440aaff765e9d803c42d96c171c6",
      "tain": "tain_01M4YBT3FSPW08EWE0MGPN2WCT",
      "node_id": "767-2676.com",
      "protocol_id": "POPCORN-WITNESS/2.0",
      "request_received_at_utc": "2026-10-14T23:26:24.611Z",
      "witnessed_at_utc": "2026-10-14T23:26:25.273Z",
      "statement_created_at_utc": "2026-10-14T23:26:25.273Z",
      "unix_time_milliseconds": 1792020385273,
      "clock_accuracy_radius_ms": 10000,
      "witness_window_utc": {
        "earliest": "2026-10-14T23:26:15.273Z",
        "latest": "2026-10-14T23:26:35.273Z"
      },
      "server_processing_duration_ms": 662,
      "post_witness_processing_duration_ms": 0,
      "commitment": {
        "payload_digest": {
          "algorithm": "sha-256",
          "value": "A-7NHtiGbYFuGDg0-_f5RUPsyhjQoa3A87eYJS5gWKI"
        },
        "nonce": "WRfPcCqfujj3OOXHMoirn9VKbfhNf99gNeTHGXQ1SII",
        "previous_attestation_digest": null
      },
      "payment_identifier": "eip3009_13c0c153b3cf487a435926de8d139a04ec89da73fc212b1487fda0c0d3cb1635",
      "payment_transaction": "0xc08bd6855e545099070e3657f12c040a6983076b185a5ee069ac3865a492bd7f",
      "evidence_scope": {
        "type": "payload_commitment_witness",
        "payload_disclosed": false,
        "caller_identity_proven": false,
        "recipient_delivery_proven": false,
        "action_execution_proven": false,
        "nonce_uniqueness_enforced": false,
        "replay_prevented": false,
        "authorization_granted": false,
        "external_atomic_clock_alignment_proven": false,
        "clock_accuracy_independently_verified": false,
        "payer_authorization_bound_to_commitment": false
      },
      "issuing_origin": "https://767-2676.com",
      "issuance_endpoint": "/v2/receipt",
      "tain_verification_uri": "https://767-2676.com/v1/receipt/tain/tain_01M4YBT3FSPW08EWE0MGPN2WCT",
      "contribution_license_uri": "https://767-2676.com/license/contribution/1.0",
      "license_terms_digest": {
        "algorithm": "sha-256",
        "value": "cR0ghOOH6DG3SEeoYxPw1b38oL2wf2IjTazGSxi-vIY"
      }
    },
    "witness_attestation": {
      "format": "JWS",
      "algorithm": "ES256",
      "key_id": "popcorn-witness-2026-01",
      "key_set": "/.well-known/popcorn-keys.json",
      "compact_jws": "eyJhbGciOiJFUzI1NiIsImtpZCI6InBvcGNvcm4td2l0bmVzcy0yMDI2LTAxIiwidHlwIjoicG9wY29ybi13aXRuZXNzK2p3cyJ9.eyJyZWNlaXB0X2lkIjoicHdyX2ViN2U0NDBhYWZmNzY1ZTlkODAzYzQyZDk2YzE3MWM2IiwidGFpbiI6InRhaW5fMDFNNFlCVDNGU1BXMDhFV0UwTUdQTjJXQ1QiLCJub2RlX2lkIjoiNzY3LTI2NzYuY29tIiwicHJvdG9jb2xfaWQiOiJQT1BDT1JOLVdJVE5FU1MvMi4wIiwicmVxdWVzdF9yZWNlaXZlZF9hdF91dGMiOiIyMDI2LTEwLTE0VDIzOjI2OjI0LjYxMVoiLCJ3aXRuZXNzZWRfYXRfdXRjIjoiMjAyNi0xMC0xNFQyMzoyNjoyNS4yNzNaIiwic3RhdGVtZW50X2NyZWF0ZWRfYXRfdXRjIjoiMjAyNi0xMC0xNFQyMzoyNjoyNS4yNzNaIiwidW5peF90aW1lX21pbGxpc2Vjb25kcyI6MTc5MjAyMDM4NTI3MywiY2xvY2tfYWNjdXJhY3lfcmFkaXVzX21zIjoxMDAwMCwid2l0bmVzc193aW5kb3dfdXRjIjp7ImVhcmxpZXN0IjoiMjAyNi0xMC0xNFQyMzoyNjoxNS4yNzNaIiwibGF0ZXN0IjoiMjAyNi0xMC0xNFQyMzoyNjozNS4yNzNaIn0sInNlcnZlcl9wcm9jZXNzaW5nX2R1cmF0aW9uX21zIjo2NjIsInBvc3Rfd2l0bmVzc19wcm9jZXNzaW5nX2R1cmF0aW9uX21zIjowLCJjb21taXRtZW50Ijp7InBheWxvYWRfZGlnZXN0Ijp7ImFsZ29yaXRobSI6InNoYS0yNTYiLCJ2YWx1ZSI6IkEtN05IdGlHYllGdUdEZzAtX2Y1UlVQc3loalFvYTNBODdlWUpTNWdXS0kifSwibm9uY2UiOiJXUmZQY0NxZnVqajNPT1hITW9pcm45VktiZmhOZjk5Z05lVEhHWFExU0lJIiwicHJldmlvdXNfYXR0ZXN0YXRpb25fZGlnZXN0IjpudWxsfSwicGF5bWVudF9pZGVudGlmaWVyIjoiZWlwMzAwOV8xM2MwYzE1M2IzY2Y0ODdhNDM1OTI2ZGU4ZDEzOWEwNGVjODlkYTczZmMyMTJiMTQ4N2ZkYTBjMGQzY2IxNjM1IiwicGF5bWVudF90cmFuc2FjdGlvbiI6IjB4YzA4YmQ2ODU1ZTU0NTA5OTA3MGUzNjU3ZjEyYzA0MGE2OTgzMDc2YjE4NWE1ZWUwNjlhYzM4NjVhNDkyYmQ3ZiIsImV2aWRlbmNlX3Njb3BlIjp7InR5cGUiOiJwYXlsb2FkX2NvbW1pdG1lbnRfd2l0bmVzcyIsInBheWxvYWRfZGlzY2xvc2VkIjpmYWxzZSwiY2FsbGVyX2lkZW50aXR5X3Byb3ZlbiI6ZmFsc2UsInJlY2lwaWVudF9kZWxpdmVyeV9wcm92ZW4iOmZhbHNlLCJhY3Rpb25fZXhlY3V0aW9uX3Byb3ZlbiI6ZmFsc2UsIm5vbmNlX3VuaXF1ZW5lc3NfZW5mb3JjZWQiOmZhbHNlLCJyZXBsYXlfcHJldmVudGVkIjpmYWxzZSwiYXV0aG9yaXphdGlvbl9ncmFudGVkIjpmYWxzZSwiZXh0ZXJuYWxfYXRvbWljX2Nsb2NrX2FsaWdubWVudF9wcm92ZW4iOmZhbHNlLCJjbG9ja19hY2N1cmFjeV9pbmRlcGVuZGVudGx5X3ZlcmlmaWVkIjpmYWxzZSwicGF5ZXJfYXV0aG9yaXphdGlvbl9ib3VuZF90b19jb21taXRtZW50IjpmYWxzZX0sImlzc3Vpbmdfb3JpZ2luIjoiaHR0cHM6Ly83NjctMjY3Ni5jb20iLCJpc3N1YW5jZV9lbmRwb2ludCI6Ii92Mi9yZWNlaXB0IiwidGFpbl92ZXJpZmljYXRpb25fdXJpIjoiaHR0cHM6Ly83NjctMjY3Ni5jb20vdjEvcmVjZWlwdC90YWluL3RhaW5fMDFNNFlCVDNGU1BXMDhFV0UwTUdQTjJXQ1QiLCJjb250cmlidXRpb25fbGljZW5zZV91cmkiOiJodHRwczovLzc2Ny0yNjc2LmNvbS9saWNlbnNlL2NvbnRyaWJ1dGlvbi8xLjAiLCJsaWNlbnNlX3Rlcm1zX2RpZ2VzdCI6eyJhbGdvcml0aG0iOiJzaGEtMjU2IiwidmFsdWUiOiJjUjBnaE9PSDZERzNTRWVvWXhQdzFiMzhvTDJ3ZjJJalRhekdTeGktdklZIn19.aSnGyJM5C_J5ttZrTYLEezT0TeQR7dhPg-X7B1-mAFarOH81Owlu1Rjc7bDjmDRyv6iCzwATuPAkWKOFxJf4BQ"
    },
    "payment_status": "settled",
    "tain_qr_png_base64": "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",
    "tain_qr_payload": "{\"v\":1,\"tain\":\"tain_01M4YBT3FSPW08EWE0MGPN2WCT\",\"license_uri\":\"https://767-2676.com/license/contribution/1.0\",\"terms_digest\":\"cR0ghOOH6DG3SEeoYxPw1b38oL2wf2IjTazGSxi-vIY\",\"verify_uri\":\"https://767-2676.com/v1/receipt/tain/tain_01M4YBT3FSPW08EWE0MGPN2WCT\"}",
    "letterhead_uri": "https://767-2676.com/v1/receipt/tain/tain_01M4YBT3FSPW08EWE0MGPN2WCT"
  },
  "popcorn_public_keys": {
    "keys": [
      {
        "kty": "EC",
        "crv": "P-256",
        "x": "wCMGy1SpeYgxbzNQNgndb_-qs03LRkMNNb5nZkLsYi8",
        "y": "OJbr-FtHN2146BYAaMZZ3LgRI7kZVDbkvjepLZFctQY",
        "use": "sig",
        "alg": "ES256",
        "kid": "popcorn-time-2026-01"
      },
      {
        "kty": "EC",
        "crv": "P-256",
        "x": "bPF-sxkcKCem33P9aAiwuQZlQOaHJzUWc1FxEE6kNhs",
        "y": "wQwlxsexe7-4J79qQmpuebyS4GmN0gqrPyN-XfpVAQA",
        "use": "sig",
        "alg": "ES256",
        "kid": "popcorn-witness-2026-01",
        "popcorn_protocol": "POPCORN-WITNESS/1.0"
      }
    ]
  },
  "freetsa_timestamp_response": {
    "encoding": "base64",
    "byte_length": 4643,
    "sha256_hex": "d4213e71c60a1a23bdd0cade0f57288ef3fb096848127c6a6e779a26d0f8ea8c",
    "bytes": "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"
  },
  "freetsa_root_certificate_pem": "-----BEGIN CERTIFICATE-----\nMIIH/zCCBeegAwIBAgIJAMHphhYNqOmAMA0GCSqGSIb3DQEBDQUAMIGVMREwDwYD\nVQQKEwhGcmVlIFRTQTEQMA4GA1UECxMHUm9vdCBDQTEYMBYGA1UEAxMPd3d3LmZy\nZWV0c2Eub3JnMSIwIAYJKoZIhvcNAQkBFhNidXNpbGV6YXNAZ21haWwuY29tMRIw\nEAYDVQQHEwlXdWVyemJ1cmcxDzANBgNVBAgTBkJheWVybjELMAkGA1UEBhMCREUw\nHhcNMTYwMzEzMDE1MjEzWhcNNDEwMzA3MDE1MjEzWjCBlTERMA8GA1UEChMIRnJl\nZSBUU0ExEDAOBgNVBAsTB1Jvb3QgQ0ExGDAWBgNVBAMTD3d3dy5mcmVldHNhLm9y\nZzEiMCAGCSqGSIb3DQEJARYTYnVzaWxlemFzQGdtYWlsLmNvbTESMBAGA1UEBxMJ\nV3VlcnpidXJnMQ8wDQYDVQQIEwZCYXllcm4xCzAJBgNVBAYTAkRFMIICIjANBgkq\nhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtgKODjAy8REQ2WTNqUudAnjhlCrpE6ql\nmQfNppeTmVvZrH4zutn+NwTaHAGpjSGv4/WRpZ1wZ3BRZ5mPUBZyLgq0YrIfQ5Fx\n0s/MRZPzc1r3lKWrMR9sAQx4mN4z11xFEO529L0dFJjPF9MD8Gpd2feWzGyptlel\nb+PqT+++fOa2oY0+NaMM7l/xcNHPOaMz0/2olk0i22hbKeVhvokPCqhFhzsuhKsm\nq4Of/o+t6dI7sx5h0nPMm4gGSRhfq+z6BTRgCrqQG2FOLoVFgt6iIm/BnNffUr7V\nDYd3zZmIwFOj/H3DKHoGik/xK3E82YA2ZulVOFRW/zj4ApjPa5OFbpIkd0pmzxzd\nEcL479hSA9dFiyVmSxPtY5ze1P+BE9bMU1PScpRzw8MHFXxyKqW13Qv7LWw4sbk3\nSciB7GACbQiVGzgkvXG6y85HOuvWNvC5GLSiyP9GlPB0V68tbxz4JVTRdw/Xn/XT\nFNzRBM3cq8lBOAVt/PAX5+uFcv1S9wFE8YjaBfWCP1jdBil+c4e+0tdywT2oJmYB\nBF/kEt1wmGwMmHunNEuQNzh1FtJY54hbUfiWi38mASE7xMtMhfj/C4SvapiDN837\ngYaPfs8x3KZxbX7C3YAsFnJinlwAUss1fdKar8Q/YVs7H/nU4c4Ixxxz4f67fcVq\nM2ITKentbCMCAwEAAaOCAk4wggJKMAwGA1UdEwQFMAMBAf8wDgYDVR0PAQH/BAQD\nAgHGMB0GA1UdDgQWBBT6VQ2MNGZRQ0z357OnbJWveuaklzCBygYDVR0jBIHCMIG/\ngBT6VQ2MNGZRQ0z357OnbJWveuakl6GBm6SBmDCBlTERMA8GA1UEChMIRnJlZSBU\nU0ExEDAOBgNVBAsTB1Jvb3QgQ0ExGDAWBgNVBAMTD3d3dy5mcmVldHNhLm9yZzEi\nMCAGCSqGSIb3DQEJARYTYnVzaWxlemFzQGdtYWlsLmNvbTESMBAGA1UEBxMJV3Vl\ncnpidXJnMQ8wDQYDVQQIEwZCYXllcm4xCzAJBgNVBAYTAkRFggkAwemGFg2o6YAw\nMwYDVR0fBCwwKjAooCagJIYiaHR0cDovL3d3dy5mcmVldHNhLm9yZy9yb290X2Nh\nLmNybDCBzwYDVR0gBIHHMIHEMIHBBgorBgEEAYHyJAEBMIGyMDMGCCsGAQUFBwIB\nFidodHRwOi8vd3d3LmZyZWV0c2Eub3JnL2ZyZWV0c2FfY3BzLmh0bWwwMgYIKwYB\nBQUHAgEWJmh0dHA6Ly93d3cuZnJlZXRzYS5vcmcvZnJlZXRzYV9jcHMucGRmMEcG\nCCsGAQUFBwICMDsaOUZyZWVUU0EgdHJ1c3RlZCB0aW1lc3RhbXBpbmcgU29mdHdh\ncmUgYXMgYSBTZXJ2aWNlIChTYWFTKTA3BggrBgEFBQcBAQQrMCkwJwYIKwYBBQUH\nMAGGG2h0dHA6Ly93d3cuZnJlZXRzYS5vcmc6MjU2MDANBgkqhkiG9w0BAQ0FAAOC\nAgEAaK9+v5OFYu9M6ztYC+L69sw1omdyli89lZAfpWMMh9CRmJhM6KBqM/ipwoLt\nnxyxGsbCPhcQjuTvzm+ylN6VwTMmIlVyVSLKYZcdSjt/eCUN+41K7sD7GVmxZBAF\nILnBDmTGJmLkrU0KuuIpj8lI/E6Z6NnmuP2+RAQSHsfBQi6sssnXMo4HOW5gtPO7\ngDrUpVXID++1P4XndkoKn7Svw5n0zS9fv1hxBcYIHPPQUze2u30bAQt0n0iIyRLz\naWuhtpAtd7ffwEbASgzB7E+NGF4tpV37e8KiA2xiGSRqT5ndu28fgpOY87gD3ArZ\nDctZvvTCfHdAS5kEO3gnGGeZEVLDmfEsv8TGJa3AljVa5E40IQDsUXpQLi8G+UC4\n1DWZu8EVT4rnYaCw1VX7ShOR1PNCCvjb8S8tfdudd9zhU3gEB0rxdeTy1tVbNLXW\n99y90xcwr1ZIDUwM/xQ/noO8FRhm0LoPC73Ef+J4ZBdrvWwauF3zJe33d4ibxEcb\n8/pz5WzFkeixYM2nsHhqHsBKw7JPouKNXRnl5IAE1eFmqDyC7G/VT7OF669xM6hb\nUt5G21JE4cNK6NNucS+fzg1JPX0+3VhsYZjj7D5uljRvQXrJ8iHgr/M6j2oLHvTA\nI2MLdq2qjZFDOCXsxBxJpbmLGBx9ow6ZerlUxzws2AWv2pk=\n-----END CERTIFICATE-----\n",
  "freetsa_signing_certificate_pem": "-----BEGIN CERTIFICATE-----\nMIIGYDCCBEigAwIBAgIJAMLphhYNqOnNMA0GCSqGSIb3DQEBDQUAMIGVMREwDwYD\nVQQKEwhGcmVlIFRTQTEQMA4GA1UECxMHUm9vdCBDQTEYMBYGA1UEAxMPd3d3LmZy\nZWV0c2Eub3JnMSIwIAYJKoZIhvcNAQkBFhNidXNpbGV6YXNAZ21haWwuY29tMRIw\nEAYDVQQHEwlXdWVyemJ1cmcxDzANBgNVBAgTBkJheWVybjELMAkGA1UEBhMCREUw\nHhcNMjYwMjE1MTk0NDIyWhcNNDAwMjAyMTk0NDIyWjCCAQsxETAPBgNVBAoMCEZy\nZWUgVFNBMQwwCgYDVQQLDANUU0ExdjB0BgNVBA0MbVRoaXMgY2VydGlmaWNhdGUg\nZGlnaXRhbGx5IHNpZ25zIGRvY3VtZW50cyBhbmQgdGltZSBzdGFtcCByZXF1ZXN0\ncyBtYWRlIHVzaW5nIHRoZSBmcmVldHNhLm9yZyBvbmxpbmUgc2VydmljZXMxGDAW\nBgNVBAMMD3d3dy5mcmVldHNhLm9yZzEkMCIGCSqGSIb3DQEJARYVYnVzaWxlemFz\nQG1haWxib3gub3JnMRIwEAYDVQQHDAlXdWVyemJ1cmcxCzAJBgNVBAYTAkRFMQ8w\nDQYDVQQIDAZCYXllcm4wdjAQBgcqhkjOPQIBBgUrgQQAIgNiAASiFeGhstbLhxix\n0o4UAumNSwHUUlOe3DBvs8fYs580wADW59oqGSCx15bp61TSmXkwLm1JW48XnbLL\nizP6ZtjcvshV3H9uz2bS53sgDXhg1wLbIhAtraC+fHCytHeuVaujggHmMIIB4jAJ\nBgNVHRMEAjAAMB0GA1UdDgQWBBQVwL0m69RdgtFdkyYxL+9wsotGXjAfBgNVHSME\nGDAWgBT6VQ2MNGZRQ0z357OnbJWveuaklzALBgNVHQ8EBAMCBsAwFgYDVR0lAQH/\nBAwwCgYIKwYBBQUHAwgwbAYIKwYBBQUHAQEEYDBeMDMGCCsGAQUFBzAChidodHRw\nOi8vd3d3LmZyZWV0c2Eub3JnL2ZpbGVzL2NhY2VydC5wZW0wJwYIKwYBBQUHMAGG\nG2h0dHA6Ly93d3cuZnJlZXRzYS5vcmc6MjU2MDA3BgNVHR8EMDAuMCygKqAohiZo\ndHRwOi8vd3d3LmZyZWV0c2Eub3JnL2NybC9yb290X2NhLmNybDCByAYDVR0gBIHA\nMIG9MIG6BgMrBQgwgbIwMwYIKwYBBQUHAgEWJ2h0dHA6Ly93d3cuZnJlZXRzYS5v\ncmcvZnJlZXRzYV9jcHMuaHRtbDAyBggrBgEFBQcCARYmaHR0cDovL3d3dy5mcmVl\ndHNhLm9yZy9mcmVldHNhX2Nwcy5wZGYwRwYIKwYBBQUHAgIwOxo5RnJlZVRTQSB0\ncnVzdGVkIHRpbWVzdGFtcGluZyBTb2Z0d2FyZSBhcyBhIFNlcnZpY2UgKFNhYVMp\nMA0GCSqGSIb3DQEBDQUAA4ICAQBrMVS/YfnfMr0ziZnesBUOrDNRrNNgt3IgMNDw\nNhwl6oKWHVIhlYnM/5boljfbpZTAbqvxHI3ztT0/swxQOqTat5qBJRAY/VH1n/T4\nM9uDjSuu3qfh0ZH5PL9ENqoVW44i5NT/znQev2MGXOAHwz9kZwwzz9MFX6hbGhBq\nWa+nlAqb7Y72KFzj33m1OVHxV2Wl4YD9f91bZTFpUEGW4Ktbkmxpf/iGIPaf4WHp\noBW/O6EzofMKYlz4yXyEBh0wRRVyXltLrj+MFHqhe+PsMBllq/dCaO4W/F+AuHEl\nu7aUYWMASelphWAJiUsNMr5HAoeCSSgilqf1CSoWC+k6e4334Fym+Iy4csMex+PG\n4rSdqXJVQ+AWEdRajSPKh7yDfpNkdnO6yqQJ/tSd11XQ5cL0M9jWuCD1zHlgA+u+\nR2cry3yo23jD7qTGLhZqUvXCyWigH30/Q/RXjjDwrc4DJiQ+gRY0FhdTYqlvgMBP\nr4LcJKnNksivdj+kbz7bVSbrBAzRiazK9l841/5XMtP9BvD0hKCpQFvP9PSgCC8E\nQnKqgSe26FSJBaAQcA5TnK8NF4jkbElBxf/zyh7P3IjHso35jtgUWD1/itg9BJWb\nYUwJ4tfILpB2F0wbk1GcZDCDZoyW3Xf3trApz/Zd93gF3joc9Hh9RFveKRzWQ7dd\nUt3egQ==\n-----END CERTIFICATE-----\n",
  "source_addresses": {
    "checkpoint": "https://767-2676.com/evidence/freetsa-popcorn-2026-10-14/checkpoint.txt",
    "popcorn_response": "https://767-2676.com/evidence/freetsa-popcorn-2026-10-14/popcorn-receipt.json",
    "popcorn_public_keys": "https://767-2676.com/.well-known/popcorn-keys.json",
    "freetsa_timestamp_response": "https://767-2676.com/evidence/freetsa-popcorn-2026-10-14/checkpoint.tsr",
    "freetsa_root_certificate": "https://freetsa.org/files/cacert.pem",
    "freetsa_signing_certificate": "https://freetsa.org/files/tsa.crt"
  }
}
```

### The complete offline checker

Copy this whole block as `verify-free-sample.mjs`. It uses Node built-ins only. It checks this specific retained sample, not every possible production receipt. On success it writes `checkpoint.txt`, `checkpoint-tampered.txt`, `checkpoint.tsr`, `freetsa-root.pem`, `freetsa-signer.pem` and `verification.json` into the new directory.

```javascript
// Offline checks for the retained October 14, 2026 sample only. No network or payments.
// Usage: node verifier.mjs packet.json NEW-output-directory
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const EXPECTED = Object.freeze({
  checkpointBytes: 385,
  checkpointSha256: '03eecd1ed8866d816e183834fbf7f94543ecca18d0a1adc0f3b798252e6058a2',
  jwsSha256: '79aa3041086b4cd16cb1c6d9c3257b8a9e681d645bc75c478a0ec6f74d850e40',
  kid: 'popcorn-witness-2026-01',
  x: 'bPF-sxkcKCem33P9aAiwuQZlQOaHJzUWc1FxEE6kNhs',
  y: 'wQwlxsexe7-4J79qQmpuebyS4GmN0gqrPyN-XfpVAQA',
  receiptId: 'pwr_eb7e440aaff765e9d803c42d96c171c6',
  tain: 'tain_01M4YBT3FSPW08EWE0MGPN2WCT',
  nonce: 'WRfPcCqfujj3OOXHMoirn9VKbfhNf99gNeTHGXQ1SII',
  witnessed: '2026-10-14T23:26:25.273Z',
  tsrBytes: 4643,
  tsrSha256: 'd4213e71c60a1a23bdd0cade0f57288ef3fb096848127c6a6e779a26d0f8ea8c',
  rootSha256: '2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438',
  signerSha256: '8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467'
});
const sha = value => createHash('sha256').update(value).digest('hex');
function decode(text, encoding) {
  assert.equal(typeof text, 'string');
  assert(text.length > 0 && text.length < 100000);
  assert((encoding === 'base64url' ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9+/]+={0,2}$/).test(text));
  const bytes = Buffer.from(text, encoding);
  assert.equal(bytes.toString(encoding), text, 'Noncanonical encoding');
  return bytes;
}
const parsePart = text => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(decode(text, 'base64url')));
function utc(text) {
  assert.equal(typeof text, 'string');
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text));
  const value = Date.parse(text);
  assert(Number.isFinite(value));
  assert.equal(new Date(value).toISOString(), text);
  return value;
}

export function verifyPacket(packet) {
  const checks = [];
  const check = (name, run) => {
    try { run(); checks.push({name, status:'PASS'}); }
    catch { checks.push({name, status:'FAIL'}); }
  };
  let checkpoint, receipt, parts, signed, publicKey, tsr, demonstration;
  check('historical_sample_metadata', () => {
    assert.equal(packet.evaluation_only, true);
    assert.equal(packet.historical_evidence_date_utc, '2026-10-14');
    assert.equal(packet.new_payment_authorized, false);
  });
  check('exact_checkpoint_bytes_and_sha256', () => {
    assert.equal(packet.exact_checkpoint.encoding, 'base64url');
    checkpoint = decode(packet.exact_checkpoint.bytes, 'base64url');
    assert.equal(checkpoint.length, EXPECTED.checkpointBytes);
    assert.equal(packet.exact_checkpoint.byte_length, checkpoint.length);
    assert.equal(sha(checkpoint), EXPECTED.checkpointSha256);
    assert.equal(packet.exact_checkpoint.sha256_hex, EXPECTED.checkpointSha256);
    assert.equal(new TextDecoder('utf-8', {fatal:true}).decode(checkpoint), packet.exact_checkpoint.utf8_for_reading);
  });
  check('original_compact_jws_and_pinned_header', () => {
    const attestation = packet.popcorn_response.witness_attestation;
    assert.equal(attestation.format, 'JWS');
    assert.equal(attestation.algorithm, 'ES256');
    assert.equal(attestation.key_id, EXPECTED.kid);
    assert.equal(attestation.key_set, '/.well-known/popcorn-keys.json');
    assert.equal(typeof attestation.compact_jws, 'string');
    parts = attestation.compact_jws.split('.');
    assert.equal(parts.length, 3);
    assert.deepEqual(parsePart(parts[0]), {alg:'ES256', kid:EXPECTED.kid, typ:'popcorn-witness+jws'});
    signed = parsePart(parts[1]);
    assert.equal(decode(parts[2], 'base64url').length, 64);
    assert.equal(sha(attestation.compact_jws), EXPECTED.jwsSha256);
  });
  check('included_key_matches_retained_public_key', () => {
    assert(Array.isArray(packet.popcorn_public_keys.keys));
    const matches = packet.popcorn_public_keys.keys.filter(key => key.kid === EXPECTED.kid);
    assert.equal(matches.length, 1);
    const key = matches[0];
    assert.equal(key.kty, 'EC'); assert.equal(key.crv, 'P-256');
    assert.equal(key.alg, 'ES256'); assert.equal(key.use, 'sig');
    assert.equal(key.x, EXPECTED.x); assert.equal(key.y, EXPECTED.y);
    assert.equal(key.d, undefined);
    publicKey = createPublicKey({key, format:'jwk'});
  });
  const signatureValid = () => verifySignature('sha256', Buffer.from(parts[0]+'.'+parts[1], 'ascii'),
    {key:publicKey, dsaEncoding:'ieee-p1363'}, decode(parts[2], 'base64url'));
  check('es256_signature_over_original_encoded_parts', () => assert.equal(signatureValid(), true));
  check('outer_receipt_equals_signed_payload', () => {
    receipt = packet.popcorn_response.witness_receipt;
    assert(signed && typeof signed === 'object');
    assert.deepEqual(receipt, signed);
  });
  check('signed_historical_identity_and_issuance_fields', () => {
    assert.equal(signed.receipt_id, EXPECTED.receiptId); assert.equal(signed.tain, EXPECTED.tain);
    assert.equal(signed.node_id, '767-2676.com'); assert.equal(signed.protocol_id, 'POPCORN-WITNESS/2.0');
    assert.equal(signed.issuing_origin, 'https://767-2676.com'); assert.equal(signed.issuance_endpoint, '/v2/receipt');
    assert.equal(signed.tain_verification_uri, 'https://767-2676.com/v1/receipt/tain/'+EXPECTED.tain);
  });
  check('signed_digest_nonce_and_predecessor', () => {
    assert.equal(signed.commitment.payload_digest.algorithm, 'sha-256');
    assert.equal(signed.commitment.payload_digest.value, createHash('sha256').update(checkpoint).digest('base64url'));
    assert.equal(signed.commitment.nonce, EXPECTED.nonce);
    assert.equal(decode(signed.commitment.nonce, 'base64url').length, 32);
    assert.equal(signed.commitment.previous_attestation_digest, null);
  });
  check('signed_timestamp_and_interval_arithmetic', () => {
    assert.equal(signed.witnessed_at_utc, EXPECTED.witnessed);
    const received = utc(signed.request_received_at_utc), witnessed = utc(signed.witnessed_at_utc);
    const created = utc(signed.statement_created_at_utc), earliest = utc(signed.witness_window_utc.earliest);
    const latest = utc(signed.witness_window_utc.latest);
    assert.equal(signed.unix_time_milliseconds, witnessed);
    assert.equal(signed.clock_accuracy_radius_ms, 10000);
    assert.equal(earliest, witnessed-10000); assert.equal(latest, witnessed+10000);
    assert(received <= witnessed && witnessed <= created);
    assert.equal(signed.server_processing_duration_ms, witnessed-received);
    assert.equal(signed.post_witness_processing_duration_ms, created-witnessed);
  });
  check('signed_scope_does_not_grant_extra_proof', () => {
    const scope = signed.evidence_scope;
    assert.equal(scope.type, 'payload_commitment_witness');
    for (const field of ['caller_identity_proven','recipient_delivery_proven','action_execution_proven',
      'nonce_uniqueness_enforced','replay_prevented','authorization_granted',
      'external_atomic_clock_alignment_proven','clock_accuracy_independently_verified',
      'payer_authorization_bound_to_commitment']) assert.equal(scope[field], false);
  });
  check('retained_freetsa_files_match_sample_hashes_not_signature_verification', () => {
    assert.equal(packet.freetsa_timestamp_response.encoding, 'base64');
    tsr = decode(packet.freetsa_timestamp_response.bytes, 'base64');
    assert.equal(tsr.length, EXPECTED.tsrBytes);
    assert.equal(packet.freetsa_timestamp_response.byte_length, tsr.length);
    assert.equal(sha(tsr), EXPECTED.tsrSha256);
    assert.equal(packet.freetsa_timestamp_response.sha256_hex, EXPECTED.tsrSha256);
    assert.equal(sha(packet.freetsa_root_certificate_pem), EXPECTED.rootSha256);
    assert.equal(sha(packet.freetsa_signing_certificate_pem), EXPECTED.signerSha256);
  });
  check('deliberate_one_byte_change_breaks_binding_not_original_signature', () => {
    const changed = Buffer.from(checkpoint);
    changed[0] ^= 1;
    const alteredDigest = createHash('sha256').update(changed).digest('base64url');
    assert.notEqual(alteredDigest, signed.commitment.payload_digest.value);
    assert.equal(signatureValid(), true);
    demonstration = {byte_offset:0,operation:'XOR 1',original_byte:checkpoint[0],altered_byte:changed[0],
      altered_sha256_hex:sha(changed),altered_digest_matches_receipt:false,original_signature_still_valid:true};
  });
  const passed = checks.every(item => item.status === 'PASS');
  return {status:passed ? 'PASS' : 'FAIL', historical:true, sample_date:'2026-10-14',
    checks, ...(demonstration ? {one_byte_demonstration:demonstration} : {}),
    ...(passed ? {verified_sample:{checkpoint_bytes:checkpoint.length,checkpoint_sha256_hex:sha(checkpoint),
      receipt_id:receipt.receipt_id,witnessed_at_utc:receipt.witnessed_at_utc,
      issuer_asserted_interval:receipt.witness_window_utc,original_nonce_matches:true}} : {}),
    scope:{network_requests:0,payments:0,authorization_granted:false,
      key_trust:'Included public key matched this retained example; issuer trust was not established independently.',
      freetsa_rfc3161_signature_verified:false,
      independent_clock_accuracy_checked:false,revocation_checked:false,payment_settlement_checked:false,
      identity_proven:false,action_execution_proven:false,current_time_established:false},
    note:'The timestamp interval is internally consistent, not independently calibrated. FreeTSA files are retained unchanged for a separate native verifier. This checker is not a general production receipt validator.'};
}

export function verifyAndExtract(packet, outputDirectory) {
  const report = verifyPacket(packet);
  if (report.status !== 'PASS') return report;
  assert.equal(typeof outputDirectory, 'string');
  assert(outputDirectory.trim(), 'Supply a NEW output directory');
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, {mode:0o700}); // Fails if any file, directory or symlink already occupies this path.
  const checkpoint = decode(packet.exact_checkpoint.bytes, 'base64url');
  const changed = Buffer.from(checkpoint); changed[0] ^= 1;
  const files = {'checkpoint.txt':checkpoint,'checkpoint-tampered.txt':changed,
    'checkpoint.tsr':decode(packet.freetsa_timestamp_response.bytes, 'base64'),
    'freetsa-root.pem':packet.freetsa_root_certificate_pem,'freetsa-signer.pem':packet.freetsa_signing_certificate_pem};
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory,name),content,{flag:'wx',mode:0o600});
  report.extracted_files = Object.entries(files).map(([name,content])=>({name,bytes:Buffer.byteLength(content),sha256:sha(content)}));
  fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 4, 'Usage: node verifier.mjs packet.json NEW-output-directory');
    assert(fs.statSync(process.argv[2]).size <= 1000000, 'Sample file exceeds 1 MB');
    const packet = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const report = verifyAndExtract(packet,process.argv[3]);
    console.log(JSON.stringify(report,null,2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({status:'FAIL',error:error.code || error.message,
      network_requests:0,payments:0,authorization_granted:false}));
    process.exitCode = 1;
  }
}
```

### What the checks establish

The two signatures bind the same checkpoint digest under the included verification material. FreeTSA records `2026-10-14T23:24:34Z`; POPCORN records `2026-10-14T23:26:25.273Z`, with an issuer-asserted interval from `23:26:15.273Z` to `23:26:35.273Z`. The checker confirms the POPCORN fields and interval arithmetic agree. It does not independently establish clock accuracy.

These are separate timestamp events. FreeTSA does not countersign the POPCORN receipt, and the 111.273-second difference is not a clock-calibration measurement. The FreeTSA token specifies no accuracy bound; the POPCORN ten-second radius is issuer-asserted.

Offline verification with included keys establishes consistency under those keys. Independently trusting an issuer is a separate step. The source addresses are printed in the packet so you can compare the public keys and certificates with their issuers. These commands do not check certificate revocation, blockchain settlement or the original FreeTSA request nonce.

The example does not prove the checkpoint text is true, who created it, that an action ran, that a recipient received it, or that anyone had permission to act. It has no execution window and grants no authorization. Its timestamps are historical; they do not establish the current time.

### When you need a fresh receipt

Keep this example and repeat the checks on another computer. When your own work needs a fresh checkpoint, keep the work with you and send its hash with a fresh nonce. A new POPCORN receipt costs **$0.001 USDC on Base—one tenth of one cent**. A paid request requires your owner’s explicit approval for that call and payment. This example authorizes no new payment. Checking an existing receipt is free.

This example includes a separate FreeTSA timestamp. A new POPCORN receipt does not automatically include one.

**The full operating instructions and reference material follow.**
