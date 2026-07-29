import {
  deleteAiVideoMediaItem,
  getAiVideoJob,
  getAiVideoMedia,
  type AiVideoMedia,
} from "@/db/ai-video";

export async function purgeAiVideoMedia(media: AiVideoMedia) {
  const job = media.job_id
    ? await getAiVideoJob(media.job_id, media.user_id)
    : null;
  const objectKeys = Array.from(new Set([
    media.thumbnail_object_key,
    media.content_object_key,
    media.last_frame_object_key,
    job?.source_object_key,
    job?.thumbnail_object_key,
    job?.output_object_key,
    job?.last_frame_object_key,
  ].filter(
    (key): key is string => Boolean(key && !key.startsWith("demo:")),
  )));

  // R2 deletion is idempotent. Delete files first so a transient D1 failure
  // simply retries the metadata cleanup on the next scheduled run.
  if (objectKeys.length) {
    await (await getAiVideoMedia()).delete(objectKeys);
  }
  await deleteAiVideoMediaItem(media.id, media.user_id, media.job_id);
}
