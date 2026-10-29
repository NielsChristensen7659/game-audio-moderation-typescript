import test from "node:test";
import assert from "node:assert/strict";
import { decideModeration } from "./moderation_decision.ts";

test("an abusive classification enters the moderation queue", () => {
  const event = { playerId: "p-17", matchId: "match-42", audioKey: "a.mp3", transcript: "leave me alone" };
  assert.deepEqual(decideModeration(event, "queue: abusive language"), { status: "queue", reason: "queue: abusive language", playerId: "p-17", matchId: "match-42" });
});
