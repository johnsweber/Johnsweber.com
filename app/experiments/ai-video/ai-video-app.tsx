"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clapperboard,
  Clock3,
  House,
  Image as PictureIcon,
  Images,
  Library,
  ListChecks,
  LockKeyhole,
  EllipsisVertical,
  PanelsTopLeft,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Video,
  WandSparkles,
  Download,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useAuthConfigured } from "@/app/auth-provider";
import { AI_VIDEO_MODELS, type AiVideoModelKey } from "@/lib/ai-video-models";
import {
  AI_PICTURE_MODELS,
  PICTURE_ASPECTS,
  type PictureAspectKey,
  type PictureModelKey,
  type PicturePresetKey,
} from "@/lib/ai-picture-models";
import { USE_PRODUCTION_HEADER } from "@/lib/production-mode";
import { SiteNavigation } from "@/app/site-navigation";
import {
  readUseProduction,
  useProductionMode,
} from "@/lib/use-production-mode";

type View = "home" | "create" | "library" | "queue" | "player" | "media" | "scene";
type CreationType = "picture" | "video";
type MediaType = CreationType | "scene";
type MediaStatus = "submitted" | "pending" | "complete" | "failed";
type GenerationPreset = "test" | "fast" | "max" | "custom";
type GpuTemperature = "checking" | "warm" | "cold" | "unknown";

type PublicJob = {
  id: string;
  modelKey: AiVideoModelKey;
  generationMode: string;
  prompt: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  quality: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  seed: number;
  estimatedSeconds: number;
  errorMessage: string | null;
  stopGpuWhenQueueComplete?: boolean;
  gpuShutdownStatus?: "not_requested" | "waiting" | "unsupported" | "complete" | "failed";
  gpuShutdownMessage?: string | null;
  hasThumbnail: boolean;
  hasLastFrame: boolean;
  hasVideo: boolean;
  createdAt: string;
  completedAt: string | null;
};

type PublicMedia = {
  id: string;
  mediaType: MediaType;
  status: MediaStatus;
  modelKey: string;
  prompt: string;
  quality: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  fps: number | null;
  seed: number;
  jobId: string | null;
  hasThumbnail: boolean;
  hasLastFrame: boolean;
  hasContent: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type QueueProcess = {
  id: string;
  kind: "video_generation" | "picture_generation" | "last_frame" | "scene_export";
  title: string;
  detail: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  estimatedSeconds: number;
  remainingSeconds: number;
  cancelable: boolean;
  mediaId: string | null;
  sceneId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  providerCallId?: string | null;
  lastProviderContactAt?: string | null;
  retryCount?: number;
  hasStoredFile?: boolean;
  stopGpuWhenQueueComplete?: boolean;
  gpuShutdownStatus?: string;
  gpuShutdownMessage?: string | null;
};

type QueueReconciler = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  jobsChecked: number;
  tasksChecked: number;
};

function modelName(media: PublicMedia) {
  if (media.mediaType === "scene") return "Scene";
  if (media.mediaType === "picture") {
    return AI_PICTURE_MODELS[media.modelKey as PictureModelKey]?.name || media.modelKey;
  }
  return AI_VIDEO_MODELS[media.modelKey as AiVideoModelKey]?.name || media.modelKey;
}

function isPending(status: MediaStatus) {
  return status === "submitted" || status === "pending";
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatRemaining(job: PublicJob) {
  if (job.status === "complete") return "Ready to play";
  if (job.status === "failed") return "Generation stopped";
  const remaining = Math.max(
    5,
    Math.round(job.estimatedSeconds * ((100 - job.progress) / 100)),
  );
  if (remaining < 60) return `About ${remaining} seconds remaining`;
  return `About ${Math.ceil(remaining / 60)} minutes remaining`;
}

function formatEstimate(seconds: number) {
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} sec`;
  const minutes = seconds / 60;
  if (minutes < 10) return `about ${minutes.toFixed(minutes < 2 ? 1 : 0)} min`;
  return `about ${Math.round(minutes)} min`;
}

async function readApiResponse<T extends { error?: string }>(
  response: Response,
  fallback: string,
): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    return {
      error: `${fallback} (HTTP ${response.status}; empty response).`,
    } as T;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    return {
      error: `${fallback} (HTTP ${response.status}; unreadable response).`,
    } as T;
  }
}

async function optimizeReferenceImage(file: File) {
  if (file.size <= 1_500_000) return file;
  const bitmap = await createImageBitmap(file);
  try {
    let result: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const maxDimension = 1600 * (0.86 ** attempt);
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot optimize the reference image.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      result = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error("The reference image could not be compressed.")),
          "image/jpeg",
          Math.max(0.58, 0.88 - attempt * 0.08),
        );
      });
      if (result.size <= 1_500_000) break;
    }
    if (!result) throw new Error("The reference image could not be optimized.");
    const stem = file.name.replace(/\.[^.]+$/, "") || "reference";
    return new File([result], `${stem}-optimized.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function useAuthorizedFetch() {
  const { getToken } = useAuth();
  const { user } = useUser();
  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in required.");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set(
        USE_PRODUCTION_HEADER,
        String(readUseProduction(user?.id)),
      );
      return fetch(input, { ...init, headers });
    },
    [getToken, user?.id],
  );
}

function BottomNavigation() {
  const items = [
    { label: "Home", href: "/experiments/ai-video", icon: House },
    { label: "Library", href: "/experiments/ai-video/library", icon: Library },
    { label: "Create", href: "/experiments/ai-video/create", icon: Plus, primary: true },
    { label: "Queue", href: "/experiments/ai-video/queue", icon: ListChecks },
    { label: "Settings", icon: Settings2, placeholder: true },
  ];
  return (
    <nav className="aiv-bottom-nav" aria-label="AI Video navigation">
      {items.map(({ label, href, icon: Icon, primary, placeholder }) =>
        placeholder ? (
          <button key={label} type="button" disabled title="Coming soon">
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ) : (
          <Link key={label} href={href!} className={primary ? "primary" : undefined}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ),
      )}
    </nav>
  );
}

function ExperimentHeader({ close = false }: { close?: boolean }) {
  return (
    <header className="aiv-header">
      <div className="aiv-brand">
        <SiteNavigation triggerOnly />
        <strong>AI VIDEO</strong>
      </div>
      <Link
        href={close ? "/experiments/ai-video/library" : "/"}
        className="aiv-close"
        aria-label={close ? "Close media viewer" : "Leave AI Video"}
      >
        {close ? <X aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
      </Link>
    </header>
  );
}

function SignedOutGate() {
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-gate">
        <span className="aiv-round-icon"><LockKeyhole aria-hidden="true" /></span>
        <p className="aiv-kicker">PRIVATE EXPERIMENT</p>
        <h1>Sign in to enter AI Video.</h1>
        <p>Your pictures, videos, and library stay attached to your account.</p>
        <Link href="/login?returnTo=/experiments/ai-video">Log in</Link>
        <Link className="aiv-secondary-link" href="/create-account?returnTo=/experiments/ai-video">
          Create account
        </Link>
      </section>
    </main>
  );
}

function SetupGate() {
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-gate">
        <span className="aiv-round-icon"><Settings2 aria-hidden="true" /></span>
        <p className="aiv-kicker">SETUP REQUIRED</p>
        <h1>AI Video is ready for authentication.</h1>
        <p>Connect the Clerk environment before this private experiment can open.</p>
      </section>
    </main>
  );
}

