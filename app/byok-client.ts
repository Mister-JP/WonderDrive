"use client";

import { OPENAI_API_KEY_HEADER } from "../lib/provider-auth";

const STORAGE_KEY = "curiositypedia.openai_api_key";

export function readSessionOpenAIKey(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY)?.trim();
  return value || null;
}

export function writeSessionOpenAIKey(value: string) {
  const apiKey = value.trim();
  if (!apiKey.startsWith("sk-") || apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    throw new Error("Enter a valid OpenAI API key beginning with sk-.");
  }
  window.sessionStorage.setItem(STORAGE_KEY, apiKey);
}

export function clearSessionOpenAIKey() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
}

export function openAIKeyRequestHeaders(): Record<string, string> {
  const apiKey = readSessionOpenAIKey();
  return apiKey ? { [OPENAI_API_KEY_HEADER]: apiKey } : {};
}
