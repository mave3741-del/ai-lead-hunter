import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlockedIp, parsePublicHttpUrl } from "./url-safety.ts";

describe("URL validation", () => {
  it("accepts public https URLs", () => {
    const r = parsePublicHttpUrl("https://brightsmile.example/contact");
    assert.equal(r.ok, true);
  });
  it("adds https when missing", () => {
    const r = parsePublicHttpUrl("example.com");
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.url.protocol, "https:");
  });
  it("rejects non-http schemes", () => {
    assert.equal(parsePublicHttpUrl("ftp://example.com").ok, false);
    assert.equal(parsePublicHttpUrl("file:///etc/passwd").ok, false);
    assert.equal(parsePublicHttpUrl("javascript:alert(1)").ok, false);
  });
  it("rejects credentials", () => {
    assert.equal(parsePublicHttpUrl("https://user:pass@example.com").ok, false);
  });
  it("rejects localhost and metadata", () => {
    assert.equal(parsePublicHttpUrl("http://localhost/admin").ok, false);
    assert.equal(parsePublicHttpUrl("http://127.0.0.1/").ok, false);
    assert.equal(parsePublicHttpUrl("http://0.0.0.0/").ok, false);
    assert.equal(parsePublicHttpUrl("http://[::1]/").ok, false);
    assert.equal(parsePublicHttpUrl("http://169.254.169.254/latest/meta-data").ok, false);
    assert.equal(parsePublicHttpUrl("http://metadata.google.internal/").ok, false);
  });
  it("rejects private ranges", () => {
    assert.equal(parsePublicHttpUrl("http://10.0.0.8/").ok, false);
    assert.equal(parsePublicHttpUrl("http://192.168.1.1/").ok, false);
    assert.equal(parsePublicHttpUrl("http://172.16.5.1/").ok, false);
    assert.equal(parsePublicHttpUrl("http://0.0.0.0/").ok, false);
    assert.equal(parsePublicHttpUrl("http://[fd12:3456::1]/").ok, false);
    assert.equal(parsePublicHttpUrl("http://[fe80::1]/").ok, false);
  });
});

describe("IP denylist", () => {
  it("blocks loopback, link-local, unique-local, multicast", () => {
    assert.equal(isBlockedIp("127.0.0.1"), true);
    assert.equal(isBlockedIp("169.254.1.1"), true);
    assert.equal(isBlockedIp("::1"), true);
    assert.equal(isBlockedIp("fc00::1"), true);
    assert.equal(isBlockedIp("fe80::1"), true);
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("1.1.1.1"), false);
  });
});
