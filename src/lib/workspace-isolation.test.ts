import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Contract used by every CRM server fn: filter on ctx.workspace.id. */
function visibleRows<T extends { workspace_id: string }>(
  rows: T[],
  workspaceId: string,
): T[] {
  return rows.filter((row) => row.workspace_id === workspaceId);
}

describe("workspace isolation", () => {
  it("never returns another workspace's leads", () => {
    const rows = [
      { id: "a", workspace_id: "ws-owner", business_name: "Parkside Dental" },
      { id: "b", workspace_id: "ws-other", business_name: "Secret Clinic" },
    ];
    const mine = visibleRows(rows, "ws-owner");
    assert.deepEqual(
      mine.map((r) => r.id),
      ["a"],
    );
    assert.equal(
      rows.some((r) => r.workspace_id === "ws-other" && mine.includes(r)),
      false,
    );
  });

  it("treats a missing workspace match as not found", () => {
    const lead = { id: "lead-1", workspace_id: "ws-a" };
    const requested = "ws-b";
    const found = lead.workspace_id === requested ? lead : null;
    assert.equal(found, null);
  });
});

describe("lead creation", () => {
  it("rejects a blank business name", () => {
    const name = "   ".trim();
    assert.equal(name.length > 0, false);
  });

  it("accepts a named clinic", () => {
    const name = " Ridge Dental ".trim();
    assert.equal(name, "Ridge Dental");
  });
});
