import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLeadCsv } from "./csv.ts";

describe("CSV import", () => {
  it("parses named columns", () => {
    const r = parseLeadCsv("business_name,website,city,state\nOak Dental,https://oak.example,Austin,TX");
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0]?.business_name, "Oak Dental");
    assert.equal(r.rows[0]?.city, "Austin");
  });
  it("rejects missing name column", () => {
    const r = parseLeadCsv("website\nhttps://x.example");
    assert.equal(r.rows.length, 0);
    assert.ok(r.errors[0]?.includes("business_name"));
  });
});
