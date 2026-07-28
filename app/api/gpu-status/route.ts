export async function POST() {
  const endpoint = process.env.MODAL_GPU_URL;
  const key = process.env.MODAL_PROXY_TOKEN_ID;
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET;

  if (!endpoint || !key || !secret) {
    return Response.json(
      {
        ok: false,
        configured: false,
        message: "The GPU connection is being finished now. Check back shortly.",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Modal-Key": key,
        "Modal-Secret": secret,
      },
    });

    const data = await response.json();

    return Response.json(data, {
      status: response.ok ? 200 : response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        ok: false,
        configured: true,
        error: "Modal did not respond before the gateway timed out.",
      },
      { status: 504 },
    );
  }
}
