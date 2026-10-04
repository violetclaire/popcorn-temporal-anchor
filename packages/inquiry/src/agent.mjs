/** Participant-local agent driver. This is not an authenticated public RPC server. */
export const MAX_REQUEST_BYTES = 64 * 1024;

const identifier = { type: 'string', minLength: 1, maxLength: 256 };
const objectValue = { type: 'object' };
const envelope = { type: 'object', minProperties: 1 };
const params = (properties = {}, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});

const definitions = [
  ['tools.list', 'List methods, parameter schemas, and side effects.', params(), 'none'],
  ['providers.search', 'Find providers through the configured discovery callback. Results remain subject to participant trust and listing validation.', params({ query: params({ capabilities: { type: 'array', maxItems: 64, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } }, text: { type: 'string', minLength: 1, maxLength: 512 } }, ['capabilities']) }), 'read'],
  ['providers.inspect', 'Read the selected provider listing and its terms through the configured inspection callback.', params({ listing_id: identifier }), 'read'],
  ['inquiry.submit', 'Submit a signed inquiry envelope. Returning a receipt does not acknowledge requester receipt delivery.', params({ envelope }), 'write'],
  ['inquiry.status', 'Read participant-local inquiry state, including whether receipt delivery remains unconfirmed.', params({ inquiry_id: identifier }), 'read'],
  ['receipt.acknowledge', 'Verify and record a requester-signed receipt acknowledgment. Transport success alone is insufficient.', params({ ack: envelope }), 'write'],
  ['receipt.retry', 'Explicitly retry receipt delivery using the configured transport.', params({ inquiry_id: identifier }), 'delivery'],
  ['notification.retry', 'Explicitly retry an optional notification through its separate bounded outbox. Notification delivery never substitutes for signed receipt acknowledgment.', params({ inquiry_id: identifier }), 'delivery'],
  ['inquiry.respond', 'Record a witnessed acceptance, referral, or decline. The participant validates referral participants and provenance.', params({ inquiry_id: identifier, decision: { type: 'string', enum: ['accept', 'refer', 'decline'] }, reason: { type: 'string', maxLength: 2048 }, referral: objectValue }, ['inquiry_id', 'decision']), 'write'],
  ['terms.freeze', 'Verify a signed agreement to freeze the exact terms. This does not initiate provider payment.', params({ envelope }), 'write'],
  ['payment.pay', 'Explicitly request payment under the frozen terms through the configured payment adapter. May spend funds; requires caller authorization and participant policy.', params({ inquiry_id: identifier }), 'payment'],
  ['payment.reconcile', 'Resolve the status of an existing payment attempt through the configured adapter without creating a new provider payment request.', params({ inquiry_id: identifier }), 'reconciliation'],
  ['work.complete', 'Record provider completion evidence and a SHA-256 result digest (64 lowercase hex characters). Completion still requires the requester-signed closing acknowledgment.', params({ inquiry_id: identifier, result_digest: { type: 'string', minLength: 64, maxLength: 64, pattern: '^[a-f0-9]{64}$' }, evidence: objectValue }), 'write'],
  ['work.close', 'Verify and record the requester-signed completion acknowledgment.', params({ ack: envelope }), 'write'],
];

const witnessMethods = new Set(['inquiry.submit', 'inquiry.respond', 'terms.freeze', 'payment.pay', 'payment.reconcile', 'work.complete']);
const tools = definitions.map(([name, description, inputSchema, effect]) => {
  const mayChargeWitnessFee = witnessMethods.has(name);
  return {
    name,
    description: description + (mayChargeWitnessFee ? ' May incur witness fees through the configured witness adapter; its authorization policy must cover those fees.' : ''),
    inputSchema,
    sideEffects: {
      readOnly: effect === 'read' || effect === 'none',
      changesState: !['read', 'none'].includes(effect),
      maySendExternalRequest: ['read', 'delivery', 'payment', 'reconciliation', 'write'].includes(effect),
      maySpendFunds: effect === 'payment' || mayChargeWitnessFee,
      mayChargeProvider: effect === 'payment',
      mayChargeWitnessFee,
      requiresExplicitAuthorization: !['read', 'none'].includes(effect),
    },
  };
});
const schemas = new Map(tools.map(tool => [tool.name, tool.inputSchema]));

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validateJson(value, depth = 0, budget = { nodes: 0, bytes: 0 }) {
  if (depth > 24 || ++budget.nodes > 8192) fail('INVALID_REQUEST', 'Request nesting or item count exceeds the limit.');
  const charge = bytes => {
    budget.bytes += bytes;
    if (budget.bytes > MAX_REQUEST_BYTES) fail('REQUEST_TOO_LARGE', 'Request exceeds the 65536-byte limit.');
  };
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string' && value.length <= 32768) { charge(Buffer.byteLength(value, 'utf8')); return; }
  if (Array.isArray(value)) {
    if (value.length > 512) fail('INVALID_REQUEST', 'An array exceeds the 512-item limit.');
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail('INVALID_REQUEST', 'Invalid array properties.');
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('INVALID_REQUEST', 'Arrays must contain JSON values without accessors or holes.');
      validateJson(descriptor.value, depth + 1, budget);
    }
    return;
  }
  if (plainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > 512 || Reflect.ownKeys(value).length !== keys.length) fail('INVALID_REQUEST', 'Invalid object properties.');
    for (const key of keys) {
      if (key.length > 256) fail('INVALID_REQUEST', 'An object key exceeds the limit.');
      charge(Buffer.byteLength(key, 'utf8'));
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('INVALID_REQUEST', 'Accessors are not JSON values.');
      validateJson(descriptor.value, depth + 1, budget);
    }
    return;
  }
  fail('INVALID_REQUEST', 'Request must contain only bounded JSON values.');
}

