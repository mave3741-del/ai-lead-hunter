import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyHttpError,
  isRetryable,
  MAX_AI_RETRIES,
  withRetries,
} from "./retry.ts";

describe("AI retry policy", () => {
  it("retries 429, 5xx, timeout, network", () => {
    assert.equal(isRetryable({ kind: "http", status: 429 }), true);
    assert.equal(isRetryable({ kind: "http", status: 500 }), true);
    assert.equal(isRetryable({ kind: "http", status: 502 }), true);
    assert.equal(isRetryable({ kind: "http", status: 503 }), true);
    assert.equal(isRetryable({ kind: "http", status: 504 }), true);
    assert.equal(isRetryable({ kind: "timeout" }), true);
    assert.equal(isRetryable({ kind: "network" }), true);
  });
  it("does not retry auth, malformed, unsafe, config", () => {
    assert.equal(isRetryable({ kind: "invalid_key" }), false);
    assert.equal(isRetryable({ kind: "malformed" }), false);
    assert.equal(isRetryable({ kind: "unsafe_url" }), false);
    assert.equal(isRetryable({ kind: "invalid_config" }), false);
    assert.equal(isRetryable({ kind: "http", status: 401 }), false);
    assert.equal(classifyHttpError(401).kind, "invalid_key");
    assert.equal(classifyHttpError(400, "bad json").kind, "malformed");
  });
  it("retries a limited number of times then throws", async () => {
    let n = 0;
    await assert.rejects(
      () =>
        withRetries(
          async () => {
            n += 1;
            throw Object.assign(new Error("429"), { failure: { kind: "http", status: 429 } });
          },
          { maxRetries: MAX_AI_RETRIES },
        ),
      /429/,
    );
    assert.equal(n, MAX_AI_RETRIES + 1);
  });
  it("does not retry non-retryable errors", async () => {
    let n = 0;
    await assert.rejects(
      () =>
        withRetries(async () => {
          n += 1;
          throw Object.assign(new Error("Unauthorized"), { failure: { kind: "invalid_key" } });
        }),
      /Unauthorized/,
    );
    assert.equal(n, 1);
  });
});
