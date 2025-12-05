/**
 * OpenAI-compatible LLM client for RAG-based question answering.
 */

import type { ChunkType } from "../store";
import type { ChatCompletionResponse } from "./types";

const QA_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context from code files.
Use the context to answer the question accurately and concisely.
When you use information from a specific chunk, cite it using <cite i="N" /> where N is the chunk number (0-indexed).
If you cannot find the answer in the context, say so clearly.
Do not make up information that is not in the context.`;

/**
 * Client for generating answers using an OpenAI-compatible chat API.
 */
export class LLMClient {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  /**
   * Sends a chat completion request.
   * @param messages - Array of chat messages
   * @returns Generated response content
   */
  async complete(
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.1, // Low temperature for factual answers
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data: ChatCompletionResponse = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  /**
   * Generates an answer based on retrieved context chunks.
   * @param question - User question
   * @param chunks - Retrieved context chunks
   * @returns Generated answer with citations
   */
  async generateAnswer(question: string, chunks: ChunkType[]): Promise<string> {
    // Build context from chunks
    const contextParts = chunks.map((chunk, index) => {
      const metadata = chunk.metadata as { path?: string } | undefined;
      const path = metadata?.path || "unknown";
      const text = "text" in chunk ? chunk.text : "";
      return `[${index}] From ${path}:\n${text}`;
    });

    const contextText = contextParts.join("\n\n---\n\n");

    const messages = [
      { role: "system", content: QA_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Context:\n${contextText}\n\n---\n\nQuestion: ${question}`,
      },
    ];

    return await this.complete(messages);
  }
}
