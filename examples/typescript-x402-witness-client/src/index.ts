import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

import type {
  JsonWebKeySet,
  PopcornWitnessResponse,
} from "../../../verify/typescript/src/index.js";
import {
  buildPortableOutcome,
  createWitnessRequest,
  DEFAULT_JWKS_URL,
  DEFAULT_SERVICE_URL,
  parseScheduleWindow,
  readExactBytes,
  type PaymentExchange,
} from "./carrier.js";

type Arguments = {
  schedule?: string;
  scheduleUrl?: string;
  out?: string;
  dryRun: boolean;
};

function parseArguments(argv: string[]): Arguments {
  const result: Arguments = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      result.dryRun = true;
    } else if (
      value === "--schedule" ||
      value === "--schedule-url" ||
      value === "--out"
    ) {
      const next = argv[index + 1];
      if (!next) throw new Error(`${value} requires a value`);
      if (value === "--schedule") result.schedule = next;
      if (value === "--schedule-url") result.scheduleUrl = next;
      if (value === "--out") result.out = next;
      index += 1;
    } else {
      throw new Error(`unsupported argument: ${value}`);
    }
  }
  if ((result.schedule ? 1 : 0) + (result.scheduleUrl ? 1 : 0) !== 1) {
    throw new Error("provide exactly one --schedule FILE or --schedule-url HTTPS_URL");
  }
  if (!result.dryRun && !result.out) {
    throw new Error("paid mode requires --out so the portable outcome is retained");
  }
  return result;
}

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const serviceUrl = process.env.POPCORN_WITNESS_URL ?? DEFAULT_SERVICE_URL;
  const keySetUrl = process.env.POPCORN_JWKS_URL ?? DEFAULT_JWKS_URL;
  const scheduleBytes = await readExactBytes(args.schedule ?? args.scheduleUrl!);
  const executionWindowUtc = parseScheduleWindow(scheduleBytes);
  const nonce = randomBytes(32).toString("base64url");
  const request = await createWitnessRequest(scheduleBytes, nonce);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          payment_sent: false,
          service_url: serviceUrl,
          schedule_byte_length: scheduleBytes.byteLength,
          execution_window_utc: executionWindowUtc,
          proposed_request: request,
        },
        null,
        2,
      ),
    );
    return;
  }

  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Set EVM_PRIVATE_KEY to a dedicated Base EVM private key");
  }

  const observed: Partial<PaymentExchange> = {};
  const recordingFetch: typeof fetch = async (input, init) => {
    const requestHeaders = mergedHeaders(input, init);
    const paymentSignature = requestHeaders.get("payment-signature");
    const response = await fetch(input, init);
    if (response.status === 402) {
      const paymentRequired = response.headers.get("payment-required");
      if (paymentRequired) observed.payment_required = paymentRequired;
    }
    if (paymentSignature) observed.payment_signature = paymentSignature;
    const paymentResponse = response.headers.get("payment-response");
    if (paymentResponse) observed.payment_response = paymentResponse;
    return response;
  };

  const signer = privateKeyToAccount(privateKey as `0x${string}`);
  const client = new x402Client()
    .register("eip155:*", new ExactEvmScheme(signer))
    .setSpendControls({ maxAmountPerPayment: "$0.001" });
  const fetchWithPayment = wrapFetchWithPayment(recordingFetch, client);
  const response = await fetchWithPayment(serviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`POPCORN witness request failed with HTTP ${response.status}`);
  }
  if (
    !observed.payment_required ||
    !observed.payment_signature ||
    !observed.payment_response
  ) {
    throw new Error("x402 exchange did not expose a complete payment transcript");
  }

  const body = (await response.json()) as PopcornWitnessResponse;
  const jwksResponse = await fetch(keySetUrl, { cache: "no-store" });
  if (!jwksResponse.ok) {
    throw new Error(`JWKS request failed with HTTP ${jwksResponse.status}`);
  }
  const jwks = (await jwksResponse.json()) as JsonWebKeySet;
  const outcome = await buildPortableOutcome({
    serviceUrl,
    keySetUrl,
    scheduleBytes,
    submittedRequest: request,
    paidEvidence: body,
    paymentExchange: observed as PaymentExchange,
    jwks,
  });
  await writeFile(args.out!, `${JSON.stringify(outcome, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(
    JSON.stringify(
      {
        outcome_file: args.out,
        receipt_id: outcome.paid_evidence.witness_receipt.receipt_id,
        payload_digest: outcome.schedule.payload_digest.value,
        decision: outcome.reported_judgment.decision,
        authorization_granted: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
