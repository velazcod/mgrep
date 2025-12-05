/**
 * Type definitions for local embedding storage.
 */

export interface Chunk {
  text: string;
  startLine: number;
  numLines: number;
  chunkIndex: number;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}

export interface ChunkPayload {
  path: string;
  hash: string;
  text: string;
  startLine: number;
  numLines: number;
  chunkIndex: number;
  externalId: string;
  [key: string]: unknown;
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}
