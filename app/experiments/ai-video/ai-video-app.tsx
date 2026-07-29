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
  PanelsTopLeft,
  Play,
  Plus,
  Settings2,
  Upload,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useAuthConfigured } from "@/app/auth-provider";
import { AI_VIDEO_MODELS, type AiVideoModelKey } from "@/lib/ai-video-models";
import { USE_PRODUCTION_HEADER } from "@/lib/production-mode";
import { readUseProduction } from "@/lib/use-production-mode";

type View = "home" | "create" | "library" | "player" | "media";
type CreationType = "picture" | "video";
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
  hasVideo: boolean;
  createdAt: string;
  completedAt: string | null;
};

type PublicMedia = {
  id: string;
  mediaType: CreationType;
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
  hasContent: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

function modelName(media: PublicMedia) {
  if (media.mediaType === "picture") {
    return PICTURE_MODELS[media.modelKey as PictureModelKey]?.name || media.modelKey;
  }
  return AI_VIDEO_MODELS[media.modelKey as AiVideoModelKey]?.name || media.modelKey;
}

function isPending(status: MediaStatus) {
  return status === "submitted" || status === "pending";
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
}: {
  mediaId: string;
  mediaType: CreationType;
  thumbnail?: boolean;
  className?: string;
  children?: ReactNode;
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
    <video className={className} src={url} controls autoPlay playsInline />
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

function MediaCard({ media }: { media: PublicMedia }) {
  return (
    <Link href={`/experiments/ai-video/media/${media.id}`} className="aiv-library-card">
      <div className="aiv-thumb">
        {media.hasThumbnail ? (
          <PrivateMediaAsset mediaId={media.id} mediaType={media.mediaType} thumbnail>
            <span className="aiv-thumb-placeholder"><Images aria-hidden="true" /></span>
          </PrivateMediaAsset>
        ) : (
          <span className="aiv-thumb-placeholder">
            {media.mediaType === "picture" ? <PictureIcon aria-hidden="true" /> : <Video aria-hidden="true" />}
          </span>
        )}
        <PendingBadge status={media.status} />
        {media.status === "complete" && media.mediaType === "video" && (
          <span className="aiv-play"><Play aria-hidden="true" /></span>
        )}
        <span className="aiv-media-type">
          {media.mediaType === "picture" ? <PictureIcon aria-hidden="true" /> : <Video aria-hidden="true" />}
          {media.mediaType}
        </span>
      </div>
      <div className="aiv-library-copy">
        <strong>{media.prompt}</strong>
        <span>
          {modelName(media)} · {media.mediaType === "video" ? `${media.durationSeconds}s · ` : ""}
          {media.quality}
        </span>
      </div>
    </Link>
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
  return { media, loading, error };
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

function ProgressPanel({ initialJob }: { initialJob: PublicJob }) {
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
          <Link href={`/experiments/ai-video/media/${job.id}`}><Play aria-hidden="true" /> View video</Link>
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
  const authorizedFetch = useAuthorizedFetch();
  const { user } = useUser();
  const [creationType, setCreationType] = useState<CreationType>("picture");
  const [pictureModel, setPictureModel] = useState<PictureModelKey>("base");
  const [videoModelKey, setVideoModelKey] = useState<AiVideoModelKey>("wan22");
  const videoModel = AI_VIDEO_MODELS[videoModelKey];
  const [quality, setQuality] = useState("480p");
  const [duration, setDuration] = useState("5");
  const [source, setSource] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<PublicJob | null>(null);
  const [createdMedia, setCreatedMedia] = useState<PublicMedia | null>(null);
  const preview = useMemo(() => (source ? URL.createObjectURL(source) : ""), [source]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

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
      form.set("sourceProvider", videoModel.supportsImage ? "upload" : "none");
      if (source) form.set("sourceImage", source);
      form.set("displayName", user?.fullName || "");
      form.set("email", user?.primaryEmailAddress?.emailAddress || "");
      form.set("avatarUrl", user?.imageUrl || "");
      const response = await authorizedFetch("/api/experiments/ai-video/jobs", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { job?: PublicJob; error?: string };
      if (!response.ok || !data.job) {
        throw new Error(data.error || "Video generation could not start.");
      }
      setJob(data.job);
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
        <ProgressPanel initialJob={job} />
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
      <form className="aiv-create" onSubmit={submit}>
        <div className="aiv-create-heading">
          <p className="aiv-kicker">CREATE</p>
          <h1>Make something new.</h1>
          <p>Everything you submit is logged and saved privately to your account.</p>
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
                  : videoModel.supportsImage
                    ? "Add an image and describe the motion"
                    : "Describe the whole scene"}
              </strong>
              <small>
                {creationType === "picture"
                  ? "Your connected picture model will create a private 1024 × 576 image."
                  : videoModel.supportsImage
                    ? "Upload a JPG, PNG, or WebP up to 12 MB."
                    : "LTX creates from text and includes audio."}
              </small>
            </div>
          </div>
          {creationType === "video" && videoModel.supportsImage && (
            <label className={`aiv-upload ${preview ? "has-preview" : ""}`}>
              {preview ? <img src={preview} alt="Selected source" /> : <Upload aria-hidden="true" />}
              <strong>{source ? source.name : "Choose source image"}</strong>
              <span>{source ? "Click to replace" : "The composition anchors the generated motion."}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setSource(event.target.files?.[0] || null)}
                required
              />
            </label>
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
              required
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
            disabled={
              submitting ||
              !prompt ||
              (creationType === "video" && videoModel.supportsImage && !source)
            }
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
  const { media, loading, error } = useMedia(true);
  const [filter, setFilter] = useState<"all" | CreationType>("all");
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
          {(["all", "picture", "video"] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={filter === option ? "selected" : ""}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === "picture" && <PictureIcon aria-hidden="true" />}
              {option === "video" && <Video aria-hidden="true" />}
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
            {filtered.map((item) => <MediaCard media={item} key={item.id} />)}
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

  useEffect(() => {
    if (media?.status === "complete" || media?.status === "failed") return;
    let active = true;
    let timer = 0;
    const load = async () => {
      try {
        const response = await authorizedFetch(`/api/experiments/ai-video/media/${mediaId}`);
        const data = (await response.json()) as { media?: PublicMedia; error?: string };
        if (!response.ok || !data.media) throw new Error(data.error || "Media unavailable.");
        if (!active) return;
        setMedia(data.media);
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
            <PrivateMediaAsset mediaId={media.id} mediaType={media.mediaType} className={media.mediaType === "video" ? "aiv-video" : "aiv-picture"}>
              <div className="aiv-player-message">Preparing secure {media.mediaType}…</div>
            </PrivateMediaAsset>
          </div>
          <div className="aiv-player-info">
            <div><p className="aiv-kicker">{modelName(media)}</p><h1>{media.prompt}</h1></div>
            <span>
              {media.width} × {media.height}
              {media.durationSeconds ? ` · ${media.durationSeconds}s` : ""}
              {" · "}Seed {media.seed}
            </span>
          </div>
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
  return <HomeView />;
}

export function AiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const configured = useAuthConfigured();
  if (!configured) return <SetupGate />;
  return <ConfiguredAiVideoApp view={view} jobId={jobId} />;
}
