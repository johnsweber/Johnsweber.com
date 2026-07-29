"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Clock3,
  House,
  Image as PictureIcon,
  Images,
  Library,
  LockKeyhole,
  EllipsisVertical,
  PanelsTopLeft,
  Play,
  Plus,
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
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useAuthConfigured } from "@/app/auth-provider";
import { AI_VIDEO_MODELS, type AiVideoModelKey } from "@/lib/ai-video-models";
import { USE_PRODUCTION_HEADER } from "@/lib/production-mode";
import {
  readUseProduction,
  useProductionMode,
} from "@/lib/use-production-mode";

type View = "home" | "create" | "library" | "player" | "media" | "scene";
type CreationType = "picture" | "video";
type MediaType = CreationType | "scene";
type MediaStatus = "submitted" | "pending" | "complete" | "failed";
type PictureModelKey = "base" | "animagine";

const PICTURE_MODELS = {
  base: {
    name: "SDXL Base 1.0",
    description: "Versatile photoreal, illustrative, and concept-image creation.",
  },
  animagine: {
    name: "Animagine XL 4.0",
    description: "Expressive anime and illustration-focused image creation.",
  },
} as const;

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

function modelName(media: PublicMedia) {
  if (media.mediaType === "scene") return "Scene";
  if (media.mediaType === "picture") {
    return PICTURE_MODELS[media.modelKey as PictureModelKey]?.name || media.modelKey;
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
    { label: "Boards", icon: PanelsTopLeft, placeholder: true },
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
      <Link href="/" className="aiv-brand" aria-label="John Weber home">
        <span><Clapperboard aria-hidden="true" /></span>
        <strong>AI VIDEO</strong>
      </Link>
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

function PendingBadge({ status }: { status: MediaStatus }) {
  return (
    <span className={`aiv-status ${status}`}>
      {isPending(status) && <Clock3 aria-hidden="true" />}
      {status === "submitted" ? "Submitted" : status}
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
        <PendingBadge status={media.status} />
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
            <div><b>1024 × 576</b><b>SDXL</b><b>Animagine</b></div>
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
        {job.status === "complete" ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
      </span>
      <p className="aiv-kicker">{job.status === "complete" ? "VIDEO READY" : "PENDING"}</p>
      <h1>{job.status === "complete" ? "Your shot is ready." : "Your video was submitted."}</h1>
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

function CreateView() {
  const searchParams = useSearchParams();
  const extendMediaId = searchParams.get("extend");
  const requestedSceneId = searchParams.get("scene");
  const authorizedFetch = useAuthorizedFetch();
  const { user } = useUser();
  const { useProduction } = useProductionMode(user?.id);
  const [creationType, setCreationType] = useState<CreationType>(extendMediaId ? "video" : "picture");
  const [pictureModel, setPictureModel] = useState<PictureModelKey>("base");
  const [videoModelKey, setVideoModelKey] = useState<AiVideoModelKey>("wan22");
  const videoModel = AI_VIDEO_MODELS[videoModelKey];
  const [quality, setQuality] = useState(extendMediaId ? "480p" : "480p");
  const [duration, setDuration] = useState("5");
  const [source, setSource] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<PublicJob | null>(null);
  const [createdMedia, setCreatedMedia] = useState<PublicMedia | null>(null);
  const [createdSceneId, setCreatedSceneId] = useState<string | null>(null);
  const [extendMedia, setExtendMedia] = useState<PublicMedia | null>(null);
  const preview = useMemo(() => (source ? URL.createObjectURL(source) : ""), [source]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
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

  function chooseCreationType(next: CreationType) {
    setCreationType(next);
    setError("");
    setSource(null);
    setPrompt("");
    setNegativePrompt("");
  }

  function chooseVideoModel(next: AiVideoModelKey) {
    setVideoModelKey(next);
    setQuality(next === "wan22" ? "480p" : "standard");
    if (next === "ltx23") setSource(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
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
              seed,
              displayName: user?.fullName || "",
              email: user?.primaryEmailAddress?.emailAddress || "",
              avatarUrl: user?.imageUrl || "",
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
      form.set("duration", duration);
      form.set("prompt", prompt);
      form.set("negativePrompt", negativePrompt);
      form.set("seed", String(seed));
      form.set(
        "sourceProvider",
        useProduction && videoModel.supportsImage ? "upload" : "none",
      );
      if (source) form.set("sourceImage", source);
      if (extendMediaId) form.set("extendMediaId", extendMediaId);
      if (requestedSceneId) form.set("sceneId", requestedSceneId);
      form.set("displayName", user?.fullName || "");
      form.set("email", user?.primaryEmailAddress?.emailAddress || "");
      form.set("avatarUrl", user?.imageUrl || "");
      const response = await authorizedFetch("/api/experiments/ai-video/jobs", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { job?: PublicJob; sceneId?: string | null; error?: string };
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
              ? (Object.keys(PICTURE_MODELS) as PictureModelKey[]).map((key) => {
                  const option = PICTURE_MODELS[key];
                  return (
                    <button type="button" key={key} className={pictureModel === key ? "selected" : ""} onClick={() => setPictureModel(key)}>
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
                      <span>{option.supportsImage ? "IMAGE-GUIDED" : "TEXT + AUDIO"}</span>
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
                  : videoModel.supportsImage && useProduction
                    ? "Add an image and describe the motion"
                    : "Describe the whole scene"}
              </strong>
              <small>
                {creationType === "picture"
                  ? useProduction
                    ? "Your connected picture model will create a private 1024 × 576 image."
                    : "Demo mode returns a free example picture for your private library."
                  : videoModel.supportsImage && useProduction
                    ? "Upload a JPG, PNG, or WebP up to 12 MB."
                    : useProduction
                      ? "LTX creates from text and includes audio."
                      : "Demo mode returns a free example video; no source image is needed."}
              </small>
            </div>
          </div>
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
          ) : creationType === "video" && videoModel.supportsImage && useProduction && (
            <div className="aiv-reference-block">
              <span className="aiv-reference-label"><PictureIcon aria-hidden="true" /> Reference image</span>
              <label className={`aiv-upload ${preview ? "has-preview" : ""}`}>
                {preview ? <img src={preview} alt="Selected reference" /> : <Upload aria-hidden="true" />}
                <strong>{source ? source.name : "Choose reference image"}</strong>
                <span>{source ? "Preview ready · click to replace" : "The composition anchors the generated motion."}</span>
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
          <div className="aiv-step"><span>3</span><div><strong>Set the output</strong><small>Your media record is created with Submitted status first.</small></div></div>
          <div className="aiv-setting-row">
            <fieldset>
              <legend>Quality</legend>
              <div>
                {creationType === "picture" ? (
                  <label><input type="radio" checked readOnly /><span>1024 × 576</span></label>
                ) : (
                  Object.entries(videoModel.qualities).map(([key, option]) => (
                    <label key={key}><input type="radio" name="quality" checked={quality === key} onChange={() => setQuality(key)} /><span>{option.label}</span></label>
                  ))
                )}
              </div>
            </fieldset>
            {creationType === "video" && (
              <fieldset>
                <legend>Duration</legend>
                <div>
                  {Object.entries(videoModel.durations).map(([key, option]) => (
                    <label key={key}><input type="radio" name="duration" checked={duration === key} onChange={() => setDuration(key)} /><span>{option.seconds}s</span></label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="aiv-seed">Seed<input type="number" min="0" step="1" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
          </div>
        </section>

        {error && <p className="aiv-form-error" role="alert">{error}</p>}
        <div className="aiv-create-submit">
          <div><Clock3 aria-hidden="true" /><span>After submission, pending work appears immediately in your private library.</span></div>
          <button
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Submitting…" : `Create ${creationType}`} <WandSparkles aria-hidden="true" />
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
  const [actualDuration, setActualDuration] = useState<number | null>(null);
  const savedDuration = useRef<number | null>(null);

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
    if (media?.status === "complete" || media?.status === "failed") return;
    let active = true;
    let timer = 0;
    const load = async () => {
      try {
        const response = await authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`);
        const data = (await response.json()) as { media?: PublicMedia; sceneId?: string | null; error?: string };
        if (!response.ok || !data.media) throw new Error(data.error || "Media unavailable.");
        if (!active) return;
        setMedia(data.media);
        setSceneId(data.sceneId || null);
        if (isPending(data.media.status)) timer = window.setTimeout(load, 3_000);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Media unavailable.");
      }
    };
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [authorizedFetch, media?.status, mediaId]);

  return (
    <main className="aiv-player-page">
      <ExperimentHeader close />
      {error ? (
        <section className="aiv-player-message"><strong>Media unavailable</strong><span>{error}</span><Link href="/experiments/ai-video/library">Return to library</Link></section>
      ) : !media ? (
        <section className="aiv-player-message">Loading private media…</section>
      ) : isPending(media.status) ? (
        <section className="aiv-progress-panel">
          <span className="aiv-progress-icon pending"><Clock3 aria-hidden="true" /></span>
          <p className="aiv-kicker">PENDING</p>
          <h1>Your {media.mediaType} was submitted.</h1>
          <p>It will appear here as soon as processing finishes.</p>
          <div className="aiv-picture-loader" aria-label="Media generation pending"><span /></div>
          <div className="aiv-actions"><Link href="/experiments/ai-video/library"><Library aria-hidden="true" /> Library</Link></div>
        </section>
      ) : media.status === "failed" ? (
        <section className="aiv-player-message"><strong>Generation stopped</strong><span>{media.errorMessage || "This item could not be completed."}</span><Link href="/experiments/ai-video/create">Try again</Link></section>
      ) : (
        <section className="aiv-player">
          <div className={`aiv-video-stage ${media.mediaType === "picture" ? "picture" : ""}`}>
            <PrivateMediaAsset
              mediaId={media.id}
              mediaType={media.mediaType === "video" ? "video" : "picture"}
              className={media.mediaType === "video" ? "aiv-video" : "aiv-picture"}
              onDuration={media.mediaType === "video" ? captureDuration : undefined}
            >
              <div className="aiv-player-message">Preparing secure {media.mediaType}…</div>
            </PrivateMediaAsset>
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
              {media.hasLastFrame ? (
                <Link href={`/experiments/ai-video/create?mode=video&extend=${media.id}${sceneId ? `&scene=${sceneId}` : ""}`}>
                  <Plus aria-hidden="true" /> Extend video
                </Link>
              ) : (
                <span className="aiv-muted-action"><Clock3 aria-hidden="true" /> Last frame is still being prepared</span>
              )}
              {sceneId && <Link className="secondary" href={`/experiments/ai-video/scene/${sceneId}`}><Clapperboard aria-hidden="true" /> Open scene</Link>}
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
          ) : task?.status === "complete" && task.outputMediaId ? (
            <div className="aiv-actions"><Link href={`/experiments/ai-video/media/${task.outputMediaId}`}><Play aria-hidden="true" /> View exported video</Link></div>
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

function PlayerView({ jobId }: { jobId: string }) {
  return <MediaView mediaId={jobId} />;
}

function ConfiguredAiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <main className="aiv-page"><div className="aiv-loading">Opening AI Video…</div></main>;
  if (!isSignedIn) return <SignedOutGate />;
  if (view === "create") return <CreateView />;
  if (view === "library") return <LibraryView />;
  if ((view === "player" || view === "media") && jobId) return <PlayerView jobId={jobId} />;
  if (view === "scene" && jobId) return <SceneView sceneId={jobId} />;
  return <HomeView />;
}

export function AiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const configured = useAuthConfigured();
  if (!configured) return <SetupGate />;
  return <ConfiguredAiVideoApp view={view} jobId={jobId} />;
}
