import { AiVideoApp } from "../../ai-video-app";

export default async function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AiVideoApp view="scene" jobId={id} />;
}
