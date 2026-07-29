import {
  ensureAiVideoSchema,
  getAiVideoReconcilerState,
  listAiVideoJobs,
  listAiVideoMedia,
  listProcessingTasks,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { publicAiVideoJob, refreshAiVideoJob } from "@/lib/ai-video-service";
import { publicProcessingTask, refreshProcessingTask } from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

type QueueStatus = "queued" | "running" | "complete" | "failed";

function remainingSeconds(estimate: number, progress: number, status: QueueStatus) {
  if (status === "complete" || status === "failed") return 0;
  return Math.max(2, Math.round(estimate * ((100 - progress) / 100)));
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const [jobs, tasks, media, reconciler] = await Promise.all([
      listAiVideoJobs(user.id),
      listProcessingTasks(user.id),
      listAiVideoMedia(user.id),
      getAiVideoReconcilerState(),
    ]);
    const origin = new URL(request.url).origin;
    const refreshedJobs = await Promise.all(jobs.map(job =>
      (job.status === "queued" || job.status === "running") && !job.output_object_key
        ? refreshAiVideoJob(job, origin)
        : job
    ));
    const refreshedTasks = await Promise.all(tasks.map(task =>
      task.status === "submitted" || task.status === "pending"
        ? refreshProcessingTask(task)
        : task
    ));
    const mediaById = new Map(media.map(item => [item.id, item]));

    const jobItems = refreshedJobs.map(job => {
      const projected = publicAiVideoJob(job);
      const ownedMedia = mediaById.get(job.id);
      const status: QueueStatus = job.output_object_key
        ? "complete"
        : job.status === "queued"
          ? "queued"
          : job.status === "running"
            ? "running"
            : job.status;
      const progress = status === "complete" ? 100 : projected.progress;
      return {
        id: job.id,
        kind: "video_generation",
        title: job.prompt,
        detail: `Video generation · ${job.model_key} · ${job.quality}`,
        status,
        progress,
        estimatedSeconds: job.estimated_seconds,
        remainingSeconds: remainingSeconds(job.estimated_seconds, progress, status),
        cancelable: status === "queued" || status === "running",
        mediaId: job.id,
        sceneId: null,
        errorMessage: job.error_message,
        providerCallId: job.modal_call_id,
        lastProviderContactAt: job.provider_last_contact_at || null,
        retryCount: job.retry_count || 0,
        hasStoredFile: Boolean(job.output_object_key),
        stopGpuWhenQueueComplete: Boolean(ownedMedia?.stop_gpu_when_queue_complete),
        gpuShutdownStatus: ownedMedia?.gpu_shutdown_status || "not_requested",
        gpuShutdownMessage: ownedMedia?.gpu_shutdown_message || null,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      };
    });

    const taskItems = refreshedTasks.map(task => {
      const projected = publicProcessingTask(task);
      const output = task.output_media_id ? mediaById.get(task.output_media_id) : null;
      const status: QueueStatus =
        task.status === "submitted"
          ? "queued"
          : task.status === "pending"
            ? "running"
            : task.status;
      const estimate = task.task_type === "last_frame"
        ? 30
        : Math.max(30, Math.round((output?.duration_seconds || 30) * 0.75 + 15));
      return {
        id: task.id,
        kind: task.task_type,
        title: task.task_type === "last_frame"
          ? `Preparing final frame · ${output?.prompt || "Video"}`
          : `Exporting scene · ${output?.prompt || "Scene"}`,
        detail: task.task_type === "last_frame"
          ? "CPU frame extraction"
          : "CPU video merge",
        status,
        progress: projected.progress,
        estimatedSeconds: estimate,
        remainingSeconds: remainingSeconds(estimate, projected.progress, status),
        cancelable: status === "queued" || status === "running",
        mediaId: task.output_media_id,
        sceneId: task.scene_id,
        errorMessage: task.error_message,
        providerCallId: task.modal_call_id,
        lastProviderContactAt: task.provider_last_contact_at || null,
        retryCount: task.retry_count || 0,
        hasStoredFile: Boolean(output?.content_object_key),
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      };
    });

    const pictureItems = media
      .filter(item => item.media_type === "picture")
      .map(item => {
        const status: QueueStatus =
          item.status === "submitted"
            ? "queued"
            : item.status === "pending"
              ? "running"
              : item.status;
        const progress = status === "complete" || status === "failed"
          ? 100
          : status === "queued" ? 5 : 40;
        const estimate = 90;
        return {
          id: item.id,
          kind: "picture_generation",
          title: item.prompt,
          detail: `Picture generation · ${item.model_key}`,
          status,
          progress,
          estimatedSeconds: estimate,
          remainingSeconds: remainingSeconds(estimate, progress, status),
          cancelable: status === "queued" || status === "running",
          mediaId: item.id,
          sceneId: null,
          errorMessage: item.error_message,
          providerCallId: null,
          lastProviderContactAt: null,
          retryCount: 0,
          hasStoredFile: Boolean(item.content_object_key),
          stopGpuWhenQueueComplete: Boolean(item.stop_gpu_when_queue_complete),
          gpuShutdownStatus: item.gpu_shutdown_status || "not_requested",
          gpuShutdownMessage: item.gpu_shutdown_message || null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      });

    return Response.json({
      processes: [...jobItems, ...taskItems, ...pictureItems]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
      reconciler: reconciler ? {
        lastRunAt: reconciler.last_run_at,
        lastSuccessAt: reconciler.last_success_at,
        lastError: reconciler.last_error,
        jobsChecked: reconciler.jobs_checked,
        tasksChecked: reconciler.tasks_checked,
      } : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load the processing queue." }, { status: 500 });
  }
}
