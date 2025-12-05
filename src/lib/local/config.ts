/**
 * Configuration for local embedding storage using Qdrant and OpenAI-compatible APIs.
 */

export interface LocalConfig {
  provider: "local" | "mixedbread";
  qdrantUrl: string;
  embeddingUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  llmUrl: string;
  llmModel: string;
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * Loads local configuration from environment variables.
 * @returns Configuration object with defaults applied
 */
export function loadLocalConfig(): LocalConfig {
  return {
    provider:
      (process.env.MGREP_PROVIDER as "local" | "mixedbread") || "mixedbread",
    qdrantUrl: process.env.MGREP_QDRANT_URL || "http://localhost:6333",
    embeddingUrl: process.env.MGREP_EMBEDDING_URL || "http://localhost:11434",
    embeddingModel: process.env.MGREP_EMBEDDING_MODEL || "nomic-embed-text",
    embeddingDimensions: Number.parseInt(
      process.env.MGREP_EMBEDDING_DIMENSIONS || "768",
      10,
    ),
    llmUrl:
      process.env.MGREP_LLM_URL ||
      process.env.MGREP_EMBEDDING_URL ||
      "http://localhost:11434",
    llmModel: process.env.MGREP_LLM_MODEL || "llama3.2",
    chunkSize: Number.parseInt(process.env.MGREP_CHUNK_SIZE || "1000", 10),
    chunkOverlap: Number.parseInt(process.env.MGREP_CHUNK_OVERLAP || "200", 10),
  };
}

/**
 * Checks if the local provider is configured.
 * @returns true if MGREP_PROVIDER is set to 'local'
 */
export function isLocalProvider(): boolean {
  return process.env.MGREP_PROVIDER === "local";
}
