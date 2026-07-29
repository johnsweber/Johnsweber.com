import { AiVideoApp } from "../../ai-video-app";

export default async function AiVideoMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AiVideoApp view="media" jobId={id} />;
}
