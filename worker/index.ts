import { createApp, createDigestJob, processSubmissionJob } from './app';
import type { Env, SubmissionJob } from './types';

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<SubmissionJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processSubmissionJob(env, message.body.submissionId);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await createDigestJob(env);
  },
};
