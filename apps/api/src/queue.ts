import { Queue } from "bullmq";

const connection = {
  host: "localhost",
  port: 6379,
};

export const eventQueue = new Queue("events", { connection });
export { connection };