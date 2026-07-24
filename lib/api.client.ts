"use client";

import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
} from "@/features/auth/auth.client";
import { appConfig } from "@/lib/config";

async function getErrorMessage(response: Response) {
  const body = await response.json().catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    (("message" in body && typeof body.message === "string") ||
      ("detail" in body && typeof body.detail === "string"))
  ) {
    return "message" in body && typeof body.message === "string"
      ? body.message
      : body.detail as string;
  }

  return `Request failed (HTTP ${response.status}).`;
}

async function request<T>(
  path: string,
  init: RequestInit,
  accessToken?: string,
) {
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new ApiError(response.status, await getErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function publicRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, init);
}

export async function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
) {
  let accessToken = getAccessToken() ?? (await refreshAccessToken());

  if (!accessToken) {
    throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
  }

  try {
    return await request<T>(path, init, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    accessToken = await refreshAccessToken();

    if (!accessToken) {
      throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
    }

    return request<T>(path, init, accessToken);
  }
}

export async function authenticatedBlob(path: string) {
  let accessToken = getAccessToken() ?? (await refreshAccessToken());
  if (!accessToken) throw new ApiError(401, "Sua sessão expirou. Entre novamente.");

  const makeRequest = (token: string) => fetch(`${appConfig.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });

  let response = await makeRequest(accessToken);
  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    if (!accessToken) throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
    response = await makeRequest(accessToken);
  }
  if (!response.ok) throw new ApiError(response.status, await getErrorMessage(response));
  return response.blob();
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function resetSession() {
  clearAccessToken();
}
