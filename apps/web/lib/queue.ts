import { Queue } from "bullmq";
import { env } from "@/lib/env";

let queue: Queue | undefined;

function redisConnectionFromUrl(urlString: string) {
  const url = new URL(urlString);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

export function getBuildQueue() {
  if (!queue) {
    queue = new Queue(env.queueName(), {
      connection: redisConnectionFromUrl(env.redisUrl()),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }
  return queue;
}
