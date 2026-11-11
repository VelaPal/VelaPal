import { apiData, type RequestOptions } from "@/services/contracts/api-client";

const configuredApiRoot =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "/api/v1";

/** Compatibility facade for feature services. Responses are unwrapped API data. */
export const httpClient = <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
  const path = endpoint.startsWith(configuredApiRoot)
    ? endpoint.slice(configuredApiRoot.length) || "/"
    : endpoint;
  return apiData<T>(path, options);
};

export { ApiError } from "@/services/contracts/api-client";
