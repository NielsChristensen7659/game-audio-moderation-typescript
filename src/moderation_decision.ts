export type GameEvent = { playerId: string; matchId: string; audioKey: string; transcript: string };
export type ModerationDecision = { status: "publish" | "queue"; reason: string; playerId: string; matchId: string };

export function decideModeration(event: GameEvent, modelText: string): ModerationDecision {
  const normalized = modelText.toLowerCase();
  const queue = normalized.includes("queue") || normalized.includes("review") || normalized.includes("unsafe");
  return { status: queue ? "queue" : "publish", reason: modelText.trim(), playerId: event.playerId, matchId: event.matchId };
}
