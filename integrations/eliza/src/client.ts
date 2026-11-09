import { randomUUID } from "node:crypto";
import * as core from "@violetclaire/popcorn-mcp/core";
import { popcornHandoff, popcornSample } from "@violetclaire/popcorn-mcp/sample";

export type HashInput = Parameters<typeof core.popcornHash>[0];
export type VerifyInput = Parameters<typeof core.popcornVerify>[0];
export type WitnessInput = Omit<Parameters<typeof core.popcornWitness>[0], "approve_payment">;
export type PaymentQuote = core.PaymentDryRun;
export type PopcornCore = Pick<typeof core,
  "popcornCatalog" | "popcornHash" | "popcornVerify" | "popcornWitness">;

export interface PaymentApprovalRequest {
  readonly request_id: string;
  readonly operation: "witness";
  readonly input: Readonly<WitnessInput>;
  readonly quote: PaymentQuote;
  readonly payment: {
    readonly amount_atomic: string;
    readonly asset: string;
    readonly network: string;
    readonly pay_to: string;
  };
}

export type PaymentApproval = { approved: true; request_id: string } | { approved: false };

export interface PopcornClientOptions {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Trusted application code. Never derive approval solely from model output. */
  authorizePayment?: (request: PaymentApprovalRequest) => Promise<PaymentApproval>;
}

export interface PopcornClient {
  sample: typeof popcornSample;
  handoff: typeof popcornHandoff;
  catalog(): ReturnType<typeof core.popcornCatalog>;
  hash(input: HashInput): ReturnType<typeof core.popcornHash>;
  verify(input: VerifyInput): ReturnType<typeof core.popcornVerify>;
  quoteWitness(input: WitnessInput): Promise<PaymentQuote>;
  requestWitness(input: WitnessInput): Promise<
    Awaited<ReturnType<typeof core.popcornWitness>> |
    { payment_sent: false; approval_required: true; quote: PaymentQuote }
  >;
}

function freezeRecursively<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeRecursively(child);
    Object.freeze(value);
  }
  return value;
}

function normalizeWitness(input: WitnessInput): WitnessInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("witness input must be an object");
  }
  const allowed = new Set(["digest", "nonce", "previous_attestation_digest"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error("witness input accepts only digest, nonce and previous_attestation_digest; payment approval is a host operation");
  }
  if (typeof input.digest !== "string" || typeof input.nonce !== "string") {
    throw new Error("witness input requires digest and nonce strings");
  }
  if (input.previous_attestation_digest !== undefined &&
      input.previous_attestation_digest !== null &&
      typeof input.previous_attestation_digest !== "string") {
    throw new Error("previous_attestation_digest must be a string or null");
  }
  return {
    digest: input.digest,
    nonce: input.nonce,
    ...(input.previous_attestation_digest === undefined ? {} : {
      previous_attestation_digest: input.previous_attestation_digest,
    }),
  };
}

/** Host API. Supplying a key alone never enables spending. */
export function createPopcornClient(
  options: PopcornClientOptions = {},
  implementation: PopcornCore = core,
): PopcornClient {
  const dependencies = { fetch: options.fetch, env: options.env };
  const quoteWitness = async (input: WitnessInput): Promise<PaymentQuote> => {
    const result = await implementation.popcornWitness(
      { ...normalizeWitness(input), approve_payment: false }, dependencies,
    );
    if (result.payment_sent !== false) throw new Error("expected a no-payment witness quote");
    return result as PaymentQuote;
  };

  return {
    sample: popcornSample,
    handoff: popcornHandoff,
    catalog: () => implementation.popcornCatalog(options.fetch),
    hash: (input: HashInput) => implementation.popcornHash(input),
    verify: (input: VerifyInput) => implementation.popcornVerify(input),
    quoteWitness,
    /** Deliberately absent from the ElizaOS action list. No automatic retries. */
    async requestWitness(input: WitnessInput) {
      const fixedInput = normalizeWitness(input);
      const quote = await quoteWitness(fixedInput);
      if (!options.authorizePayment) {
        return { payment_sent: false as const, approval_required: true, quote };
      }
      const request = freezeRecursively({
        request_id: randomUUID(),
        operation: "witness" as const,
        input: fixedInput,
        quote: structuredClone(quote),
        payment: {
          amount_atomic: core.POPCORN_PRICE_ATOMIC,
          asset: core.POPCORN_USDC,
          network: core.POPCORN_NETWORK,
          pay_to: core.POPCORN_PAY_TO,
        },
      });
      const approval = await options.authorizePayment(request);
      if (!approval || approval.approved !== true || approval.request_id !== request.request_id) {
        return { payment_sent: false as const, approval_required: true, quote };
      }
      // Core rechecks the challenge and its locked amount/asset/network/payee policy.
      return implementation.popcornWitness({ ...fixedInput, approve_payment: true }, dependencies);
    },
  };
}
