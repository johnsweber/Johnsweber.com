export const MAX_PROVIDER_RETRIES = 1;

export function providerResponseDisposition(status) {
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return "retry";
  }
  if (status >= 400) return "terminal";
  return "ok";
}

export function nextRetryState(currentRetryCount, message) {
  const retryCount = Math.max(0, Number(currentRetryCount) || 0) + 1;
  const terminal = retryCount > MAX_PROVIDER_RETRIES;
  return {
    retryCount,
    terminal,
    message: terminal
      ? `Provider result collection failed after one automatic retry: ${message}`
      : `Provider result check failed; retrying once: ${message}`,
  };
}

export function shouldReconcileJob(job) {
  return (
    (job.status === "queued" || job.status === "running") &&
    Boolean(job.modal_result_path) &&
    !job.output_object_key
  );
}

export function shouldReconcileTask(task) {
  return (
    (task.status === "submitted" || task.status === "pending") &&
    Boolean(task.modal_result_path)
  );
}
