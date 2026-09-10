import { describe, expect, it } from "vitest";

import { roleLabel } from "@/lib/spaces/role-label";

describe("roleLabel", () => {
  it("labels Owner, Editor, and Read-only", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("editor")).toBe("Editor");
    expect(roleLabel("read-only")).toBe("Read-only");
  });
});
