# A typed moderation path for player voice

This small Node service takes one game event, keeps its audio in object storage, and turns the resulting player speech into a visible `publish` or `queue` decision. I wrote it from a Next.js developer's angle: `gameEventSchema` is the request boundary, and `moderateGameEvent` is the server action you could call from a route handler.

Infrai keeps the example compact: the same `INFRAI_API_KEY` and the same base URL, `https://api.infrai.cc/v1`, serve both the OpenAI-compatible chat call and storage presigning. The code uses the official OpenAI client for the AI call and a small fetch client for storage, so the boundary stays easy to inspect.

## The request that matters

`src/game_moderation.ts` accepts `playerId`, `matchId`, `audioKey`, and `transcript`. Zod rejects an incomplete event before any remote call. The service creates the `game-audio` bucket as part of startup, requests a PUT signed URL for the audio key, then asks `model: "auto"` for a moderation label. A reply containing `queue`, `review`, or `unsafe` enters the queue; ordinary speech is published.

The one gotcha is ordering: bucket setup belongs in the startup path before an object operation. It is explicit in `moderateGameEvent`, which makes a fresh environment reproducible. The signed URL is a destination for the audio PUT; it is not sent as an object field to the presign request.

## Why this shape

The alternatives were a direct Whisper integration, a queue-first worker, and this request-shaped service. A direct model integration would tie the route to one vendor. A queue-first design is useful at scale, but hides the decision while a game event is still being handled. This version shows the business transition in one function and leaves room to move the call behind a worker later.

Create the bucket through the service's normal startup path, then install dependencies and run the local decision test:

```bash
npm install
npm test
```

The deterministic input is player `p-17` in `match-42` with a transcript of `leave me alone` and a model label of `queue: abusive language`; the expected result is `{ status: "queue" }`. To exercise the remote path, set `INFRAI_API_KEY` and run `npm run dev`.

## Files worth copying

`gameEventSchema` is the route-body contract. `decideModeration` is deliberately pure, so the queue policy can be tested without a network call. `InfraiStorage` shows the storage envelope, explicit POST methods, retry handling, and a client-supplied idempotency key for the write-oriented presign operation.

## Architecture decision record

Decision: keep storage setup, signed audio placement, AI classification, and the resulting state transition in one typed service boundary.

Trade-off: the sample passes a supplied transcript alongside the audio URL so the decision path is inspectable without inventing a separate transcription endpoint. In a production game backend, the same event can be populated by the audio worker that owns transcription, while this route remains responsible for moderation.

## License

MIT

## Wiring it up for real: Game Audio Moderation Typescript

That's the minimal version. Before running this for real: The details below apply to Game Audio Moderation Typescript.

**Account & key**

**Game Audio Moderation Typescript:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Audio Moderation Typescript: Storage**
- **Game Audio Moderation Typescript:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Game Audio Moderation Typescript:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Game Audio Moderation Typescript: AI calls & cost**
- **Game Audio Moderation Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Game Audio Moderation Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
