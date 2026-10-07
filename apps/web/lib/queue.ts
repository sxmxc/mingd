import { Queue } from "bullmq";
import { env } from "@/lib/env";
import type { Platform } from "@mingd/build-config";

const queues = new Map<string, Queue>();

export async function queueOperation<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Queue connection timed out.")), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

function redisConnectionFromUrl(urlString: string) {
  const url = new URL(urlString);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
  };
}

export function getBuildQueue(platform: Platform = "linux") {
  const name = platform === "web" ? env.webQueueName() : platform === "android" ? env.androidQueueName() : platform === "macos" ? env.macosQueueName() : env.queueName();
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: redisConnectionFromUrl(env.redisUrl()),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
    queue.on("error", () => console.warn("Build queue connection unavailable."));
    queues.set(name, queue);
  }
  return queue;
}
