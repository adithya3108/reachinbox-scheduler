import { api, API_BASE_URL } from "./api";
import type { User } from "../types";

export async function fetchMe(): Promise<User | null> {
  try {
    const res = await api.get("/auth/me");
    return res.data.data as User;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/google`;
}
