"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  Check,
  Clock3,
  Clapperboard,
  House,
  Images,
  Library,
  LockKeyhole,
  PanelsTopLeft,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Upload,
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

type View = "home" | "create" | "library" | "player";

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
  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getToken();
      if (!token) throw new Error("Sign in required.");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [getToken],
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
        aria-label={close ? "Close video player" : "Leave AI Video"}
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
        <p>Your source images, generations, and library stay attached to your account.</p>
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

function PrivateAsset({
  jobId,
  kind,
  className,
  children,
}: {
  jobId: string;
  kind: "thumbnail" | "video";
  className?: string;
  children?: ReactNode;
}) {
  const authorizedFetch = useAuthorizedFetch();
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    authorizedFetch(`/api/experiments/ai-video/jobs/${jobId}/${kind}`)
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
  }, [authorizedFetch, jobId, kind]);

  if (!url) return <>{children}</>;
  return kind === "video" ? (
    <video className={className} src={url} controls autoPlay playsInline />
  ) : (
    <img className={className} src={url} alt="" />
  );
}

function JobCard({ job }: { job: PublicJob }) {
  const model = AI_VIDEO_MODELS[job.modelKey];
  return (
    <Link href={`/experiments/ai-video/video/${job.id}`} className="aiv-library-card">
      <div className="aiv-thumb">
        {job.hasThumbnail ? (
          <PrivateAsset jobId={job.id} kind="thumbnail">
            <span className="aiv-thumb-placeholder"><Images aria-hidden="true" /></span>
          </PrivateAsset>
        ) : (
          <span className="aiv-thumb-placeholder"><Sparkles aria-hidden="true" /></span>
        )}
        <span className={`aiv-status ${job.status}`}>{job.status}</span>
        {job.status === "complete" && <span className="aiv-play"><Play aria-hidden="true" /></span>}
      </div>
      <div className="aiv-library-copy">
        <strong>{job.prompt}</strong>
        <span>{model.name} · {job.durationSeconds}s · {job.quality}</span>
      </div>
    </Link>
  );
}

