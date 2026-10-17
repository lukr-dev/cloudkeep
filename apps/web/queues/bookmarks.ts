import { defineQueue } from "void";
import { processBookmark, type ProcessMessage } from "../lib/processing.ts";

export const maxBatchSize = 1;
export const maxBatchTimeout = 1;
// Failed work is visible and explicitly retried via reprocess, avoiding repeat AI charges.
export const maxRetries = 0;
export default defineQueue<ProcessMessage>(async (batch) => {
  for (const message of batch.messages) {
    await processBookmark(message.body);
    message.ack();
  }
});
