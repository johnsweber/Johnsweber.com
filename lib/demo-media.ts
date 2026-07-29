export type DemoMediaAsset = {
  fileName: string;
  mediaType: "picture" | "video";
  mimeType: "image/jpeg" | "video/webm";
  title: string;
  creator: string;
  license: string;
  sourcePage: string;
  thumbnailFileName?: string;
};

const image = (
  fileName: string,
  title: string,
  creator: string,
  sourcePage: string,
): DemoMediaAsset => ({
  fileName,
  mediaType: "picture",
  mimeType: "image/jpeg",
  title,
  creator,
  license: "CC0 1.0",
  sourcePage,
});

const video = (
  fileName: string,
  title: string,
  creator: string,
  license: string,
  sourcePage: string,
  thumbnailFileName: string,
): DemoMediaAsset => ({
  fileName,
  mediaType: "video",
  mimeType: "video/webm",
  title,
  creator,
  license,
  sourcePage,
  thumbnailFileName,
});

export const DEMO_MEDIA_ASSETS: readonly DemoMediaAsset[] = [
  image(
    "Home Workspace.jpg",
    "Warm home workspace",
    "Pixabay contributor (archived on Wikimedia Commons)",
    "https://commons.wikimedia.org/wiki/File:Home_Workspace.jpg",
  ),
  image(
    "Sunset (218509417).jpeg",
    "Golden landscape at sunset",
    "Andrew Crespo García",
    "https://commons.wikimedia.org/wiki/File:Sunset_(218509417).jpeg",
  ),
  image(
    "Mountains Landscape.jpg",
    "Mountain landscape",
    "PikWizard contributor",
    "https://commons.wikimedia.org/wiki/File:Mountains_Landscape.jpg",
  ),
  image(
    "Lake Mountain Landscape.jpg",
    "Mountain lake",
    "Bonnie Moreland",
    "https://commons.wikimedia.org/wiki/File:Lake_Mountain_Landscape.jpg",
  ),
  image(
    "City silhouette at night.jpg",
    "Stockholm city silhouette",
    "Martin Eklund",
    "https://commons.wikimedia.org/wiki/File:City_silhouette_at_night.jpg",
  ),
  image(
    "Kolkata City at night.jpg",
    "Kolkata at night",
    "XYZ 91973",
    "https://commons.wikimedia.org/wiki/File:Kolkata_City_at_night.jpg",
  ),
  video(
    "Fireweed seed pod bursting open in Tuntorp.webm",
    "Fireweed seed pod opening",
    "W.carter",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Fireweed_seed_pod_bursting_open_in_Tuntorp.webm",
    "Home Workspace.jpg",
  ),
  video(
    "A freezing soap bubble in McGregor, Minnesota.webm",
    "Freezing soap bubble",
    "Lorie Shaull",
    "CC BY 2.0",
    "https://commons.wikimedia.org/wiki/File:A_freezing_soap_bubble_in_McGregor,_Minnesota.webm",
    "Sunset (218509417).jpeg",
  ),
  video(
    "Close-up of Grass (3).webm",
    "Close-up grass study",
    "Joaquim Baeta",
    "CC BY 4.0",
    "https://commons.wikimedia.org/wiki/File:Close-up_of_Grass_(3).webm",
    "Mountains Landscape.jpg",
  ),
  video(
    "Moomin2.webm",
    "Vertical motion study",
    "Tet",
    "CC0 1.0",
    "https://commons.wikimedia.org/wiki/File:Moomin2.webm",
    "Lake Mountain Landscape.jpg",
  ),
  video(
    "Molcajete.webm",
    "3D object turntable",
    "Wiki Learning Tec de Monterrey contributors",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Molcajete.webm",
    "City silhouette at night.jpg",
  ),
  video(
    "Web browser demo.webm",
    "Web browser interaction",
    "DecafPotato",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Web_browser_demo.webm",
    "Kolkata City at night.jpg",
  ),
] as const;

function commonsFileUrl(fileName: string, width?: number) {
  const url = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
  return width ? `${url}?width=${width}` : url;
}

export function demoAssetFor(mediaType: "picture" | "video", seed: number) {
  const choices = DEMO_MEDIA_ASSETS.filter((asset) => asset.mediaType === mediaType);
  return choices[Math.abs(seed) % choices.length];
}

export function demoContentKey(asset: DemoMediaAsset, thumbnail = false) {
  const fileName = thumbnail && asset.thumbnailFileName
    ? asset.thumbnailFileName
    : asset.fileName;
  const width = thumbnail || asset.mediaType === "picture" ? 1280 : undefined;
  return `demo:${commonsFileUrl(fileName, width)}`;
}

export function demoUrlFromObjectKey(objectKey: string | null) {
  if (!objectKey?.startsWith("demo:")) return null;
  const value = objectKey.slice(5);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "commons.wikimedia.org"
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function proxyDemoMedia(
  objectKey: string,
  options: { range?: string | null; thumbnail?: boolean } = {},
) {
  const url = demoUrlFromObjectKey(objectKey);
  if (!url) return null;
  const headers = new Headers();
  if (options.range && !options.thumbnail) headers.set("Range", options.range);
  const upstream = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 404 });

  const responseHeaders = new Headers({
    "Cache-Control": options.thumbnail
      ? "private, max-age=300"
      : "private, no-store",
  });
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const decodedFileName = decodeURIComponent(
    url.pathname.split("/").filter(Boolean).at(-1) || "",
  );
  const asset = DEMO_MEDIA_ASSETS.find(
    (item) =>
      item.fileName === decodedFileName ||
      item.thumbnailFileName === decodedFileName,
  );
  if (asset) {
    responseHeaders.set("Link", `<${asset.sourcePage}>; rel="describedby"`);
    responseHeaders.set("X-Demo-Media-License", asset.license);
  }
  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
  });
}
