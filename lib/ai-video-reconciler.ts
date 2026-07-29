import {
  acquireAiVideoReconcilerLease,
  ensureAiVideoSchema,
  finishAiVideoReconcilerRun,
  hasActiveGpuWorkForModel,
  listActiveAiVideoJobs,
  listActiveProcessingTasks,
  listWaitingGpuShutdownMedia,
  updateAiVideoMedia,
} from "@/db/ai-video";
import { refreshProcessingTask } from "./ai-video-processing";
import { refreshAiVideoJob } from "./ai-video-service";

const RECONCILER_BATCH_SIZE = 4;
const RECONCILER_LEASE_MS = 3 * 60_000;
const GPU_SHUTDOWN_UNAVAILABLE =
  "The provider queue is empty. Automatic container shutdown is not available through a supported server API, so Modal will use its configured idle shutdown.";

export type AiVideoReconcileSummary = {
  acquired: boolean;
  jobsChecked: number;
  tasksChecked: number;
  errors: string[];
};

async function settleGpuShutdownRequests(errors: string[]) {
  const requests = await listWaitingGpuShutdownMedia();
  const grouped = new Map<string, typeof requests>();
  for (const media of requests) {
    const existing = grouped.get(media.model_key) || [];
    existing.push(media);
    grouped.set(media.model_key, existing);
  }
  for (const [modelKey, mediaItems] of grouped) {
    try {
      if (await hasActiveGpuWorkForModel(modelKey)) continue;
      await Promise.all(mediaItems.map(media =>
        updateAiVideoMedia(media.id, media.user_id, {
          gpu_shutdown_status: "unsupported",
          gpu_shutdown_message: GPU_SHUTDOWN_UNAVAILABLE,
        }),
      ));
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `GPU shutdown boundary (${modelKey}): ${error.message}`
          : `GPU shutdown boundary (${modelKey}) failed.`,
      );
    }
  }
}

export async function reconcileAiVideoWork(
  origin = "https://johnsweber.com",
): Promise<AiVideoReconcileSummary> {
  await ensureAiVideoSchema();
  const now = new Date();
  const acquired = await acquireAiVideoReconcilerLease(
    now.toISOString(),
    new Date(now.getTime() + RECONCILER_LEASE_MS).toISOString(),
  );
  if (!acquired) {
    return { acquired: false, jobsChecked: 0, tasksChecked: 0, errors: [] };
  }

  let jobsChecked = 0;
  let tasksChecked = 0;
  const errors: string[] = [];
  try {
    const jobs = await listActiveAiVideoJobs(RECONCILER_BATCH_SIZE);
    jobsChecked = jobs.length;
    const jobResults = await Promise.allSettled(
      jobs.map(job => refreshAiVideoJob(job, origin)),
    );
    for (const result of jobResults) {
      if (result.status === "rejected") {
        errors.push(
          result.reason instanceof Error
            ? `Video generation: ${result.reason.message}`
            : "Video generation reconciliation failed.",
        );
      }
    }

    // Query after video ingestion so a newly-created final-frame task can be
    // picked up during this same scheduled run.
    const tasks = await listActiveProcessingTasks(RECONCILER_BATCH_SIZE);
    tasksChecked = tasks.length;
    const taskResults = await Promise.allSettled(
      tasks.map(task => refreshProcessingTask(task)),
    );
    for (const result of taskResults) {
      if (result.status === "rejected") {
        errors.push(
          result.reason instanceof Error
            ? `Media processing: ${result.reason.message}`
            : "Media processing reconciliation failed.",
        );
      }
    }

    await settleGpuShutdownRequests(errors);
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : "AI Video reconciliation failed.",
    );
  } finally {
    const finishedAt = new Date().toISOString();
    await finishAiVideoReconcilerRun({
      now: finishedAt,
      error: errors.length ? errors.slice(0, 3).join(" | ").slice(0, 1_000) : null,
      jobsChecked,
      tasksChecked,
    });
  }

  return { acquired: true, jobsChecked, tasksChecked, errors };
}