function matches(value, schema) {
  if (schema.anyOf) return schema.anyOf.some(candidate => matches(value, candidate));
  if (schema.type === 'object') {
    if (!plainObject(value)) return false;
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) return false;
    if (schema.required?.some(key => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && keys.some(key => !Object.hasOwn(schema.properties, key))) return false;
    return !schema.properties || keys.every(key => !Object.hasOwn(schema.properties, key) || matches(value[key], schema.properties[key]));
  }
  if (schema.type === 'array') return Array.isArray(value)
    && value.length <= (schema.maxItems ?? 512)
    && (!schema.uniqueItems || new Set(value).size === value.length)
    && (!schema.items || value.every(item => matches(item, schema.items)));
  if (schema.type === 'string') return typeof value === 'string'
    && value.length >= (schema.minLength ?? 0)
    && value.length <= (schema.maxLength ?? 32768)
    && (!schema.pattern || new RegExp(schema.pattern).test(value))
    && (!schema.enum || schema.enum.includes(value));
  return false;
}

function validId(value) {
  return (typeof value === 'string' && value.length > 0 && value.length <= 128)
    || (typeof value === 'number' && Number.isSafeInteger(value));
}

/** Return a fresh copy so a caller cannot mutate the validation schemas. */
export function listTools() {
  return structuredClone(tools);
}

/** One explicitly requested operation produces one result; no inferred follow-up actions. */
export function createAgent({ participant, search, inspect } = {}) {
  if (!participant || typeof participant !== 'object') throw new TypeError('A participant is required.');
  if (typeof search !== 'function' || typeof inspect !== 'function') throw new TypeError('Discovery search and inspect callbacks are required.');

  const invoke = async (name, ...args) => {
    if (typeof participant[name] !== 'function') fail('METHOD_UNAVAILABLE', 'The participant does not implement this method.');
    return participant[name](...args);
  };

  return {
    async handle(request) {
      let id = null;
      try {
        validateJson(request);
        if (!plainObject(request) || !Object.hasOwn(request, 'id') || !validId(request.id)) fail('INVALID_REQUEST', 'Request requires an id (a nonempty string up to 128 characters or a safe integer).');
        id = request.id;
        if (Object.keys(request).some(key => !['id', 'method', 'params'].includes(key))
          || !Object.hasOwn(request, 'method') || typeof request.method !== 'string' || request.method.length > 128) {
          fail('INVALID_REQUEST', 'Request must contain only id, method, and optional params.');
        }
        if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_REQUEST_BYTES) fail('REQUEST_TOO_LARGE', 'Request exceeds the 65536-byte limit.');
        const schema = schemas.get(request.method);
        if (!schema) fail('METHOD_NOT_FOUND', 'Unknown method. Call tools.list for supported methods.');
        const p = Object.hasOwn(request, 'params') ? request.params : {};
        if (!matches(p, schema)) fail('INVALID_PARAMS', `Invalid parameters for ${request.method}. Call tools.list for its schema.`);

        let result;
        switch (request.method) {
          case 'tools.list': result = { tools: listTools() }; break;
          case 'providers.search': result = await search(p.query); break;
          case 'providers.inspect': result = await inspect(p.listing_id); break;
          case 'inquiry.submit': result = await invoke('submit', p.envelope); break;
          case 'inquiry.status': result = await invoke('status', p.inquiry_id); break;
          case 'receipt.acknowledge': result = await invoke('acknowledge', p.ack); break;
          case 'receipt.retry': result = await invoke('retryReceipt', p.inquiry_id); break;
          case 'notification.retry': result = await invoke('retryNotification', p.inquiry_id); break;
          case 'inquiry.respond': result = await invoke('respond', p); break;
          case 'terms.freeze': result = await invoke('freeze', p.envelope); break;
          case 'payment.pay': result = await invoke('pay', p.inquiry_id); break;
          case 'payment.reconcile': result = await invoke('reconcilePayment', p.inquiry_id); break;
          case 'work.complete': result = await invoke('complete', p); break;
          case 'work.close': result = await invoke('close', p.ack); break;
        }
        // Undefined is not a JSON result, but void-returning configured adapters may use it.
        return { id, result: result === undefined ? null : result };
      } catch (error) {
        const coded = typeof error?.code === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(error.code);
        return { id, error: {
          code: coded ? error.code : 'INTERNAL_ERROR',
          message: coded && typeof error.message === 'string' ? error.message.slice(0, 2048) : 'Operation failed.',
        } };
      }
    },
  };
}