function PrivateMediaAsset({
  mediaId,
  mediaType,
  thumbnail = false,
  className,
  children,
  onEnded,
  onDuration,
}: {
  mediaId: string;
  mediaType: CreationType;
  thumbnail?: boolean;
  className?: string;
  children?: ReactNode;
  onEnded?: () => void;
  onDuration?: (seconds: number) => void;
}) {
  const authorizedFetch = useAuthorizedFetch();
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const suffix = thumbnail ? "thumbnail" : "content";
    authorizedFetch(`/api/experiments/ai-video/media/${mediaId}/${suffix}`)
      .then((response) => {
        if (!response.ok) throw new Error("Media unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authorizedFetch, mediaId, thumbnail]);

  if (!url) return <>{children}</>;
  return mediaType === "video" && !thumbnail ? (
    <video
      className={className}
      src={url}
      controls
      autoPlay
      playsInline
      onEnded={onEnded}
      onLoadedMetadata={(event: SyntheticEvent<HTMLVideoElement>) => {
        const duration = event.currentTarget.duration;
        if (Number.isFinite(duration) && duration > 0) onDuration?.(duration);
      }}
    />
  ) : (
    <img className={className} src={url} alt="" />
  );
}

type TimelineFrame = { time: number; source: string };

function ScannableVideo({
  mediaId,
  onDuration,
}: {
  mediaId: string;
  onDuration: (seconds: number) => void;
}) {
  const authorizedFetch = useAuthorizedFetch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTime, setScanTime] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [frames, setFrames] = useState<TimelineFrame[]>([]);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    authorizedFetch(`/api/experiments/ai-video/media/${mediaId}/content`)
      .then(response => {
        if (!response.ok) throw new Error("Video unavailable.");
        return response.blob();
      })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(error => {
        if (active) setScanError(error instanceof Error ? error.message : "Video unavailable.");
      });
    return () => {
      active = false;
      generationRef.current += 1;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authorizedFetch, mediaId]);

  async function generateFrames() {
    if (!url || frames.length || scanning) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setScanning(true);
    setScanError("");
    try {
      const sampler = document.createElement("video");
      sampler.src = url;
      sampler.muted = true;
      sampler.preload = "auto";
      sampler.playsInline = true;
      if (sampler.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          sampler.addEventListener("loadedmetadata", () => resolve(), { once: true });
          sampler.addEventListener("error", () => reject(new Error("Could not read video metadata.")), { once: true });
        });
      }
      if (sampler.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          sampler.addEventListener("loadeddata", () => resolve(), { once: true });
          sampler.addEventListener("error", () => reject(new Error("Could not load preview frames.")), { once: true });
        });
      }
      const measuredDuration = sampler.duration;
      if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) {
        throw new Error("This video does not expose a scannable duration.");
      }
      // Roughly one preview every three seconds: 30s produces 10 frames.
      // Keep short clips useful without making long clips expensive to scan.
      const count = Math.min(12, Math.max(4, Math.ceil(measuredDuration / 3)));
      const width = 240;
      const height = Math.max(90, Math.round(width * (sampler.videoHeight / sampler.videoWidth)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Timeline previews are unavailable.");
      const nextFrames: TimelineFrame[] = [];
      for (let index = 0; index < count; index += 1) {
        if (generationRef.current !== generation) return;
        const time = Math.min(
          Math.max(0, measuredDuration - 0.04),
          (measuredDuration * index) / Math.max(1, count - 1),
        );
        if (Math.abs(sampler.currentTime - time) > 0.01) {
          await new Promise<void>((resolve, reject) => {
            sampler.addEventListener("seeked", () => resolve(), { once: true });
            sampler.addEventListener("error", () => reject(new Error("A preview frame could not be read.")), { once: true });
            sampler.currentTime = time;
          });
        }
        context.drawImage(sampler, 0, 0, width, height);
        nextFrames.push({ time, source: canvas.toDataURL("image/jpeg", 0.68) });
        setScanProgress(Math.round(((index + 1) / count) * 100));
      }
      setFrames(nextFrames);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Timeline previews could not be created.");
    } finally {
      if (generationRef.current === generation) setScanning(false);
    }
  }

  function timeAt(clientX: number) {
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!bounds || !duration) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    return ratio * duration;
  }

  function previewAt(clientX: number) {
    const time = timeAt(clientX);
    setScanTime(time);
    setShowPreview(true);
    return time;
  }

  function commitTime(time: number) {
    if (videoRef.current) videoRef.current.currentTime = time;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    videoRef.current?.pause();
    previewAt(event.clientX);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" && !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    previewAt(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const time = previewAt(event.clientX);
    commitTime(time);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleTimelineKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const next =
      event.key === "Home" ? 0 :
      event.key === "End" ? duration :
      Math.min(duration, Math.max(0, scanTime + (event.key === "ArrowLeft" ? -step : step)));
    setScanTime(next);
    setShowPreview(true);
    commitTime(next);
  }

  const selectedFrame = frames.reduce<TimelineFrame | null>(
    (closest, frame) =>
      !closest || Math.abs(frame.time - scanTime) < Math.abs(closest.time - scanTime)
        ? frame
        : closest,
    null,
  );
  const previewPosition = duration ? Math.min(93, Math.max(7, (scanTime / duration) * 100)) : 7;

  if (!url) return <div className="aiv-player-message">Preparing secure video…</div>;
  return (
    <div className="aiv-scannable-video">
      <video
        ref={videoRef}
        className="aiv-video"
        src={url}
        controls
        autoPlay
        playsInline
        onLoadedMetadata={event => {
          const measured = event.currentTarget.duration;
          if (Number.isFinite(measured) && measured > 0) {
            setDuration(measured);
            setScanTime(event.currentTarget.currentTime);
            onDuration(measured);
          }
        }}
        onTimeUpdate={event => {
          if (!showPreview) setScanTime(event.currentTarget.currentTime);
        }}
        onPlay={() => setShowPreview(false)}
      />
      <div className="aiv-scan-controls">
        <button
          type="button"
          className="aiv-scan-toggle"
          onClick={() => {
            const opening = !scanOpen;
            setScanOpen(opening);
            if (opening) void generateFrames();
          }}
        >
          <PanelsTopLeft aria-hidden="true" />
          {scanOpen ? "Close timeline" : "Scan timeline"}
        </button>
        {scanOpen && (
          <span>{scanning ? `Building previews · ${scanProgress}%` : "Move, tap, or drag to scan"}</span>
        )}
      </div>
      {scanOpen && (
        <div className="aiv-scan-editor">
          <div
            ref={timelineRef}
            className={`aiv-scan-timeline ${scanning ? "loading" : ""}`}
            role="slider"
            tabIndex={0}
            aria-label="Video timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(scanTime)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => setShowPreview(false)}
            onPointerLeave={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) setShowPreview(false);
            }}
            onKeyDown={handleTimelineKey}
          >
            {frames.length ? frames.map(frame => (
              <img key={frame.time} src={frame.source} alt="" draggable={false} />
            )) : <span className="aiv-scan-skeleton" style={{ width: `${scanProgress}%` }} />}
            <i className="aiv-scan-playhead" style={{ left: `${duration ? (scanTime / duration) * 100 : 0}%` }} />
            {showPreview && selectedFrame && (
              <div className="aiv-scan-preview" style={{ left: `${previewPosition}%` }}>
                <img src={selectedFrame.source} alt="" />
                <strong>{formatDuration(scanTime)}</strong>
              </div>
            )}
          </div>
          <div className="aiv-scan-time">
            <span>{formatDuration(scanTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
          {scanError && <p className="aiv-form-error">{scanError}</p>}
        </div>
      )}
    </div>
  );
}

function PendingBadge({
  status,
  errorMessage,
}: {
  status: MediaStatus;
  errorMessage?: string | null;
}) {
  const warning = isPending(status) && Boolean(errorMessage);
  return (
    <span className={`aiv-status ${warning ? "warning" : status}`}>
      {warning || status === "failed"
        ? <AlertTriangle aria-hidden="true" />
        : isPending(status) && <Clock3 aria-hidden="true" />}
      {warning ? "Attention" : status === "submitted" ? "Submitted" : status}
    </span>
  );
}

