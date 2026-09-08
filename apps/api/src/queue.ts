import { Queue } from "bullmq";

// Redis is only needed for the simulated incident-detection pipeline, not
// for the agent itself — so a missing Redis should be a single clear line,
// not thousands of identical ECONNREFUSED stack traces that bury every
// other log. BullMQ retries forever by default; this caps it and reports
// once.
const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  // Stop after a few attempts instead of reconnecting indefinitely.
  maxRetriesPerRequest: 2,
  retryStrategy(times: number) {
    if (times > 3) return null; // give up; the agent works fine without it
    return Math.min(times * 500, 2000);
  },
};

export const eventQueue = new Queue("events", { connection });

let warned = false;
eventQueue.on("error", (err: Error & { code?: string }) => {
  if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) {
    if (warned) return; // one line, not one per retry
    warned = true;
    console.warn(
      `[queue] Redis isn't reachable at ${connection.host}:${connection.port}. ` +
        "The agent works fine without it — Redis is only used by the simulated incident pipeline. " +
        "Start it with `docker compose up redis -d` if you want that."
    );
    return;
  }
  console.error("[queue]", err.message);
});

export { connection };
