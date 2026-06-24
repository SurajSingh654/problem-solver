import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted mock state — toggled per test
const prismaMock = vi.hoisted(() => ({
  embeddingOutbox: {
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  default: prismaMock,
}));

const embeddingServiceMock = vi.hoisted(() => ({
  embedSolution: vi.fn(),
  embedProblem: vi.fn(),
  embedNote: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

// Import AFTER mocks are registered
const outbox = await import("../../src/services/embedding.outbox.js");
const {
  enqueueEmbedding,
  processOutboxBatch,
  startOutboxScheduler,
  stopOutboxScheduler,
} = outbox;

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks: claim returns empty, embed fns return truthy embeddings
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);
  prismaMock.embeddingOutbox.upsert.mockResolvedValue({});
  prismaMock.embeddingOutbox.update.mockResolvedValue({});
  prismaMock.embeddingOutbox.delete.mockResolvedValue({});
  embeddingServiceMock.embedSolution.mockResolvedValue([0.1, 0.2]);
  embeddingServiceMock.embedProblem.mockResolvedValue([0.1, 0.2]);
  embeddingServiceMock.embedNote.mockResolvedValue([0.1, 0.2]);
});

afterEach(() => {
  stopOutboxScheduler(); // belt-and-braces; tests that start it should also stop it
});

describe("enqueueEmbedding", () => {
  it("test 1: happy path creates a PENDING row via upsert", async () => {
    await enqueueEmbedding("Solution", "sol_123", "OAI 503");
    expect(prismaMock.embeddingOutbox.upsert).toHaveBeenCalledTimes(1);
    const call = prismaMock.embeddingOutbox.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      entityType_entityId: { entityType: "Solution", entityId: "sol_123" },
    });
    expect(call.create.status).toBe("PENDING");
    expect(call.create.attempts).toBe(0);
    expect(call.create.entityType).toBe("Solution");
    expect(call.create.entityId).toBe("sol_123");
    expect(call.create.lastError).toBe("OAI 503");
    expect(call.update.status).toBe("PENDING");
    expect(call.update.attempts).toBe(0);
    expect(call.update.lastError).toBe("OAI 503");
  });

  it("test 2: idempotent — re-enqueue same (type, id) resets via update branch", async () => {
    await enqueueEmbedding("Note", "note_abc", "first failure");
    await enqueueEmbedding("Note", "note_abc", "second failure");
    expect(prismaMock.embeddingOutbox.upsert).toHaveBeenCalledTimes(2);
    const secondCall = prismaMock.embeddingOutbox.upsert.mock.calls[1][0];
    expect(secondCall.update.attempts).toBe(0);
    expect(secondCall.update.status).toBe("PENDING");
    expect(secondCall.update.lastError).toBe("second failure");
    // nextRetryAt is bumped to "now()" — within 2 sec of test start
    const nextRetry = new Date(secondCall.update.nextRetryAt).getTime();
    expect(Math.abs(nextRetry - Date.now())).toBeLessThan(2000);
  });

  it("test 3: enqueue self-failure is logged CRITICAL and does not throw", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.embeddingOutbox.upsert.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      enqueueEmbedding("Solution", "sol_x", "OAI 503"),
    ).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[embedding-outbox:CRITICAL]"),
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("processOutboxBatch", () => {
  const SOL_ROW = {
    id: "outbox_1",
    entityType: "Solution",
    entityId: "sol_1",
    status: "PENDING",
    attempts: 0,
    lastError: null,
    nextRetryAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("test 4: claims only PENDING + due rows (claim SQL shape)", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await processOutboxBatch();
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/status\s*=\s*'PENDING'/);
    expect(sql).toMatch(/"nextRetryAt"\s*<=\s*\$1/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/UPDATE embedding_outbox/);
  });

  it("test 5: batch size respected (LIMIT in claim SQL)", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await processOutboxBatch({ batchSize: 7 });
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    // batchSize is the 3rd argument passed to $queryRawUnsafe after sql, now, staleThreshold
    expect(args[3]).toBe(7);
  });

  it("test 6: stale-RUNNING reclaim — SQL includes RUNNING + age threshold", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await processOutboxBatch();
    const [sql] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/status\s*=\s*'RUNNING'/);
    expect(sql).toMatch(/"updatedAt"\s*<\s*\$2/);
  });

  it("test 7: successful embed deletes the row and logs success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([SOL_ROW]);
    embeddingServiceMock.embedSolution.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    const result = await processOutboxBatch();
    expect(prismaMock.embeddingOutbox.delete).toHaveBeenCalledWith({
      where: { id: "outbox_1" },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[embedding-outbox:success]"),
    );
    expect(result.succeeded).toBe(1);
    logSpy.mockRestore();
  });

  it("test 8: failed embed bumps attempts and reschedules per backoff", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ ...SOL_ROW, attempts: 0 }]);
    embeddingServiceMock.embedSolution.mockResolvedValueOnce(null);
    // checkEntityExists query — entity DOES exist → not orphan
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ "?column?": 1 }]);
    const result = await processOutboxBatch();
    expect(prismaMock.embeddingOutbox.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.embeddingOutbox.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "outbox_1" });
    expect(updateArg.data.attempts).toBe(1);
    expect(updateArg.data.status).toBe("PENDING");
    expect(updateArg.data.lastError).toBe("embed returned null");
    // nextRetryAt ≈ now + 60_000 (first backoff step)
    const delay = new Date(updateArg.data.nextRetryAt).getTime() - Date.now();
    expect(delay).toBeGreaterThan(59_000);
    expect(delay).toBeLessThan(61_500);
    expect(result.failed).toBe(1);
    logSpy.mockRestore();
  });

  it("test 9: max attempts → status FAILED, row preserved", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Row has already failed 4 times; this is attempt 5 = MAX_ATTEMPTS
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ ...SOL_ROW, attempts: 4 }]);
    embeddingServiceMock.embedSolution.mockResolvedValueOnce(null);
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ "?column?": 1 }]);
    await processOutboxBatch();
    expect(prismaMock.embeddingOutbox.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.embeddingOutbox.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("FAILED");
    expect(updateArg.data.attempts).toBe(5);
    // delete NOT called — FAILED rows persist
    expect(prismaMock.embeddingOutbox.delete).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[embedding-outbox:failed]"),
    );
    logSpy.mockRestore();
  });

  it("test 10: orphan self-heal — entity not found → delete row", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([SOL_ROW]);
    embeddingServiceMock.embedSolution.mockResolvedValueOnce(null);
    // checkEntityExists — entity GONE
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    const result = await processOutboxBatch();
    expect(prismaMock.embeddingOutbox.delete).toHaveBeenCalledWith({
      where: { id: "outbox_1" },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[embedding-outbox:orphan]"),
    );
    expect(result.orphaned).toBe(1);
    logSpy.mockRestore();
  });

  it("test 11: one bad job does not poison the batch", async () => {
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ROWS = [
      { ...SOL_ROW, id: "ob_1", entityId: "sol_1" },
      { ...SOL_ROW, id: "ob_2", entityId: "sol_2" },
      { ...SOL_ROW, id: "ob_3", entityId: "sol_3" },
    ];
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce(ROWS);
    // 1st succeeds, 2nd throws unexpected, 3rd succeeds
    embeddingServiceMock.embedSolution
      .mockResolvedValueOnce([0.1])
      .mockRejectedValueOnce(new Error("unexpected"))
      .mockResolvedValueOnce([0.2]);
    // For the 2nd job's markRetryOrFail path, checkEntityExists is NOT called
    // (the catch goes straight to markRetryOrFail).
    const result = await processOutboxBatch();
    expect(result.processed).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    consoleErrSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});