function MediaCard({
  media,
  onDelete,
}: {
  media: PublicMedia;
  onDelete?: (id: string) => Promise<void>;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete() {
    if (!onDelete || !window.confirm("Delete this media item and its saved file?")) {
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(media.id);
      if (menuRef.current) menuRef.current.open = false;
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete media.");
      setDeleting(false);
    }
  }

  return (
    <article className="aiv-library-card">
      <Link
        href={media.mediaType === "scene" ? `/experiments/ai-video/scene/${media.id}` : `/experiments/ai-video/media/${media.id}`}
        className="aiv-library-visual"
        aria-label={`Open ${media.mediaType}: ${media.prompt}`}
      >
        <div className="aiv-thumb">
        {media.hasThumbnail ? (
          <PrivateMediaAsset mediaId={media.id} mediaType={media.mediaType === "scene" ? "picture" : media.mediaType} thumbnail>
            <span className="aiv-thumb-placeholder"><Images aria-hidden="true" /></span>
          </PrivateMediaAsset>
        ) : (
          <span className="aiv-thumb-placeholder">
            {media.mediaType === "picture" ? <PictureIcon aria-hidden="true" /> : media.mediaType === "scene" ? <Clapperboard aria-hidden="true" /> : <Video aria-hidden="true" />}
          </span>
        )}
        <PendingBadge status={media.status} errorMessage={media.errorMessage} />
        {media.status === "complete" && media.mediaType === "video" && (
          <span className="aiv-play"><Play aria-hidden="true" /></span>
        )}
        <span className="aiv-media-type">
          {media.mediaType === "picture" ? <PictureIcon aria-hidden="true" /> : media.mediaType === "scene" ? <Clapperboard aria-hidden="true" /> : <Video aria-hidden="true" />}
          {media.mediaType}
        </span>
        </div>
      </Link>
      <div className="aiv-library-copy">
        <div className="aiv-library-copy-row">
          <Link href={media.mediaType === "scene" ? `/experiments/ai-video/scene/${media.id}` : `/experiments/ai-video/media/${media.id}`} className="aiv-library-title">
            <strong>{media.prompt}</strong>
          </Link>
          {onDelete && (
            <details className="aiv-card-menu" ref={menuRef}>
              <summary aria-label={`Actions for ${media.prompt}`}>
                <EllipsisVertical aria-hidden="true" />
              </summary>
              <div className="aiv-card-menu-panel">
                <button type="button" onClick={handleDelete} disabled={deleting}>
                  <Trash2 aria-hidden="true" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                {deleteError && <span role="alert">{deleteError}</span>}
              </div>
            </details>
          )}
        </div>
        <span>
          {modelName(media)} · {media.mediaType === "video" ? `${formatDuration(media.durationSeconds)} · ` : ""}
          {media.quality}
        </span>
        {media.errorMessage && (
          <span className="aiv-card-error">
            <AlertTriangle aria-hidden="true" />
            {media.errorMessage}
          </span>
        )}
      </div>
    </article>
  );
}

function useMedia(enabled: boolean) {
  const authorizedFetch = useAuthorizedFetch();
  const [media, setMedia] = useState<PublicMedia[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer = 0;
    const load = async () => {
      try {
        const response = await authorizedFetch("/api/experiments/ai-video/media");
        const data = (await response.json()) as { media?: PublicMedia[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Library unavailable.");
        if (!active) return;
        const items = data.media || [];
        setMedia(items);
        setError("");
        if (items.some((item) => isPending(item.status))) {
          timer = window.setTimeout(load, 5_000);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Library unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authorizedFetch, enabled]);

  const deleteMedia = useCallback(async (id: string) => {
    const response = await authorizedFetch(
      `/api/experiments/ai-video/media/${id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Unable to delete media.");
    }
    setMedia((items) => items.filter((item) => item.id !== id));
  }, [authorizedFetch]);

  return { media, loading, error, deleteMedia };
}

function HomeView() {
  const { media, loading } = useMedia(true);
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-hero">
        <div>
          <p className="aiv-kicker">PRIVATE CREATIVE LAB</p>
          <h1>Create a picture. Give it somewhere to go.</h1>
          <p>Generate still images or build private video shots with the models connected to your playground.</p>
          <div className="aiv-actions">
            <Link href="/experiments/ai-video/create"><WandSparkles aria-hidden="true" /> Create media</Link>
            <Link href="/experiments/ai-video/library" className="secondary"><Library aria-hidden="true" /> Open library</Link>
          </div>
        </div>
        <div className="aiv-hero-orbit" aria-hidden="true">
          <i /><i /><i />
          <Clapperboard />
        </div>
      </section>
      <section className="aiv-model-section">
        <div className="aiv-section-title">
          <div><p className="aiv-kicker">AVAILABLE MODES</p><h2>Pictures and motion.</h2></div>
          <Link href="/experiments/ai-video/create">Open create <span>→</span></Link>
        </div>
        <div className="aiv-model-grid">
          <article>
            <span>PICTURE</span>
            <h3>Local image models</h3>
            <p>Use SDXL Base or Animagine to create a private still on your connected GPU.</p>
            <div><b>Up to 1536 px</b><b>Z-Image Turbo</b><b>Reference editing</b></div>
          </article>
          <article>
            <span>VIDEO</span>
            <h3>Wan + LTX</h3>
            <p>Create image-guided motion with Wan or text-and-audio video with LTX.</p>
            <div><b>480p</b><b>720p</b><b>5s</b><b>10s</b></div>
          </article>
        </div>
      </section>
      <section className="aiv-recent">
        <div className="aiv-section-title">
          <div><p className="aiv-kicker">YOUR RECENT WORK</p><h2>Private by default.</h2></div>
          <Link href="/experiments/ai-video/library">View all</Link>
        </div>
        {loading ? (
          <div className="aiv-empty">Loading your library…</div>
        ) : media.length ? (
          <div className="aiv-library-grid">
            {media.slice(0, 3).map((item) => <MediaCard media={item} key={item.id} />)}
          </div>
        ) : (
          <div className="aiv-empty">
            <Clapperboard aria-hidden="true" />
            <strong>No media yet.</strong>
            <span>Your first picture or video will appear here.</span>
          </div>
        )}
      </section>
      <BottomNavigation />
    </main>
  );
}

function ProgressPanel({ initialJob, sceneId }: { initialJob: PublicJob; sceneId?: string | null }) {
  const authorizedFetch = useAuthorizedFetch();
  const [job, setJob] = useState(initialJob);

  useEffect(() => {
    if (job.status === "complete" || job.status === "failed") return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await authorizedFetch(`/api/experiments/ai-video/jobs/${job.id}`);
        const data = (await response.json()) as { job?: PublicJob };
        if (active && data.job) setJob(data.job);
      } finally {
        if (active) timer = window.setTimeout(poll, 3_000);
      }
    };
    timer = window.setTimeout(poll, 2_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [authorizedFetch, job.id, job.status]);

  return (
    <section className="aiv-progress-panel">
      <span className={`aiv-progress-icon ${job.status}`}>
        {job.status === "complete" ? <Check aria-hidden="true" /> : job.status === "failed" ? <AlertTriangle aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
      </span>
      <p className="aiv-kicker">{job.status === "complete" ? "VIDEO READY" : job.status === "failed" ? "GENERATION STOPPED" : "PENDING"}</p>
      <h1>{job.status === "complete" ? "Your shot is ready." : job.status === "failed" ? "The video could not be completed." : "Your video was submitted."}</h1>
      <p>{job.errorMessage || formatRemaining(job)}</p>
      <div
        className="aiv-progress-track"
        role="progressbar"
        aria-label="Video generation progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
      >
        <span style={{ width: `${job.progress}%` }} />
      </div>
      <div className="aiv-progress-meta">
        <strong>{job.progress}%</strong>
        <span>{AI_VIDEO_MODELS[job.modelKey].name} · {job.quality} · {job.durationSeconds}s</span>
      </div>
      <div className="aiv-actions">
        {job.status === "complete" ? (
          <Link href={sceneId ? `/experiments/ai-video/scene/${sceneId}` : `/experiments/ai-video/media/${job.id}`}><Play aria-hidden="true" /> {sceneId ? "View scene" : "View video"}</Link>
        ) : job.status === "failed" ? (
          <Link href="/experiments/ai-video/create"><RefreshCw aria-hidden="true" /> Try again</Link>
        ) : (
          <Link href="/experiments/ai-video"><House aria-hidden="true" /> Return home</Link>
        )}
        <Link href="/experiments/ai-video/library" className="secondary"><Library aria-hidden="true" /> Library</Link>
      </div>
    </section>
  );
}

function PicturePending() {
  return (
    <section className="aiv-progress-panel">
      <span className="aiv-progress-icon pending"><Clock3 aria-hidden="true" /></span>
      <p className="aiv-kicker">PENDING</p>
      <h1>Your picture was submitted.</h1>
      <p>Your local GPU is creating it now. Keep this screen open until the result is saved.</p>
      <div className="aiv-picture-loader" aria-label="Picture generation pending"><span /></div>
    </section>
  );
}

function GenerationRange({
  label, value, min, max, step, hint, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  hint: string; onChange: (value: number) => void;
}) {
  const update = (next: number) => {
    const bounded = Math.min(max, Math.max(min, next));
    const snapped = min + Math.round((bounded - min) / step) * step;
    onChange(Number(snapped.toFixed(3)));
  };
  return (
    <label className="aiv-range-control">
      <span><strong>{label}</strong><output>{value}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => update(Number(event.target.value))} />
      <small>{hint} · {min}–{max}</small>
    </label>
  );
}

function CreateView() {
  const searchParams = useSearchParams();
  const extendMediaId = searchParams.get("extend");
  const animateMediaId = searchParams.get("animate");
  const editMediaId = searchParams.get("edit");
  const requestedSceneId = searchParams.get("scene");
  const startsWithVideo = Boolean(
    extendMediaId || animateMediaId || searchParams.get("mode") === "video",
  );
  const authorizedFetch = useAuthorizedFetch();
  const { user } = useUser();
  const { useProduction } = useProductionMode(user?.id);
  const [creationType, setCreationType] = useState<CreationType>(startsWithVideo ? "video" : "picture");
  const [pictureModel, setPictureModel] = useState<PictureModelKey>("zimage");
  const [picturePreset, setPicturePreset] = useState<PicturePresetKey>("medium");
  const [pictureAspect, setPictureAspect] = useState<PictureAspectKey>("landscape");
  const [editStrength, setEditStrength] = useState(0.6);
  const [videoModelKey, setVideoModelKey] = useState<AiVideoModelKey>("wan22");
  const videoModel = AI_VIDEO_MODELS[videoModelKey];
  const [quality, setQuality] = useState(extendMediaId ? "480p" : "480p");
  const [outputWidth, setOutputWidth] = useState(256);
  const [outputHeight, setOutputHeight] = useState(256);
  const [numFrames, setNumFrames] = useState(9);
  const [frameRate, setFrameRate] = useState(1);
  const [inferenceSteps, setInferenceSteps] = useState(1);
  const [guidanceScale, setGuidanceScale] = useState(0);
  const [videoCrf, setVideoCrf] = useState(28);
  const [generationPreset, setGenerationPreset] = useState<GenerationPreset>("test");
  const [gpuTemperature, setGpuTemperature] = useState<GpuTemperature>("checking");
  const [source, setSource] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState(0);
  const [stopGpuWhenQueueComplete, setStopGpuWhenQueueComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<PublicJob | null>(null);
  const [createdMedia, setCreatedMedia] = useState<PublicMedia | null>(null);
  const [createdSceneId, setCreatedSceneId] = useState<string | null>(null);
  const [extendMedia, setExtendMedia] = useState<PublicMedia | null>(null);
  const [animateMedia, setAnimateMedia] = useState<PublicMedia | null>(null);
  const [editMedia, setEditMedia] = useState<PublicMedia | null>(null);
  const preview = useMemo(() => (source ? URL.createObjectURL(source) : ""), [source]);
  const renderEstimateSeconds = useMemo(() => {
    const baseEstimate = videoModelKey === "wan22"
      ? quality === "720p" ? 600 : 300
      : 180;
    const basePixels = videoModelKey === "wan22"
      ? quality === "720p" ? 1280 * 720 : 832 * 480
      : 768 * 512;
    const pixels = videoModelKey === "wan22"
      ? basePixels
      : outputWidth * outputHeight;
    const baseFrames = videoModelKey === "wan22" ? 81 : 121;
    const computeScale =
      (pixels / basePixels) *
      (numFrames / baseFrames) *
      (videoModelKey === "wan22" ? inferenceSteps / 20 : 1);
    return Math.max(20, Math.round(baseEstimate * computeScale));
  }, [inferenceSteps, numFrames, outputHeight, outputWidth, quality, videoModelKey]);
  const estimatedTotalSeconds =
    renderEstimateSeconds + (useProduction && gpuTemperature === "cold" ? 180 : 0);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (creationType !== "video" || !useProduction) {
      setGpuTemperature("unknown");
      return;
    }
    let active = true;
    let timer = 0;
    const check = async () => {
      try {
        const response = await authorizedFetch(
          `/api/experiments/ai-video/capacity?model=${videoModelKey}`,
        );
        const data = await readApiResponse<{ state?: "warm" | "cold"; error?: string }>(
          response,
          "GPU status unavailable",
        );
        if (active) setGpuTemperature(response.ok && data.state ? data.state : "unknown");
      } catch {
        if (active) setGpuTemperature("unknown");
      } finally {
        if (active) timer = window.setTimeout(check, 30_000);
      }
    };
    setGpuTemperature("checking");
    void check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authorizedFetch, creationType, useProduction, videoModelKey]);
  useEffect(() => {
    if (!extendMediaId) return;
    authorizedFetch(`/api/experiments/ai-video/media/${extendMediaId}`)
      .then(async response => {
        const data = await response.json() as { media?: PublicMedia; error?: string };
        if (!response.ok || !data.media?.hasLastFrame) throw new Error(data.error || "This video does not have a saved last frame.");
        setExtendMedia(data.media);
        setPrompt(`Continue the scene from the previous shot: ${data.media.prompt}`);
      })
      .catch(error => setError(error instanceof Error ? error.message : "Unable to extend this video."));
  }, [authorizedFetch, extendMediaId]);
  useEffect(() => {
    if (!animateMediaId || extendMediaId) return;
    authorizedFetch(`/api/experiments/ai-video/media/${animateMediaId}`)
      .then(async response => {
        const data = await response.json() as { media?: PublicMedia; error?: string };
        if (
          !response.ok ||
          !data.media ||
          data.media.mediaType !== "picture" ||
          data.media.status !== "complete"
        ) {
          throw new Error(data.error || "This picture is unavailable for animation.");
        }
        setAnimateMedia(data.media);
      })
      .catch(error => setError(error instanceof Error ? error.message : "Unable to load this picture."));
  }, [animateMediaId, authorizedFetch, extendMediaId]);
  useEffect(() => {
    if (!editMediaId) return;
    authorizedFetch(`/api/experiments/ai-video/media/${editMediaId}`)
      .then(async response => {
        const data = await response.json() as { media?: PublicMedia; error?: string };
        if (
          !response.ok ||
          !data.media ||
          data.media.mediaType !== "picture" ||
          data.media.status !== "complete"
        ) {
          throw new Error(data.error || "This picture is unavailable for editing.");
        }
        setEditMedia(data.media);
        setCreationType("picture");
        setPictureModel("zimage");
        setPrompt(`Edit this image: ${data.media.prompt}`);
        const ratio = data.media.width / Math.max(1, data.media.height);
        setPictureAspect(ratio > 1.2 ? "landscape" : ratio < 0.84 ? "portrait" : "square");
      })
      .catch(error => setError(error instanceof Error ? error.message : "Unable to load this picture."));
  }, [authorizedFetch, editMediaId]);

  function chooseCreationType(next: CreationType) {
    setCreationType(next);
    setError("");
    setSource(null);
    setPrompt("");
    setNegativePrompt("");
  }

  function chooseVideoModel(next: AiVideoModelKey) {
    setVideoModelKey(next);
    setGenerationPreset("test");
    setQuality(next === "wan22" ? "480p" : "standard");
    setOutputWidth(256);
    setOutputHeight(256);
    setNumFrames(9);
    setFrameRate(1);
    setInferenceSteps(1);
    setGuidanceScale(0);
    setVideoCrf(28);
  }

  function applyGenerationPreset(preset: Exclude<GenerationPreset, "custom">) {
    setGenerationPreset(preset);
    setSeed(0);
    if (videoModelKey === "wan22") {
      if (preset === "test") {
        setQuality("480p");
        setNumFrames(9);
        setFrameRate(1);
        setInferenceSteps(1);
        setGuidanceScale(0);
        setVideoCrf(28);
      } else if (preset === "fast") {
        setQuality("480p");
        setNumFrames(81);
        setFrameRate(16);
        setInferenceSteps(20);
        setGuidanceScale(3.5);
        setVideoCrf(23);
      } else {
        setQuality("720p");
        setNumFrames(161);
        setFrameRate(16);
        setInferenceSteps(80);
        setGuidanceScale(3.5);
        setVideoCrf(14);
      }
      return;
    }
    if (preset === "test") {
      setOutputWidth(256);
      setOutputHeight(256);
      setNumFrames(9);
      setFrameRate(1);
    } else if (preset === "fast") {
      setOutputWidth(768);
      setOutputHeight(512);
      setNumFrames(121);
      setFrameRate(24);
    } else {
      setOutputWidth(1920);
      setOutputHeight(1088);
      setNumFrames(241);
      setFrameRate(24);
    }
  }

  function customize(action: () => void) {
    setGenerationPreset("custom");
    action();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    setSubmissionStatus("Submitting…");
    try {
      if (creationType === "picture") {
        const response = await authorizedFetch(
          "/api/experiments/ai-video/local-source",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              negativePrompt,
              model: pictureModel,
              preset: picturePreset,
              aspect: pictureAspect,
              seed,
              referenceMediaId:
                editMediaId && AI_PICTURE_MODELS[pictureModel].supportsReference
                  ? editMediaId
                  : undefined,
              strength: editStrength,
              displayName: user?.fullName || "",
              email: user?.primaryEmailAddress?.emailAddress || "",
              avatarUrl: user?.imageUrl || "",
              stopGpuWhenQueueComplete,
            }),
          },
        );
        const data = (await response.json()) as { media?: PublicMedia; error?: string };
        if (!response.ok || !data.media) {
          throw new Error(data.error || "Picture generation could not finish.");
        }
        setCreatedMedia(data.media);
        return;
      }

      const form = new FormData();
      form.set("modelKey", videoModelKey);
      form.set("quality", quality);
      form.set("duration", "5");
      form.set("outputWidth", String(outputWidth));
      form.set("outputHeight", String(outputHeight));
      form.set("numFrames", String(numFrames));
      form.set("frameRate", String(frameRate));
      form.set("inferenceSteps", String(inferenceSteps));
      form.set("guidanceScale", String(guidanceScale));
      form.set("videoCrf", String(videoCrf));
      form.set("prompt", prompt);
      form.set("negativePrompt", negativePrompt);
      form.set("seed", String(seed));
      form.set("stopGpuWhenQueueComplete", String(stopGpuWhenQueueComplete));
      form.set(
        "sourceProvider",
        useProduction && videoModel.supportsImage ? "upload" : "none",
      );
      if (source) {
        setSubmissionStatus(source.size > 1_500_000 ? "Optimizing reference…" : "Submitting…");
        const uploadSource = await optimizeReferenceImage(source);
        form.set("sourceImage", uploadSource);
        setSubmissionStatus("Submitting…");
      }
      else if (animateMediaId) form.set("referenceMediaId", animateMediaId);
      if (extendMediaId) form.set("extendMediaId", extendMediaId);
      if (requestedSceneId) form.set("sceneId", requestedSceneId);
      form.set("displayName", user?.fullName || "");
      form.set("email", user?.primaryEmailAddress?.emailAddress || "");
      form.set("avatarUrl", user?.imageUrl || "");
      const response = await authorizedFetch("/api/experiments/ai-video/jobs", {
        method: "POST",
        body: form,
      });
      const data = await readApiResponse<{
        job?: PublicJob;
        sceneId?: string | null;
        error?: string;
      }>(response, "The generation request was not accepted");
      if (!response.ok || !data.job) {
        throw new Error(data.error || "Video generation could not start.");
      }
      setJob(data.job);
      setCreatedSceneId(data.sceneId || null);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Generation could not start.",
      );
    } finally {
      setSubmitting(false);
      setSubmissionStatus("");
    }
  }

  if (job) {
    return (
      <main className="aiv-page">
        <ExperimentHeader />
        <ProgressPanel initialJob={job} sceneId={createdSceneId} />
        <BottomNavigation />
      </main>
    );
  }
  if (submitting && creationType === "picture") {
    return (
      <main className="aiv-page">
        <ExperimentHeader />
        <PicturePending />
        <BottomNavigation />
      </main>
    );
  }
  if (createdMedia) {
    return <MediaView mediaId={createdMedia.id} initialMedia={createdMedia} />;
  }

  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <form className="aiv-create" onSubmit={submit} noValidate>
        <div className="aiv-create-heading">
          <p className="aiv-kicker">CREATE</p>
          <h1>Make something new.</h1>
          <p>
            {useProduction
              ? "Everything you submit is logged and saved privately to your account."
              : "Demo mode returns a free sample and never calls a generation model."}
          </p>
          <div className="aiv-type-pill" role="group" aria-label="Creation type">
            <button
              type="button"
              className={creationType === "picture" ? "selected" : ""}
              aria-pressed={creationType === "picture"}
              onClick={() => chooseCreationType("picture")}
            >
              <PictureIcon aria-hidden="true" /> Picture
            </button>
            <button
              type="button"
              className={creationType === "video" ? "selected" : ""}
              aria-pressed={creationType === "video"}
              onClick={() => chooseCreationType("video")}
            >
              <Video aria-hidden="true" /> Video
            </button>
          </div>
        </div>

        <section className="aiv-form-section">
          <div className="aiv-step">
            <span>1</span>
            <div><strong>Choose a model</strong><small>Only models available for {creationType} creation are shown.</small></div>
          </div>
          <div className="aiv-choice-grid">
            {creationType === "picture"
              ? (Object.keys(AI_PICTURE_MODELS) as PictureModelKey[]).map((key) => {
                  const option = AI_PICTURE_MODELS[key];
                  return (
                    <button
                      type="button"
                      key={key}
                      className={pictureModel === key ? "selected" : ""}
                      onClick={() => {
                        setPictureModel(key);
                        setError(
                          editMediaId && !option.supportsReference
                            ? `${option.name} cannot edit a reference image. Choose Z-Image Turbo to keep editing.`
                            : "",
                        );
                      }}
                    >
                      <span>PICTURE</span>
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                      {pictureModel === key && <Check aria-hidden="true" />}
                    </button>
                  );
                })
              : (Object.keys(AI_VIDEO_MODELS) as AiVideoModelKey[]).map((key) => {
                  const option = AI_VIDEO_MODELS[key];
                  return (
                    <button type="button" key={key} className={videoModelKey === key ? "selected" : ""} onClick={() => chooseVideoModel(key)}>
                      <span>{option.requiresImage ? "IMAGE-GUIDED" : "TEXT / IMAGE + AUDIO"}</span>
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                      {videoModelKey === key && <Check aria-hidden="true" />}
                    </button>
                  );
                })}
          </div>
        </section>

        <section className="aiv-form-section">
          <div className="aiv-step">
            <span>2</span>
            <div>
              <strong>
                {creationType === "picture"
                  ? "Describe the picture"
                    : videoModel.requiresImage
                      ? "Add an image and describe the motion"
                    : "Optionally add an image and describe the scene"}
              </strong>
              <small>
                {creationType === "picture"
                  ? useProduction
                    ? "Choose a speed, canvas, and model. Finished pictures stay private."
                    : "Demo mode returns a free example picture for your private library."
                  : videoModel.requiresImage
                    ? useProduction
                      ? "Upload a JPG, PNG, or WebP up to 12 MB."
                      : "Choose and preview a reference image. Demo mode still returns a sample video."
                    : useProduction
                      ? "LTX accepts an optional reference image and generates synchronized audio."
                      : "Optionally preview a reference image. Demo mode returns a free example video."}
              </small>
            </div>
          </div>
          {creationType === "picture" && editMedia && (
            <div className="aiv-reference-block">
              <span className="aiv-reference-label"><Pencil aria-hidden="true" /> Editing reference</span>
              <div className="aiv-upload has-preview aiv-extend-source">
                <PrivateMediaAsset mediaId={editMedia.id} mediaType="picture" thumbnail>
                  <Clock3 aria-hidden="true" />
                </PrivateMediaAsset>
                <strong>Saved picture</strong>
                <span>
                  {AI_PICTURE_MODELS[pictureModel].supportsReference
                    ? "Your prompt will transform this picture while retaining its composition."
                    : "Choose Z-Image Turbo to use this reference."}
                </span>
              </div>
              {AI_PICTURE_MODELS[pictureModel].supportsReference && (
                <GenerationRange
                  label="Edit strength"
                  value={editStrength}
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  hint="Lower preserves more; higher changes more"
                  onChange={setEditStrength}
                />
              )}
            </div>
          )}
          {creationType === "video" && videoModel.supportsImage && extendMedia ? (
            <div className="aiv-reference-block">
              <span className="aiv-reference-label"><PictureIcon aria-hidden="true" /> Reference image</span>
              <div className="aiv-upload has-preview aiv-extend-source">
              <PrivateMediaAsset mediaId={extendMedia.id} mediaType="picture" thumbnail>
                <Clock3 aria-hidden="true" />
              </PrivateMediaAsset>
              <strong>Saved last frame</strong>
              <span>
                {useProduction
                  ? "This exact frame starts the next clip."
                  : "Previewing the saved frame. Demo mode will return a sample result."}
              </span>
              </div>
            </div>
          ) : creationType === "video" && videoModel.supportsImage && (
            <div className="aiv-reference-block">
              <span className="aiv-reference-label"><PictureIcon aria-hidden="true" /> Reference image</span>
              <label className={`aiv-upload ${preview || animateMedia ? "has-preview" : ""}`}>
                {preview ? (
                  <img src={preview} alt="Selected reference" />
                ) : animateMedia ? (
                  <PrivateMediaAsset mediaId={animateMedia.id} mediaType="picture" thumbnail>
                    <Clock3 aria-hidden="true" />
                  </PrivateMediaAsset>
                ) : (
                  <Upload aria-hidden="true" />
                )}
                <strong>{source ? source.name : animateMedia ? "Saved picture" : "Choose reference image"}</strong>
                <span>
                  {source || animateMedia
                    ? "Preview ready · large photos optimize automatically · click to replace"
                    : "The composition anchors the generated motion."}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setSource(event.target.files?.[0] || null)}
                />
              </label>
            </div>
          )}
          <label className="aiv-field">
            <span>{creationType === "picture" ? "Picture prompt" : "Video prompt"}</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                creationType === "picture"
                  ? "A cinematic portrait in warm window light, rich texture, editorial composition…"
                  : videoModel.supportsImage
                    ? "A slow cinematic push-in as wind moves through the scene…"
                    : "A wide neon city waking at dawn, with distant traffic and soft rain…"
              }
              maxLength={2000}
            />
            <small>{prompt.length}/2000</small>
          </label>
          {(creationType === "picture" || videoModel.supportsImage) && (
            <label className="aiv-field compact">
              <span>Negative prompt <i>optional</i></span>
              <input
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                placeholder={creationType === "picture" ? "Blur, low detail, distorted anatomy" : "Distortion, flicker, abrupt camera motion"}
              />
            </label>
          )}
        </section>

        <section className="aiv-form-section">
          <div className="aiv-step">
            <span>3</span>
            <div>
              <strong>Set the output</strong>
              <small>Every available {creationType === "video" ? `${videoModel.name} ` : ""}option is shown. Lowest-compute values are selected by default.</small>
            </div>
          </div>
          {creationType === "picture" ? (
            <div className="aiv-preset-row" role="group" aria-label="Picture quality preset">
              {([
                ["fast", "Fast", "Quick draft at a smaller resolution."],
                ["medium", "Medium", "Balanced detail, size, and generation time."],
                ["quality", "Quality", "Largest canvas and maximum model effort."],
              ] as const).map(([key, label, description]) => (
                <button
                  key={key}
                  type="button"
                  className={picturePreset === key ? "selected" : ""}
                  aria-pressed={picturePreset === key}
                  onClick={() => setPicturePreset(key)}
                >
                  <strong>{label}{key === "medium" && <span>Default</span>}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="aiv-preset-row" role="group" aria-label="Generation preset">
              {([
                ["test", "Test", "Cheapest settings to verify the pipeline."],
                ["fast", "Fast", "Balanced settings for a short, viewable result."],
                ["max", "Max", "Highest-quality supported output."],
              ] as const).map(([key, label, description]) => (
                <button
                  key={key}
                  type="button"
                  className={generationPreset === key ? "selected" : ""}
                  aria-pressed={generationPreset === key}
                  onClick={() => applyGenerationPreset(key)}
                >
                  <strong>{label}{key === "test" && <span>Default</span>}</strong>
                  <small>{description}</small>
                </button>
              ))}
              {generationPreset === "custom" && <span className="aiv-custom-badge">Custom</span>}
            </div>
          )}
          <div className="aiv-setting-row">
            <fieldset>
              <legend>{videoModelKey === "wan22" || creationType === "picture" ? "Resolution" : "Canvas"}</legend>
              <div>
                {creationType === "picture" ? (
                  (Object.keys(PICTURE_ASPECTS) as PictureAspectKey[]).map(key => {
                    const dimensions = PICTURE_ASPECTS[key].dimensions[picturePreset];
                    return (
                      <label key={key}>
                        <input type="radio" name="pictureAspect" checked={pictureAspect === key} onChange={() => setPictureAspect(key)} />
                        <span>{PICTURE_ASPECTS[key].label}<small>{dimensions.width} × {dimensions.height}</small></span>
                      </label>
                    );
                  })
                ) : videoModelKey === "wan22" ? (
                  Object.entries(videoModel.qualities).map(([key, option]) => (
                    <label key={key}><input type="radio" name="quality" checked={quality === key} onChange={() => customize(() => setQuality(key))} /><span>{option.label}</span></label>
                  ))
                ) : (
                  <span className="aiv-custom-canvas">{outputWidth} × {outputHeight}</span>
                )}
              </div>
            </fieldset>
            <label className="aiv-seed">
              Seed
              <input type="number" min="0" max="2147483647" step="1" value={seed} onChange={(event) => customize(() => setSeed(Number(event.target.value)))} />
              <small>0 is the lowest valid deterministic seed.</small>
            </label>
          </div>
          {creationType === "video" && (
            <>
              <div className="aiv-advanced-heading">
                <div>
                  <strong>Generation controls</strong>
                  <small>{numFrames} frames at {frameRate} fps · about {(numFrames / frameRate).toFixed(2)} seconds</small>
                </div>
                <span>{videoModelKey === "wan22" ? "WAN 2.2" : "LTX-2.3"}</span>
              </div>
              <div className="aiv-generation-options">
                {videoModelKey === "ltx23" && (
                  <>
                    <GenerationRange label="Width" value={outputWidth} min={256} max={1920} step={32} hint="Pixels, in 32 px increments" onChange={value => customize(() => setOutputWidth(value))} />
                    <GenerationRange label="Height" value={outputHeight} min={256} max={1920} step={32} hint="Pixels, in 32 px increments" onChange={value => customize(() => setOutputHeight(value))} />
                  </>
                )}
                <GenerationRange
                  label="Frames"
                  value={numFrames}
                  min={9}
                  max={videoModelKey === "wan22" ? 161 : 241}
                  step={videoModelKey === "wan22" ? 4 : 8}
                  hint={videoModelKey === "wan22" ? "Must be 4n + 1" : "Must be 8n + 1"}
                  onChange={value => customize(() => setNumFrames(value))}
                />
                <GenerationRange
                  label="Frame rate"
                  value={frameRate}
                  min={1}
                  max={videoModelKey === "wan22" ? 30 : 50}
                  step={1}
                  hint="Playback frames per second"
                  onChange={value => customize(() => setFrameRate(value))}
                />
                {videoModelKey === "wan22" && (
                  <>
                    <GenerationRange label="Inference steps" value={inferenceSteps} min={1} max={80} step={1} hint="More steps can add detail but take longer" onChange={value => customize(() => setInferenceSteps(value))} />
                    <GenerationRange label="Guidance scale" value={guidanceScale} min={0} max={20} step={0.5} hint="How strongly the prompt guides motion" onChange={value => customize(() => setGuidanceScale(value))} />
                    <GenerationRange label="Compression (CRF)" value={videoCrf} min={14} max={28} step={1} hint="28 makes the smallest output; 14 preserves more detail" onChange={value => customize(() => setVideoCrf(value))} />
                  </>
                )}
              </div>
            </>
          )}
        </section>

        {error && <p className="aiv-form-error" role="alert">{error}</p>}
        {useProduction && (
          <label className="aiv-gpu-stop-option">
            <input
              type="checkbox"
              checked={stopGpuWhenQueueComplete}
              onChange={(event) => setStopGpuWhenQueueComplete(event.target.checked)}
            />
            <span>
              <strong>Stop GPU when queue is complete</strong>
              <small>The server will wait for this model’s queue to empty, then use a supported provider shutdown when available.</small>
            </span>
          </label>
        )}
        {creationType === "video" && (
          <aside className="aiv-live-estimate" aria-live="polite">
            <div>
              <Clock3 aria-hidden="true" />
              <span>
                <small>Estimated generation</small>
                <strong>{useProduction ? formatEstimate(estimatedTotalSeconds) : "Instant demo"}</strong>
              </span>
            </div>
            <span className={`aiv-gpu-temperature ${useProduction ? gpuTemperature : "demo"}`}>
              <i />
              {!useProduction
                ? "GPU off"
                : gpuTemperature === "warm"
                  ? "GPU warm"
                  : gpuTemperature === "cold"
                    ? "GPU cold"
                    : gpuTemperature === "checking"
                      ? "Checking GPU"
                      : "GPU unknown"}
            </span>
          </aside>
        )}
        <div className="aiv-create-submit">
          <div><Clock3 aria-hidden="true" /><span>After submission, pending work appears immediately in your private library.</span></div>
          <button
            type="submit"
            disabled={
              submitting ||
              Boolean(editMediaId && !AI_PICTURE_MODELS[pictureModel].supportsReference)
            }
          >
            {submitting ? submissionStatus || "Submitting…" : `Create ${creationType}`} <WandSparkles aria-hidden="true" />
          </button>
        </div>
      </form>
      <BottomNavigation />
    </main>
  );
}

function LibraryView() {
  const { media, loading, error, deleteMedia } = useMedia(true);
  const [filter, setFilter] = useState<"all" | MediaType>("all");
  const filtered = filter === "all" ? media : media.filter((item) => item.mediaType === filter);
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-library">
        <div className="aiv-section-title">
          <div><p className="aiv-kicker">PRIVATE LIBRARY</p><h1>All your media.</h1><p>Pictures and videos are private to your signed-in account.</p></div>
          <Link href="/experiments/ai-video/create"><Plus aria-hidden="true" /> New media</Link>
        </div>
        <div className="aiv-library-filter" role="group" aria-label="Filter library by media type">
          {(["all", "picture", "video", "scene"] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={filter === option ? "selected" : ""}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === "picture" && <PictureIcon aria-hidden="true" />}
              {option === "video" && <Video aria-hidden="true" />}
              {option === "scene" && <Clapperboard aria-hidden="true" />}
              {option}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="aiv-empty">Loading your library…</div>
        ) : error ? (
          <div className="aiv-empty"><strong>Library unavailable</strong><span>{error}</span></div>
        ) : filtered.length ? (
          <div className="aiv-library-grid">
            {filtered.map((item) => (
              <MediaCard media={item} key={item.id} onDelete={deleteMedia} />
            ))}
          </div>
        ) : (
          <div className="aiv-empty">
            <Images aria-hidden="true" />
            <strong>{filter === "all" ? "Your library is empty." : `No ${filter}s yet.`}</strong>
            <span>Submit a picture or video and it will appear here automatically.</span>
            <Link href="/experiments/ai-video/create">Create your first item</Link>
          </div>
        )}
      </section>
      <BottomNavigation />
    </main>
  );
}

function QueueView() {
  const authorizedFetch = useAuthorizedFetch();
  const [processes, setProcesses] = useState<QueueProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reconciler, setReconciler] = useState<QueueReconciler | null>(null);

  const load = useCallback(async () => {
    const response = await authorizedFetch("/api/experiments/ai-video/queue");
    const data = await readApiResponse<{
      processes?: QueueProcess[];
      reconciler?: QueueReconciler | null;
      error?: string;
    }>(response, "Queue unavailable");
    if (!response.ok || !data.processes) {
      throw new Error(data.error || "Queue unavailable.");
    }
    setProcesses(data.processes);
    setReconciler(data.reconciler || null);
    setLoading(false);
    setError("");
    return data.processes.some(process =>
      process.status === "queued" || process.status === "running"
    );
  }, [authorizedFetch]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const hasActive = await load();
        if (active && hasActive) timer = window.setTimeout(poll, 3_000);
      } catch (loadError) {
        if (active) {
          setLoading(false);
          setError(loadError instanceof Error ? loadError.message : "Queue unavailable.");
        }
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  async function cancelProcess(process: QueueProcess) {
    if (!window.confirm(`Cancel "${process.title}"?`)) return;
    setCancelling(process.id);
    setError("");
    try {
      const response = await authorizedFetch("/api/experiments/ai-video/queue/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: process.id, kind: process.kind }),
      });
      const data = await readApiResponse<{ cancelled?: boolean; error?: string }>(
        response,
        "Cancellation failed",
      );
      if (!response.ok || !data.cancelled) {
        throw new Error(data.error || "Cancellation failed.");
      }
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Cancellation failed.");
    } finally {
      setCancelling(null);
    }
  }

  function processCard(process: QueueProcess) {
    const active = process.status === "queued" || process.status === "running";
    const cancelled = process.errorMessage === "Cancelled by user.";
    const destination = process.mediaId
      ? `/experiments/ai-video/media/${process.mediaId}`
      : process.sceneId
        ? `/experiments/ai-video/scene/${process.sceneId}`
        : null;
    return (
      <article className="aiv-queue-card" key={`${process.kind}-${process.id}`}>
        <div className="aiv-queue-card-heading">
          <span className={`aiv-queue-state ${process.status}`}>
            {active ? <Clock3 aria-hidden="true" /> : cancelled || process.status === "failed" ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}
          </span>
          <div>
            <p className="aiv-kicker">{process.detail}</p>
            <h2>{process.title}</h2>
          </div>
          <strong className={`aiv-queue-status ${process.status}`}>
            {cancelled ? "Cancelled" : process.status}
          </strong>
        </div>
        <div
          className="aiv-progress-track"
          role="progressbar"
          aria-label={`${process.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={process.progress}
        >
          <span style={{ width: `${process.progress}%` }} />
        </div>
        <div className="aiv-queue-meta">
          <span><strong>{process.progress}%</strong></span>
          <span>
            {process.errorMessage && active
              ? process.errorMessage
              : process.status === "queued"
              ? `Waiting to start · ${formatEstimate(process.estimatedSeconds)} estimate`
              : process.status === "running"
                ? `${formatEstimate(process.remainingSeconds)} remaining · ${formatEstimate(process.estimatedSeconds)} estimate`
                : cancelled
                  ? "Stopped"
                  : process.status === "complete"
                    ? "Complete"
                    : process.errorMessage || "Stopped with an error"}
          </span>
        </div>
        <details className="aiv-process-details">
          <summary>Process details</summary>
          <dl>
            <div><dt>Process ID</dt><dd>{process.id}</dd></div>
            {process.mediaId && <div><dt>Media ID</dt><dd>{process.mediaId}</dd></div>}
            {process.providerCallId && <div><dt>Provider call</dt><dd>{process.providerCallId}</dd></div>}
            <div><dt>Submitted</dt><dd>{new Date(process.createdAt).toLocaleString()}</dd></div>
            <div><dt>Last update</dt><dd>{new Date(process.updatedAt).toLocaleString()}</dd></div>
            <div><dt>Provider contact</dt><dd>{process.lastProviderContactAt ? new Date(process.lastProviderContactAt).toLocaleString() : "Not contacted yet"}</dd></div>
            <div><dt>Retries</dt><dd>{process.retryCount || 0}</dd></div>
            <div><dt>Private file</dt><dd>{process.hasStoredFile ? "Saved to storage" : "Not saved yet"}</dd></div>
            {process.stopGpuWhenQueueComplete && (
              <div>
                <dt>GPU stop</dt>
                <dd>{process.gpuShutdownStatus === "waiting" ? "Waiting for provider queue" : process.gpuShutdownMessage || process.gpuShutdownStatus}</dd>
              </div>
            )}
          </dl>
        </details>
        <div className="aiv-queue-actions">
          {destination && <Link href={destination}>Open</Link>}
          {process.cancelable && (
            <button
              type="button"
              onClick={() => cancelProcess(process)}
              disabled={cancelling === process.id}
            >
              <X aria-hidden="true" />
              {cancelling === process.id ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </article>
    );
  }

  const active = processes.filter(process =>
    process.status === "queued" || process.status === "running"
  );
  const history = processes.filter(process =>
    process.status === "complete" || process.status === "failed"
  );
  const recentErrors = processes
    .filter(process => Boolean(process.errorMessage))
    .slice(0, 3);

  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-library aiv-queue">
        <div className="aiv-section-title">
          <div>
            <p className="aiv-kicker">PROCESSING</p>
            <h1>Queue</h1>
            <p>Generation, final-frame, and export work across your private media.</p>
          </div>
        </div>
        <div className="aiv-reconciler-strip">
          <span><Settings2 aria-hidden="true" /> Server reconciliation</span>
          <strong>
            {reconciler?.lastSuccessAt
              ? `Last successful check ${new Date(reconciler.lastSuccessAt).toLocaleTimeString()}`
              : "Waiting for the first scheduled check"}
          </strong>
        </div>
        {recentErrors.length > 0 && (
          <section className="aiv-recent-errors" aria-labelledby="recent-processing-errors">
            <h2 id="recent-processing-errors"><AlertTriangle aria-hidden="true" /> Recent issues</h2>
            {recentErrors.map(process => (
              <div key={`error-${process.kind}-${process.id}`}>
                <strong>{process.title}</strong>
                <span>{process.errorMessage}</span>
              </div>
            ))}
          </section>
        )}
        {error && <p className="aiv-form-error">{error}</p>}
        {loading ? (
          <div className="aiv-empty">Loading your queue...</div>
        ) : (
          <>
            <section className="aiv-queue-section">
              <div className="aiv-queue-section-title">
                <h2>Active</h2><span>{active.length}</span>
              </div>
              {active.length ? (
                <div className="aiv-queue-list">{active.map(processCard)}</div>
              ) : (
                <div className="aiv-empty"><Check aria-hidden="true" /><strong>Nothing is waiting.</strong><span>New processes will appear here immediately.</span></div>
              )}
            </section>
            <section className="aiv-queue-section">
              <div className="aiv-queue-section-title">
                <h2>All processes</h2><span>{history.length}</span>
              </div>
              {history.length ? (
                <div className="aiv-queue-list">{history.map(processCard)}</div>
              ) : (
                <div className="aiv-empty">No completed processes yet.</div>
              )}
            </section>
          </>
        )}
      </section>
      <BottomNavigation />
    </main>
  );
}

function MediaView({
  mediaId,
  initialMedia = null,
}: {
  mediaId: string;
  initialMedia?: PublicMedia | null;
}) {
  const authorizedFetch = useAuthorizedFetch();
  const [media, setMedia] = useState<PublicMedia | null>(initialMedia);
  const [error, setError] = useState("");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const [lastFrameTask, setLastFrameTask] = useState<PublicTask | null>(null);
  const savedDuration = useRef<number | null>(null);
  const lastFrameRetryStarted = useRef(false);

  const captureDuration = useCallback((duration: number) => {
    setActualDuration(duration);
    if (savedDuration.current === duration) return;
    savedDuration.current = duration;
    void authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: duration }),
    });
  }, [authorizedFetch, mediaId]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const load = async () => {
      try {
        const response = await authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`);
        const data = (await response.json()) as {
          media?: PublicMedia;
          sceneId?: string | null;
          job?: PublicJob | null;
          lastFrameTask?: PublicTask | null;
          error?: string;
        };
        if (!response.ok || !data.media) throw new Error(data.error || "Media unavailable.");
        if (!active) return;
        setMedia(data.media);
        setSceneId(data.sceneId || null);
        setJob(data.job || null);
        setLastFrameTask(data.lastFrameTask || null);

        const needsServerFrame =
          data.media.mediaType === "video" &&
          data.media.hasContent &&
          data.media.status !== "failed" &&
          (
            (!data.media.hasLastFrame && !data.lastFrameTask) ||
            data.lastFrameTask?.status === "failed"
          );
        if (needsServerFrame && !lastFrameRetryStarted.current) {
          lastFrameRetryStarted.current = true;
          const retry = await authorizedFetch(
            `/api/experiments/ai-video/media/${mediaId}/last-frame`,
            { method: "POST" },
          );
          const retryData = await readApiResponse<{
            media?: PublicMedia;
            task?: PublicTask;
            error?: string;
          }>(retry, "Last-frame extraction could not start");
          if (!retry.ok || !retryData.task) {
            throw new Error(retryData.error || "Last-frame extraction could not start.");
          }
          if (!active) return;
          if (retryData.media) setMedia(retryData.media);
          setLastFrameTask(retryData.task);
          timer = window.setTimeout(load, 3_000);
          return;
        }

        if (
          isPending(data.media.status) ||
          data.lastFrameTask?.status === "submitted" ||
          data.lastFrameTask?.status === "pending"
        ) {
          timer = window.setTimeout(load, 3_000);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Media unavailable.");
      }
    };
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [authorizedFetch, mediaId]);

  return (
    <main className="aiv-player-page">
      <ExperimentHeader close />
      {error ? (
        <section className="aiv-player-message"><strong>Media unavailable</strong><span>{error}</span><Link href="/experiments/ai-video/library">Return to library</Link></section>
      ) : !media ? (
        <section className="aiv-player-message">Loading private media…</section>
      ) : isPending(media.status) && media.mediaType === "video" ? (
        <section className="aiv-player aiv-generation-player">
          <div className="aiv-generation-preview">
            {media.hasThumbnail ? (
              <PrivateMediaAsset mediaId={media.id} mediaType="picture" thumbnail className="aiv-generation-reference">
                <div className="aiv-generation-placeholder"><Clock3 aria-hidden="true" /></div>
              </PrivateMediaAsset>
            ) : (
              <div className="aiv-generation-placeholder"><Video aria-hidden="true" /></div>
            )}
            <div className="aiv-generation-overlay">
              <span className="aiv-generation-status"><Clock3 aria-hidden="true" /> Generating video</span>
              <div className="aiv-generation-copy">
                <p className="aiv-kicker">{job?.status === "running" ? "IN PROGRESS" : "SUBMITTED"}</p>
                <h1>Your preview is in motion.</h1>
                <p>{media.errorMessage || (job ? formatRemaining(job) : "Preparing the video generation service…")}</p>
                {media.errorMessage && (
                  <div className="aiv-processing-warning">
                    <AlertTriangle aria-hidden="true" />
                    <span>The result check hit a problem. Retrying automatically.</span>
                  </div>
                )}
              </div>
              <div className="aiv-generation-progress">
                <div
                  className="aiv-progress-track"
                  role="progressbar"
                  aria-label="Video generation progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={job?.progress || 4}
                >
                  <span style={{ width: `${job?.progress || 4}%` }} />
                </div>
                <div className="aiv-progress-meta">
                  <strong>{job?.progress || 4}%</strong>
                  <span>{modelName(media)} · {media.quality} · {media.durationSeconds}s</span>
                </div>
              </div>
            </div>
          </div>
          <div className="aiv-actions aiv-player-actions">
            <Link href="/experiments/ai-video/library"><Library aria-hidden="true" /> Library</Link>
            <Link className="secondary" href="/experiments/ai-video"><House aria-hidden="true" /> AI Video home</Link>
          </div>
        </section>
      ) : isPending(media.status) ? (
        <section className="aiv-progress-panel">
          <span className="aiv-progress-icon pending"><Clock3 aria-hidden="true" /></span>
          <p className="aiv-kicker">PENDING</p>
          <h1>Your {media.mediaType} was submitted.</h1>
          <p>{media.errorMessage || "It will appear here as soon as processing finishes."}</p>
          <div className="aiv-picture-loader" aria-label="Media generation pending"><span /></div>
          <div className="aiv-actions"><Link href="/experiments/ai-video/library"><Library aria-hidden="true" /> Library</Link></div>
        </section>
      ) : media.status === "failed" ? (
        <section className="aiv-player-message"><strong>Generation stopped</strong><span>{media.errorMessage || "This item could not be completed."}</span><Link href="/experiments/ai-video/create">Try again</Link></section>
      ) : (
        <section className="aiv-player">
          <div className={`aiv-video-stage ${media.mediaType === "picture" ? "picture" : ""}`}>
            {media.mediaType === "video" ? (
              <ScannableVideo
                mediaId={media.id}
                onDuration={captureDuration}
              />
            ) : (
              <PrivateMediaAsset mediaId={media.id} mediaType="picture" className="aiv-picture">
                <div className="aiv-player-message">Preparing secure picture…</div>
              </PrivateMediaAsset>
            )}
          </div>
          <div className="aiv-player-info">
            <div><p className="aiv-kicker">{modelName(media)}</p><h1>{media.prompt}</h1></div>
            <span>
              {media.width} × {media.height}
              {media.mediaType === "video" ? ` · ${formatDuration(actualDuration ?? media.durationSeconds)}` : ""}
              {" · "}Seed {media.seed}
            </span>
          </div>
          {media.mediaType === "video" && (
            <div className="aiv-actions aiv-player-actions">
              {media.hasLastFrame && lastFrameTask?.status !== "failed" ? (
                <Link href={`/experiments/ai-video/create?mode=video&extend=${media.id}${sceneId ? `&scene=${sceneId}` : ""}`}>
                  <Plus aria-hidden="true" /> Extend video
                </Link>
              ) : (
                <span className="aiv-muted-action">
                  <Clock3 aria-hidden="true" />
                  {lastFrameTask?.status === "failed"
                    ? "Retrying the last frame on the server"
                    : "Preparing the last frame on the server"}
                </span>
              )}
              {sceneId && <Link className="secondary" href={`/experiments/ai-video/scene/${sceneId}`}><Clapperboard aria-hidden="true" /> Open scene</Link>}
            </div>
          )}
          {media.mediaType === "picture" && (
            <div className="aiv-actions aiv-player-actions">
              <Link href={`/experiments/ai-video/create?mode=video&animate=${media.id}`}>
                <WandSparkles aria-hidden="true" /> Animate picture
              </Link>
              <Link className="secondary" href={`/experiments/ai-video/create?edit=${media.id}`}>
                <Pencil aria-hidden="true" /> Edit picture
              </Link>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

type PublicTask = {
  id: string; status: MediaStatus; progress: number; outputMediaId: string | null;
  errorMessage: string | null;
};

function SceneView({ sceneId }: { sceneId: string }) {
  const authorizedFetch = useAuthorizedFetch();
  const observedExportPending = useRef(false);
  const [title, setTitle] = useState("Scene");
  const [items, setItems] = useState<PublicMedia[]>([]);
  const [index, setIndex] = useState(0);
  const [task, setTask] = useState<PublicTask | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const savedSceneDurations = useRef(new Map<string, number>());

  const captureSceneDuration = useCallback((mediaId: string, duration: number) => {
    setItems(currentItems => currentItems.map(item =>
      item.id === mediaId ? { ...item, durationSeconds: duration } : item
    ));
    if (savedSceneDurations.current.get(mediaId) === duration) return;
    savedSceneDurations.current.set(mediaId, duration);
    void authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: duration }),
    });
  }, [authorizedFetch]);

  const load = useCallback(async () => {
    const response = await authorizedFetch(`/api/experiments/ai-video/scenes/${sceneId}`);
    const data = await response.json() as {
      scene?: { title: string }; items?: PublicMedia[]; exportTask?: PublicTask | null; error?: string;
    };
    if (!response.ok || !data.scene) throw new Error(data.error || "Scene unavailable.");
    setTitle(data.scene.title);
    setItems(data.items || []);
    setTask(data.exportTask || null);
    return data.exportTask;
  }, [authorizedFetch, sceneId]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const current = await load();
        if (active && current && isPending(current.status)) timer = window.setTimeout(poll, 3000);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Scene unavailable.");
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);

  useEffect(() => {
    if (task?.status === "complete" && task.outputMediaId) {
      window.location.assign(`/experiments/ai-video/media/${task.outputMediaId}`);
    }
  }, [task?.outputMediaId, task?.status]);

  async function exportScene() {
    setExporting(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/experiments/ai-video/scenes/${sceneId}/export`, { method: "POST" });
      const data = await response.json() as { task?: PublicTask | null; outputMediaId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Export could not start.");
      if (data.task) setTask(data.task);
      else if (data.outputMediaId) window.location.href = `/experiments/ai-video/media/${data.outputMediaId}`;
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export could not start.");
    } finally {
      setExporting(false);
    }
  }

  const current = items[index];
  return (
    <main className="aiv-player-page">
      <ExperimentHeader close />
      {error && !current ? (
        <section className="aiv-player-message"><strong>Scene unavailable</strong><span>{error}</span></section>
      ) : !current ? (
        <section className="aiv-player-message">Loading scene…</section>
      ) : (
        <section className="aiv-player">
          <div className="aiv-video-stage">
            <PrivateMediaAsset key={`${current.id}-${index}`} mediaId={current.id} mediaType="video" className="aiv-video"
              onEnded={() => setIndex(value => value + 1 < items.length ? value + 1 : 0)}
              onDuration={(duration) => captureSceneDuration(current.id, duration)}>
              <div className="aiv-player-message">Preparing clip {index + 1}…</div>
            </PrivateMediaAsset>
          </div>
          <div className="aiv-player-info">
            <div><p className="aiv-kicker">SCENE · CLIP {index + 1} OF {items.length}</p><h1>{title}</h1><p>{current.prompt}</p></div>
            <span>{formatDuration(items.reduce((sum, item) => sum + (item.durationSeconds || 0), 0))} total</span>
          </div>
          <div className="aiv-scene-strip">
            {items.map((item, itemIndex) => (
              <button type="button" key={item.id} className={itemIndex === index ? "selected" : ""} onClick={() => setIndex(itemIndex)}>
                <span>{itemIndex + 1}</span>{item.prompt}
              </button>
            ))}
          </div>
          {task && isPending(task.status) ? (
            <div className="aiv-export-progress">
              <Clock3 aria-hidden="true" /><div><strong>Export in progress · {task.progress}%</strong><span>The CPU service is joining and encoding the scene.</span></div>
              <div className="aiv-progress-track"><span style={{ width: `${task.progress}%` }} /></div>
            </div>
          ) : observedExportPending.current && task?.status === "complete" && task.outputMediaId ? (
            <div className="aiv-export-progress">
              <Play aria-hidden="true" /><div><strong>Preview ready</strong><span>Opening the merged video…</span></div>
            </div>
          ) : (
            <div className="aiv-actions">
              <button type="button" className="aiv-action-button" onClick={exportScene} disabled={exporting}>
                <Download aria-hidden="true" /> {exporting ? "Submitting…" : "Export scene"}
              </button>
            </div>
          )}
          {error && <p className="aiv-form-error">{error}</p>}
        </section>
      )}
    </main>
  );
}

function EditableSceneView({ sceneId }: { sceneId: string }) {
  const authorizedFetch = useAuthorizedFetch();
  const [title, setTitle] = useState("Scene");
  const [items, setItems] = useState<PublicMedia[]>([]);
  const [index, setIndex] = useState(0);
  const [task, setTask] = useState<PublicTask | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState<PublicMedia[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [playbackTime, setPlaybackTime] = useState(0);
  const [timelinePreview, setTimelinePreview] = useState<number | null>(null);
  const sceneTimelineRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const playbackRefs = useRef(new Map<string, HTMLVideoElement>());
  const savedDurations = useRef(new Map<string, number>());
  const observedExportPending = useRef(false);

  const captureDuration = useCallback((mediaId: string, duration: number) => {
    setItems(current => current.map(item =>
      item.id === mediaId && item.durationSeconds !== duration
        ? { ...item, durationSeconds: duration }
        : item
    ));
    if (savedDurations.current.get(mediaId) === duration) return;
    savedDurations.current.set(mediaId, duration);
    void authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: duration }),
    });
  }, [authorizedFetch]);

  const load = useCallback(async () => {
    const response = await authorizedFetch(`/api/experiments/ai-video/scenes/${sceneId}`);
    const data = await response.json() as {
      scene?: { title: string };
      items?: PublicMedia[];
      exportTask?: PublicTask | null;
      error?: string;
    };
    if (!response.ok || !data.scene) throw new Error(data.error || "Scene unavailable.");
    const serverItems = data.items || [];
    setTitle(data.scene.title);
    setItems(current => {
      if (!dirtyRef.current) return serverItems;
      const refreshed = new Map(serverItems.map(item => [item.id, item]));
      return current.map(item => refreshed.get(item.id) || item);
    });
    if (data.exportTask && isPending(data.exportTask.status)) {
      observedExportPending.current = true;
    }
    setTask(data.exportTask || null);
    return {
      task: data.exportTask || null,
      hasPending: serverItems.some(item => isPending(item.status)),
    };
  }, [authorizedFetch, sceneId]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const current = await load();
        if (
          active &&
          (
            current.hasPending ||
            (current.task && isPending(current.task.status))
          )
        ) {
          timer = window.setTimeout(poll, 3_000);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Scene unavailable.");
      }
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    if (
      observedExportPending.current &&
      task?.status === "complete" &&
      task.outputMediaId
    ) {
      window.location.assign(`/experiments/ai-video/media/${task.outputMediaId}`);
    }
  }, [task?.outputMediaId, task?.status]);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    const preload = async () => {
      const playable = items.filter(item => item.status === "complete" && item.hasContent);
      try {
        const loaded = await Promise.all(playable.map(async item => {
          const response = await authorizedFetch(`/api/experiments/ai-video/media/${item.id}/content`);
          if (!response.ok) throw new Error("A scene video could not be preloaded.");
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          return [item.id, objectUrl] as const;
        }));
        if (active) setSources(Object.fromEntries(loaded));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Scene playback unavailable.");
      }
    };
    void preload();
    return () => {
      active = false;
      objectUrls.forEach(objectUrl => URL.revokeObjectURL(objectUrl));
    };
  }, [authorizedFetch, items]);

  const hasPendingVideos = items.some(item => isPending(item.status));
  const allVideosReady =
    items.length >= 2 &&
    items.every(item =>
      item.status === "complete" &&
      item.hasContent &&
      Boolean(sources[item.id])
    );

  useEffect(() => {
    if (!allVideosReady) return;
    playbackRefs.current.forEach((video, mediaId) => {
      if (items[index]?.id === mediaId) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [allVideosReady, index, items]);

  function selectClip(itemIndex: number, localTime = 0, play = true) {
    if (itemIndex < 0 || itemIndex >= items.length) return;
    playbackRefs.current.forEach(video => video.pause());
    const video = playbackRefs.current.get(items[itemIndex]?.id);
    if (video) {
      video.currentTime = Math.max(0, Math.min(localTime, video.duration || localTime));
      if (play) void video.play().catch(() => undefined);
    }
    setIndex(itemIndex);
  }

  const sceneDuration = items.reduce(
    (sum, item) => sum + Math.max(0, item.durationSeconds || 0),
    0,
  );
  const elapsedBefore = (itemIndex: number) =>
    items.slice(0, itemIndex).reduce(
      (sum, item) => sum + Math.max(0, item.durationSeconds || 0),
      0,
    );
  function locateSceneTime(sceneTime: number) {
    let cursor = 0;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const duration = Math.max(0, items[itemIndex].durationSeconds || 0);
      if (sceneTime <= cursor + duration || itemIndex === items.length - 1) {
        return { itemIndex, localTime: Math.max(0, sceneTime - cursor) };
      }
      cursor += duration;
    }
    return { itemIndex: 0, localTime: 0 };
  }
  function sceneTimeAt(clientX: number) {
    const bounds = sceneTimelineRef.current?.getBoundingClientRect();
    if (!bounds || !sceneDuration) return 0;
    return Math.min(
      sceneDuration,
      Math.max(0, ((clientX - bounds.left) / bounds.width) * sceneDuration),
    );
  }
  function seekScene(sceneTime: number) {
    const target = locateSceneTime(sceneTime);
    setPlaybackTime(sceneTime);
    selectClip(target.itemIndex, target.localTime);
  }

  async function openLibraryPicker() {
    setPickerOpen(true);
    if (libraryVideos.length) return;
    setPickerLoading(true);
    setError("");
    try {
      const response = await authorizedFetch("/api/experiments/ai-video/media?type=video");
      const data = await response.json() as { media?: PublicMedia[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Library unavailable.");
      setLibraryVideos((data.media || []).filter(item =>
        item.status === "complete" && item.hasContent
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Library unavailable.");
    } finally {
      setPickerLoading(false);
    }
  }

  function addLibraryVideo(video: PublicMedia) {
    if (items.some(item => item.id === video.id)) return;
    dirtyRef.current = true;
    setDirty(true);
    setItems(current => [...current, video]);
    setIndex(items.length);
  }

  async function saveScene() {
    if (!dirty) return;
    setSaving(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/experiments/ai-video/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: items.map(item => item.id) }),
      });
      const data = await response.json() as { items?: PublicMedia[]; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error || "Scene could not be saved.");
      dirtyRef.current = false;
      setDirty(false);
      setItems(data.items);
      setPickerOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Scene could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function exportScene() {
    observedExportPending.current = true;
    setExporting(true);
    setError("");
    try {
      const response = await authorizedFetch(`/api/experiments/ai-video/scenes/${sceneId}/export`, { method: "POST" });
      const data = await response.json() as {
        task?: PublicTask | null;
        outputMediaId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Export could not start.");
      if (data.task) setTask(data.task);
      else if (data.outputMediaId) {
        window.location.href = `/experiments/ai-video/media/${data.outputMediaId}`;
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export could not start.");
    } finally {
      setExporting(false);
    }
  }

  const current = items[index];
  return (
    <main className="aiv-player-page">
      <ExperimentHeader close />
      {error && !current ? (
        <section className="aiv-player-message"><strong>Scene unavailable</strong><span>{error}</span></section>
      ) : !current ? (
        <section className="aiv-player-message">Loading scene...</section>
      ) : (
        <section className="aiv-player">
          <div className="aiv-video-stage aiv-scene-stage">
            {allVideosReady ? items.map((item, itemIndex) => (
              <video
                key={item.id}
                ref={video => {
                  if (video) playbackRefs.current.set(item.id, video);
                  else playbackRefs.current.delete(item.id);
                }}
                className={`aiv-scene-video ${itemIndex === index ? "active" : ""}`}
                src={sources[item.id]}
                controls={itemIndex === index}
                playsInline
                preload="auto"
                onEnded={() => selectClip(itemIndex + 1 < items.length ? itemIndex + 1 : 0)}
                onTimeUpdate={event => {
                  if (itemIndex === index && timelinePreview === null) {
                    setPlaybackTime(elapsedBefore(itemIndex) + event.currentTarget.currentTime);
                  }
                }}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration;
                  if (Number.isFinite(duration) && duration > 0) {
                    captureDuration(item.id, duration);
                  }
                }}
              />
            )) : (
              <div className="aiv-player-message">
                <Clock3 aria-hidden="true" />
                <strong>{hasPendingVideos ? "Finishing the scene videos..." : "Preloading the complete scene..."}</strong>
                <span>Playback begins when every clip is ready for a seamless transition.</span>
              </div>
            )}
          </div>
          <div className="aiv-player-info">
            <div>
              <p className="aiv-kicker">SCENE · CLIP {index + 1} OF {items.length}</p>
              <h1>{title}</h1>
              <p>{current.prompt}</p>
            </div>
            <span>{formatDuration(sceneDuration)} total</span>
          </div>
          <div className="aiv-scene-timeline-wrap">
            <div
              ref={sceneTimelineRef}
              className="aiv-scene-timeline"
              role="slider"
              tabIndex={0}
              aria-label="Scene timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round(sceneDuration)}
              aria-valuenow={Math.round(timelinePreview ?? playbackTime)}
              onPointerDown={event => {
                event.currentTarget.setPointerCapture(event.pointerId);
                playbackRefs.current.get(items[index]?.id)?.pause();
                setTimelinePreview(sceneTimeAt(event.clientX));
              }}
              onPointerMove={event => {
                if (event.pointerType !== "touch" || event.currentTarget.hasPointerCapture(event.pointerId)) {
                  setTimelinePreview(sceneTimeAt(event.clientX));
                }
              }}
              onPointerUp={event => {
                const time = sceneTimeAt(event.clientX);
                seekScene(time);
                setTimelinePreview(null);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerLeave={event => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) setTimelinePreview(null);
              }}
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? sceneDuration
                    : Math.min(sceneDuration, Math.max(0, playbackTime + (event.key === "ArrowLeft" ? -1 : 1)));
                seekScene(next);
              }}
            >
              {items.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  className={itemIndex === index ? "active" : ""}
                  style={{
                    width: sceneDuration
                      ? `${((item.durationSeconds || 0) / sceneDuration) * 100}%`
                      : `${100 / items.length}%`,
                  }}
                  onClick={event => {
                    event.stopPropagation();
                    seekScene(elapsedBefore(itemIndex));
                  }}
                  aria-label={`Play clip ${itemIndex + 1}`}
                >
                  <PrivateMediaAsset mediaId={item.id} mediaType="video" thumbnail>
                    <span>{isPending(item.status) ? <Clock3 aria-hidden="true" /> : itemIndex + 1}</span>
                  </PrivateMediaAsset>
                  <i>{itemIndex + 1}</i>
                </button>
              ))}
              <span
                className="aiv-scene-playhead"
                style={{ left: `${sceneDuration ? ((timelinePreview ?? playbackTime) / sceneDuration) * 100 : 0}%` }}
              />
              {timelinePreview !== null && (
                <output
                  className="aiv-scene-timeline-preview"
                  style={{ left: `${sceneDuration ? (timelinePreview / sceneDuration) * 100 : 0}%` }}
                >
                  <strong>Clip {locateSceneTime(timelinePreview).itemIndex + 1}</strong>
                  <span>{formatDuration(timelinePreview)}</span>
                </output>
              )}
            </div>
            <div className="aiv-scan-time"><span>{formatDuration(playbackTime)}</span><span>{formatDuration(sceneDuration)}</span></div>
          </div>
          <div className="aiv-scene-strip">
            <button type="button" className="aiv-scene-add" onClick={openLibraryPicker}>
              <span><Plus aria-hidden="true" /></span>
              Add from library
            </button>
          </div>
          {pickerOpen && (
            <section className="aiv-scene-picker" aria-label="Add videos from library">
              <div className="aiv-scene-picker-heading">
                <div><p className="aiv-kicker">ADD VIDEO</p><h2>Choose from your library</h2></div>
                <button type="button" onClick={() => setPickerOpen(false)} aria-label="Close library picker">
                  <X aria-hidden="true" />
                </button>
              </div>
              {pickerLoading ? (
                <p>Loading your videos...</p>
              ) : libraryVideos.length ? (
                <div className="aiv-scene-picker-grid">
                  {libraryVideos.map(video => {
                    const included = items.some(item => item.id === video.id);
                    return (
                      <button type="button" key={video.id} disabled={included} onClick={() => addLibraryVideo(video)}>
                        <PrivateMediaAsset mediaId={video.id} mediaType="video" thumbnail>
                          <span className="aiv-thumb-placeholder"><Video aria-hidden="true" /></span>
                        </PrivateMediaAsset>
                        <span>
                          <strong>{video.prompt}</strong>
                          <small>{included ? "Already in scene" : formatDuration(video.durationSeconds)}</small>
                        </span>
                        {included ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p>No completed library videos are available to add.</p>
              )}
            </section>
          )}
          <div className="aiv-actions aiv-scene-actions">
            <button type="button" className="aiv-action-button secondary" onClick={saveScene} disabled={!dirty || saving}>
              <Save aria-hidden="true" /> {saving ? "Saving..." : dirty ? "Save scene" : "Saved"}
            </button>
          </div>
          {task && isPending(task.status) ? (
            <div className="aiv-export-progress">
              <Clock3 aria-hidden="true" />
              <div><strong>Export in progress · {task.progress}%</strong><span>The CPU service is joining and encoding the scene.</span></div>
              <div className="aiv-progress-track"><span style={{ width: `${task.progress}%` }} /></div>
            </div>
          ) : task?.status === "complete" && task.outputMediaId ? (
            <div className="aiv-export-progress">
              <Play aria-hidden="true" /><div><strong>Preview ready</strong><span>Opening the merged video...</span></div>
            </div>
          ) : (
            <div className="aiv-actions">
              <button
                type="button"
                className="aiv-action-button"
                onClick={exportScene}
                disabled={exporting || dirty || hasPendingVideos}
              >
                <Download aria-hidden="true" /> {
                  hasPendingVideos
                    ? "Waiting for videos"
                    : dirty
                      ? "Save before export"
                      : exporting ? "Submitting..." : "Export scene"
                }
              </button>
            </div>
          )}
          {error && <p className="aiv-form-error">{error}</p>}
        </section>
      )}
    </main>
  );
}

function PlayerView({ jobId }: { jobId: string }) {
  return <MediaView mediaId={jobId} />;
}

function ConfiguredAiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <main className="aiv-page"><div className="aiv-loading">Opening AI Video…</div></main>;
  if (!isSignedIn) return <SignedOutGate />;
  if (view === "create") return <CreateView />;
  if (view === "library") return <LibraryView />;
  if (view === "queue") return <QueueView />;
  if ((view === "player" || view === "media") && jobId) return <PlayerView jobId={jobId} />;
  if (view === "scene" && jobId) return <EditableSceneView sceneId={jobId} />;
  return <HomeView />;
}

export function AiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const configured = useAuthConfigured();
  if (!configured) return <SetupGate />;
  return <ConfiguredAiVideoApp view={view} jobId={jobId} />;
}
