import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreAdvanceSmartMatchJobs,
  suggestCategoryFromHistory,
} from "../../mobile/utils/jobBoardSmartMatchScoring.js";

describe("suggestCategoryFromHistory", () => {
  it("prefers application categories over saved jobs", () => {
    const cat = suggestCategoryFromHistory(
      [{ category: "design" }, { category: "design" }],
      [{ category: "dev" }, { category: "dev" }, { category: "dev" }],
    );
    assert.equal(cat, "design");
  });
});

describe("scoreAdvanceSmartMatchJobs", () => {
  it("uses categoryHistory label when job matches application history", () => {
    const [top] = scoreAdvanceSmartMatchJobs({
      jobs: [
        {
          id: "j1",
          category: "design",
          status: "open",
          max_budget: 5000,
          target_province: "กรุงเทพมหานคร",
        },
      ],
      applications: [{ category: "design" }],
      savedJobs: [],
      savedIds: new Set(),
      appliedJobIds: new Set(),
      profileProvinces: ["กรุงเทพมหานคร"],
      routingCategories: [],
      reasonLabels: {
        categoryHistory: "หมวดที่คุณสนใจ",
        profileProvince: "จังหวัดโปรไฟล์",
      },
    });
    assert.ok(top);
    assert.ok(top.reasons.includes("หมวดที่คุณสนใจ"));
  });
});
