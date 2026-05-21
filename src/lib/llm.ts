/**
 * Minimal OpenAI-compatible chat completion client.
 * Supports any provider that implements the /v1/chat/completions shape.
 */

import { getEnv } from "../config/env.js";
import { logger } from "./logger.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Send a chat completion request to an OpenAI-compatible API.
 * Returns the response text, or `null` if the call fails or LLM is not configured.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string | null> {
  const env = getEnv();

  if (!env.LLM_API_KEY) {
    logger.warn("LLM_API_KEY not set — skipping LLM call");
    return null;
  }

  const model = options.model ?? env.LLM_MODEL;
  const baseUrl = env.LLM_BASE_URL.replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens ?? 512,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "unknown");
      logger.error({ status: response.status, body: errBody }, "LLM API request failed");
      return null;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error({ err }, "LLM API request threw");
    return null;
  }
}
