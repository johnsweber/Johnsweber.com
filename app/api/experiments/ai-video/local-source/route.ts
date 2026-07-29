import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
    const gatewayUrl = process.env.LOCAL_IMAGE_GATEWAY_URL?.replace(/\/$/, "");
    const gatewayToken = process.env.LOCAL_IMAGE_GATEWAY_TOKEN;
    if (!gatewayUrl || !gatewayToken) {
      return Response.json(
        { error: "The local GPU source generator is not configured." },
        { status: 503 },
      );
    }

    const input = (await request.json()) as {
      prompt?: string;
      model?: string;
    };
    const prompt = input.prompt?.trim() || "";
    const model = input.model === "animagine" ? "animagine" : "base";
    if (!prompt || prompt.length > 2_000) {
      return Response.json(
        { error: "Add a source-image prompt up to 2,000 characters." },
        { status: 400 },
      );
    }

    const generated = await fetch(`${gatewayUrl}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        model,
        width: 1024,
        height: 576,
      }),
      signal: AbortSignal.timeout(260_000),
    });
    const result = (await generated.json().catch(() => ({}))) as {
      image?: { imageUrl?: string; mimeType?: string };
      error?: string;
    };
    if (!generated.ok || !result.image?.imageUrl) {
      return Response.json(
        { error: result.error || "The local GPU did not return an image." },
        { status: generated.status || 503 },
      );
    }

    const imageResponse = await fetch(result.image.imageUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!imageResponse.ok || !imageResponse.body) {
      return Response.json(
        { error: "The locally generated image could not be retrieved." },
        { status: 502 },
      );
    }

    return new Response(imageResponse.body, {
      headers: {
        "Content-Type":
          imageResponse.headers.get("content-type") ||
          result.image.mimeType ||
          "image/png",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="local-${model}-source.png"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The local GPU is unavailable.",
      },
      { status: 503 },
    );
  }
}
