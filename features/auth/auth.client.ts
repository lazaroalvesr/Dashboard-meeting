"use client";

import { appConfig } from "@/lib/config";

import type { LoginRequest, LoginResponse } from "./auth.types";

const ACCESS_TOKEN_KEY = "meeting-platform.access-token";

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAccessToken() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export async function login(request: LoginRequest) {
  const response = await fetch(`${appConfig.apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("E-mail ou senha inválidos.");
  }

  const data = (await response.json()) as LoginResponse;

  sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);

  return data;
}

export async function refreshAccessToken() {
  const response = await fetch(`${appConfig.apiUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearAccessToken();
    return null;
  }

  const data = (await response.json()) as LoginResponse;

  sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);

  return data.accessToken;
}

export async function logout() {
  await fetch(`${appConfig.apiUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  clearAccessToken();
}
