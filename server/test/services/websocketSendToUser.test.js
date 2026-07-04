import { describe, it, expect, vi, beforeEach } from "vitest";

// We inject a fake `wss.clients` set. sendToUser iterates it and calls `send` on matching sockets.
describe("sendToUser WS primitive", () => {
  let sendToUser;
  let mockClients;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../../src/services/websocket.service.js");
    sendToUser = mod.sendToUser;
    mockClients = new Set();
    mod._setWssRefForTest({ clients: mockClients });
  });

  const makeSocket = ({ userId, readyState = 1 /* OPEN */ }) => ({
    userId,
    readyState,
    send: vi.fn(),
  });

  it("sends the message to a matching userId", () => {
    const s1 = makeSocket({ userId: "user_a" });
    const s2 = makeSocket({ userId: "user_b" });
    mockClients.add(s1);
    mockClients.add(s2);

    sendToUser("user_a", { type: "test", payload: 1 });

    expect(s1.send).toHaveBeenCalledWith(JSON.stringify({ type: "test", payload: 1 }));
    expect(s2.send).not.toHaveBeenCalled();
  });

  it("skips sockets not in OPEN state", () => {
    const s1 = makeSocket({ userId: "user_a", readyState: 3 /* CLOSED */ });
    mockClients.add(s1);
    sendToUser("user_a", { type: "test" });
    expect(s1.send).not.toHaveBeenCalled();
  });

  it("is a no-op when no matching socket", () => {
    const s1 = makeSocket({ userId: "user_a" });
    mockClients.add(s1);
    expect(() => sendToUser("user_zzz", { type: "test" })).not.toThrow();
    expect(s1.send).not.toHaveBeenCalled();
  });

  it("supports multiple sockets for the same user (multi-tab)", () => {
    const s1 = makeSocket({ userId: "user_a" });
    const s2 = makeSocket({ userId: "user_a" });
    mockClients.add(s1);
    mockClients.add(s2);
    sendToUser("user_a", { type: "test" });
    expect(s1.send).toHaveBeenCalledOnce();
    expect(s2.send).toHaveBeenCalledOnce();
  });
});