function useJobs(enabled: boolean) {
  const authorizedFetch = useAuthorizedFetch();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    authorizedFetch("/api/experiments/ai-video/jobs")
      .then(async (response) => {
        const data = (await response.json()) as { jobs?: PublicJob[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Library unavailable.");
        if (active) setJobs(data.jobs || []);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Library unavailable.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [authorizedFetch, enabled]);
  return { jobs, loading, error };
}

function HomeView() {
  const { jobs, loading } = useJobs(true);
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-hero">
        <div>
          <p className="aiv-kicker">PRIVATE CREATIVE LAB</p>
          <h1>Give a still image somewhere to go.</h1>
          <p>Choose a model, set the motion, and let your private GPU workspace build the shot.</p>
          <div className="aiv-actions">
            <Link href="/experiments/ai-video/create"><WandSparkles aria-hidden="true" /> Create video</Link>
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
          <div><p className="aiv-kicker">AVAILABLE MODELS</p><h2>Two different ways to move.</h2></div>
          <Link href="/experiments/ai-video/create">Compare in create <span>→</span></Link>
        </div>
        <div className="aiv-model-grid">
          {Object.values(AI_VIDEO_MODELS).map((model) => (
            <article key={model.key}>
              <span>{model.supportsImage ? "IMAGE → VIDEO" : "TEXT + AUDIO → VIDEO"}</span>
              <h3>{model.name}</h3>
              <p>{model.description}</p>
              <div>
                {Object.values(model.qualities).map((quality) => <b key={quality.label}>{quality.label}</b>)}
                <b>5s</b><b>10s</b>
                {model.supportsAudio && <b>Audio</b>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="aiv-recent">
        <div className="aiv-section-title">
          <div><p className="aiv-kicker">YOUR RECENT WORK</p><h2>Private by default.</h2></div>
          <Link href="/experiments/ai-video/library">View all</Link>
        </div>
        {loading ? (
          <div className="aiv-empty">Loading your library…</div>
        ) : jobs.length ? (
          <div className="aiv-library-grid">{jobs.slice(0, 3).map((job) => <JobCard job={job} key={job.id} />)}</div>
        ) : (
          <div className="aiv-empty">
            <Clapperboard aria-hidden="true" />
            <strong>No videos yet.</strong>
            <span>Your first generation will appear here.</span>
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
    const poll = async () => {
      try {
        const response = await authorizedFetch(`/api/experiments/ai-video/jobs/${job.id}`);
        const data = (await response.json()) as { job?: PublicJob };
        if (active && data.job) setJob(data.job);
      } finally {
        if (active) window.setTimeout(poll, 3_000);
      }
    };
    const timer = window.setTimeout(poll, 2_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [authorizedFetch, job.id, job.status]);

  return (
    <section className="aiv-progress-panel">
      <span className={`aiv-progress-icon ${job.status}`}>
        {job.status === "complete" ? <Check aria-hidden="true" /> : <Clapperboard aria-hidden="true" />}
      </span>
      <p className="aiv-kicker">{job.status === "complete" ? "VIDEO READY" : "GENERATION IN PROGRESS"}</p>
      <h1>{job.status === "complete" ? "Your shot is ready." : "Making motion from your idea."}</h1>
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
          <Link href={`/experiments/ai-video/video/${job.id}`}><Play aria-hidden="true" /> Play video</Link>
        ) : (
          <Link href="/experiments/ai-video"><House aria-hidden="true" /> Return home</Link>
        )}
        <Link href="/experiments/ai-video/library" className="secondary"><Library aria-hidden="true" /> Library</Link>
      </div>
    </section>
  );
}

function CreateView() {
  const authorizedFetch = useAuthorizedFetch();
  const { user } = useUser();
  const [modelKey, setModelKey] = useState<AiVideoModelKey>("wan22");
  const model = AI_VIDEO_MODELS[modelKey];
  const [quality, setQuality] = useState("480p");
  const [duration, setDuration] = useState("5");
  const [source, setSource] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<PublicJob | null>(null);
  const preview = useMemo(() => (source ? URL.createObjectURL(source) : ""), [source]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function chooseModel(next: AiVideoModelKey) {
    setModelKey(next);
    setQuality(next === "wan22" ? "480p" : "standard");
    if (next === "ltx23") setSource(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("modelKey", modelKey);
      form.set("quality", quality);
      form.set("duration", duration);
      form.set("prompt", prompt);
      form.set("negativePrompt", negativePrompt);
      form.set("seed", String(seed));
      if (source) form.set("sourceImage", source);
      form.set("displayName", user?.fullName || "");
      form.set("email", user?.primaryEmailAddress?.emailAddress || "");
      form.set("avatarUrl", user?.imageUrl || "");
      const response = await authorizedFetch("/api/experiments/ai-video/jobs", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { job?: PublicJob; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error || "Generation could not start.");
      setJob(data.job);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Generation could not start.");
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

  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <form className="aiv-create" onSubmit={submit}>
        <div className="aiv-create-heading">
          <p className="aiv-kicker">CREATE</p>
          <h1>Build your next shot.</h1>
          <p>Everything you make here is saved privately to your account.</p>
        </div>

        <section className="aiv-form-section">
          <div className="aiv-step"><span>1</span><div><strong>Choose a model</strong><small>Each model has a different strength.</small></div></div>
          <div className="aiv-choice-grid">
            {(Object.keys(AI_VIDEO_MODELS) as AiVideoModelKey[]).map((key) => {
              const option = AI_VIDEO_MODELS[key];
              return (
                <button type="button" key={key} className={modelKey === key ? "selected" : ""} onClick={() => chooseModel(key)}>
                  <span>{option.supportsImage ? "IMAGE-GUIDED" : "TEXT + AUDIO"}</span>
                  <strong>{option.name}</strong>
                  <small>{option.description}</small>
                  {modelKey === key && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="aiv-form-section">
          <div className="aiv-step"><span>2</span><div><strong>{model.supportsImage ? "Add your source image" : "Describe the whole scene"}</strong><small>{model.supportsImage ? "JPG, PNG, or WebP up to 12 MB." : "LTX 2.3 currently creates from text and includes audio."}</small></div></div>
          {model.supportsImage && (
            <label className={`aiv-upload ${preview ? "has-preview" : ""}`}>
              {preview ? <img src={preview} alt="Selected source" /> : <Upload aria-hidden="true" />}
              <strong>{source ? source.name : "Choose source image"}</strong>
              <span>{source ? "Click to replace" : "The composition anchors the generated motion."}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSource(event.target.files?.[0] || null)} required />
            </label>
          )}
          <label className="aiv-field">
            <span>Motion prompt</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={model.supportsImage ? "A slow cinematic push-in as wind moves through the scene…" : "A wide cinematic view of a neon city waking at dawn, with distant traffic and soft rain…"} maxLength={2000} required />
            <small>{prompt.length}/2000</small>
          </label>
          {model.supportsImage && (
            <label className="aiv-field compact">
              <span>Negative prompt <i>optional</i></span>
              <input value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="Distortion, flicker, abrupt camera motion" />
            </label>
          )}
        </section>

        <section className="aiv-form-section">
          <div className="aiv-step"><span>3</span><div><strong>Set the output</strong><small>Higher quality takes longer to process.</small></div></div>
          <div className="aiv-setting-row">
            <fieldset>
              <legend>Quality</legend>
              <div>
                {Object.entries(model.qualities).map(([key, option]) => (
                  <label key={key}><input type="radio" name="quality" checked={quality === key} onChange={() => setQuality(key)} /><span>{option.label}</span></label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Duration</legend>
              <div>
                {Object.entries(model.durations).map(([key, option]) => (
                  <label key={key}><input type="radio" name="duration" checked={duration === key} onChange={() => setDuration(key)} /><span>{option.seconds}s</span></label>
                ))}
              </div>
            </fieldset>
            <label className="aiv-seed">Seed<input type="number" min="0" step="1" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
          </div>
        </section>

        {error && <p className="aiv-form-error" role="alert">{error}</p>}
        <div className="aiv-create-submit">
          <div><Clock3 aria-hidden="true" /><span>Estimated time is shown after submission. Cold starts can add several minutes.</span></div>
          <button type="submit" disabled={submitting || !prompt || (model.supportsImage && !source)}>
            {submitting ? "Sending to GPU…" : "Create video"} <WandSparkles aria-hidden="true" />
          </button>
        </div>
      </form>
      <BottomNavigation />
    </main>
  );
}

function LibraryView() {
  const { jobs, loading, error } = useJobs(true);
  return (
    <main className="aiv-page">
      <ExperimentHeader />
      <section className="aiv-library">
        <div className="aiv-section-title">
          <div><p className="aiv-kicker">PRIVATE LIBRARY</p><h1>Your generated videos.</h1><p>Only your signed-in account can load these files.</p></div>
          <Link href="/experiments/ai-video/create"><Plus aria-hidden="true" /> New video</Link>
        </div>
        {loading ? (
          <div className="aiv-empty">Loading your library…</div>
        ) : error ? (
          <div className="aiv-empty"><strong>Library unavailable</strong><span>{error}</span></div>
        ) : jobs.length ? (
          <div className="aiv-library-grid">{jobs.map((job) => <JobCard job={job} key={job.id} />)}</div>
        ) : (
          <div className="aiv-empty">
            <Images aria-hidden="true" /><strong>Your library is empty.</strong><span>Create a video and it will be saved here automatically.</span>
            <Link href="/experiments/ai-video/create">Create your first video</Link>
          </div>
        )}
      </section>
      <BottomNavigation />
    </main>
  );
}

function PlayerView({ jobId }: { jobId: string }) {
  const authorizedFetch = useAuthorizedFetch();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    authorizedFetch(`/api/experiments/ai-video/jobs/${jobId}`)
      .then(async (response) => {
        const data = (await response.json()) as { job?: PublicJob; error?: string };
        if (!response.ok || !data.job) throw new Error(data.error || "Video unavailable.");
        if (active) setJob(data.job);
      })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Video unavailable."));
    return () => { active = false; };
  }, [authorizedFetch, jobId]);

  return (
    <main className="aiv-player-page">
      <ExperimentHeader close />
      {error ? (
        <section className="aiv-player-message"><strong>Video unavailable</strong><span>{error}</span><Link href="/experiments/ai-video/library">Return to library</Link></section>
      ) : !job ? (
        <section className="aiv-player-message">Loading private video…</section>
      ) : job.status !== "complete" ? (
        <ProgressPanel initialJob={job} />
      ) : (
        <section className="aiv-player">
          <div className="aiv-video-stage">
            <PrivateAsset jobId={job.id} kind="video" className="aiv-video">
              <div className="aiv-player-message">Preparing secure playback…</div>
            </PrivateAsset>
          </div>
          <div className="aiv-player-info">
            <div><p className="aiv-kicker">{AI_VIDEO_MODELS[job.modelKey].name}</p><h1>{job.prompt}</h1></div>
            <span>{job.width} × {job.height} · {job.durationSeconds}s · Seed {job.seed}</span>
          </div>
        </section>
      )}
    </main>
  );
}

function ConfiguredAiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <main className="aiv-page"><div className="aiv-loading">Opening AI Video…</div></main>;
  if (!isSignedIn) return <SignedOutGate />;
  if (view === "create") return <CreateView />;
  if (view === "library") return <LibraryView />;
  if (view === "player" && jobId) return <PlayerView jobId={jobId} />;
  return <HomeView />;
}

export function AiVideoApp({ view, jobId }: { view: View; jobId?: string }) {
  const configured = useAuthConfigured();
  if (!configured) return <SetupGate />;
  return <ConfiguredAiVideoApp view={view} jobId={jobId} />;
}
