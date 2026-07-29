export const USE_PRODUCTION_HEADER = "x-johnsweber-use-production";

export function requestUsesProduction(request: Request) {
  return request.headers.get(USE_PRODUCTION_HEADER)?.toLowerCase() === "true";
}