describe("backoff schedule", () => {
  it("test 12: backoff delays progress per BACKOFF_SCHEDULE_MS", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const EXPECTED_DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

    // Simulate 5 sequential failures on the same row
    for (let priorAttempts = 0; priorAttempts < 5; priorAttempts++) {
      vi.clearAllMocks();
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: "ob_1",
          entityType: "Solution",
          entityId: "sol_1",
          status: "PENDING",
          attempts: priorAttempts,
          lastError: null,
          nextRetryAt: new Date(Date.now() - 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      embeddingServiceMock.embedSolution.mockResolvedValueOnce(null);
      prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ "?column?": 1 }]); // entity exists
      await processOutboxBatch();
      const updateArg = prismaMock.embeddingOutbox.update.mock.calls[0][0];

      if (priorAttempts + 1 >= 5) {
        // Last attempt should produce FAILED — no nextRetryAt change asserted
        expect(updateArg.data.status).toBe("FAILED");
      } else {
        const delay = new Date(updateArg.data.nextRetryAt).getTime() - Date.now();
        const expected = EXPECTED_DELAYS[priorAttempts];
        expect(delay).toBeGreaterThan(expected - 1500);
        expect(delay).toBeLessThan(expected + 1500);
      }
    }
    consoleSpy.mockRestore();
  });
});

describe("scheduler lifecycle", () => {
  it("test 13: startOutboxScheduler then stopOutboxScheduler — clean start/stop", async () => {
    vi.useFakeTimers();
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);

    startOutboxScheduler();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();

    // Advance one tick
    await vi.advanceTimersByTimeAsync(60_000);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);

    stopOutboxScheduler();
    // Advance another tick — should NOT fire
    await vi.advanceTimersByTimeAsync(60_000);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("test 14: re-entrancy guard — second tick skips if first still running", async () => {
    vi.useFakeTimers();
    let resolveLong;
    const longPromise = new Promise((r) => { resolveLong = r; });
    prismaMock.$queryRawUnsafe.mockReturnValueOnce(longPromise);

    startOutboxScheduler();
    await vi.advanceTimersByTimeAsync(60_000); // tick 1 fires, hangs
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000); // tick 2 — should skip
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);

    resolveLong([]); // let tick 1 finish
    await vi.runOnlyPendingTimersAsync();

    stopOutboxScheduler();
    vi.useRealTimers();
  });
});
