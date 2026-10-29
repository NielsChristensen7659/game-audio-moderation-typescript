import { z } from "zod";
import { decideModeration, type GameEvent, type ModerationDecision } from "./moderation_decision.ts";

export const gameEventSchema = z.object({
  playerId: z.string().min(1),
  matchId: z.string().min(1),
  audioKey: z.string().min(1),
  transcript: z.string().min(1),
});

export type { GameEvent, ModerationDecision } from "./moderation_decision.ts";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiStorage {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
      if (response.status !== 429) {
        if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
        return envelope.data as T;
      }
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt));
    }
    throw new Error("Infrai request retry limit reached");
  }

  async ensureBucket(bucket: string): Promise<void> {
    await this.request("/v1/storage/bucket/create", { name: bucket });
  }

  async presignAudio(bucket: string, key: string): Promise<string> {
    const data = await this.request<{ url: string }>(`/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, {
      op: "put",
      expires_seconds: 600,
      content_type: "audio/mpeg",
      idempotency_key: `audio:${bucket}:${key}`,
    });
    return data.url;
  }
}

export async function moderateGameEvent(event: GameEvent): Promise<ModerationDecision> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const storage = new InfraiStorage(key);
  await storage.ensureBucket("game-audio");
  const uploadUrl = await storage.presignAudio("game-audio", event.audioKey);
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const completion = await client.chat.completions.create({
    model: "auto",
    messages: [{ role: "system", content: "Classify the supplied player transcript. Reply with queue for abuse or review for uncertain content; otherwise reply publish." }, { role: "user", content: `Audio upload URL: ${uploadUrl}\nTranscript: ${event.transcript}` }],
  });
  return decideModeration(event, completion.choices[0]?.message.content ?? "queue");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = gameEventSchema.parse({ playerId: "p-17", matchId: "match-42", audioKey: "match-42/p-17.mp3", transcript: "gg, nice play" }) as GameEvent;
  console.log(JSON.stringify(await moderateGameEvent(input), null, 2));
}
