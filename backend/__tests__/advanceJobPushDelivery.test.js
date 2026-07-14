import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAqPushQueueAdapter } from "../lib/advanceJobPushDelivery.js";

describe("createAqPushQueueAdapter", () => {
  it("enqueues payload on Bull push queue when available", async () => {
    let added = null;
    const pushQueue = {
      add: async (payload, opts) => {
        added = { payload, opts };
        return { id: "job-1" };
      },
    };
    const adapter = createAqPushQueueAdapter(null, pushQueue);
    await adapter.add(
      "push-notifications",
      {
        user_id: "user-1",
        title: "Talent ส่งงานแล้ว",
        deep_link: "/job-board/j1/manage?tab=escrow",
        type: "advance_job_work_submitted",
      },
      { removeOnComplete: 100 },
    );
    assert.equal(added.payload.user_id, "user-1");
    assert.equal(added.payload.deep_link, "/job-board/j1/manage?tab=escrow");
    assert.equal(added.opts.removeOnComplete, 100);
  });
});
