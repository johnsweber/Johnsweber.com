import { AiVideoApp } from "../../ai-video-app";

export default async function AiVideoPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AiVideoApp view="player" jobId={id} />;
}
