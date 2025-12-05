/**
 * LocalStore implementation using Qdrant for vector storage
 * and OpenAI-compatible APIs for embeddings and LLM.
 */

import { createHash } from "node:crypto";
import type { SearchFilter } from "@mixedbread/sdk/resources/shared";
import type {
  AskResponse,
  ChunkType,
  CreateStoreOptions,
  SearchResponse,
  Store,
  StoreFile,
  StoreInfo,
  UploadFileOptions,
} from "../store";
import { chunkText } from "./chunker";
import type { LocalConfig } from "./config";
import { EmbeddingClient } from "./embedding-client";
import { LLMClient } from "./llm-client";
import { QdrantWrapper } from "./qdrant-client";
import type { QdrantPoint } from "./types";

/**
 * Store implementation using local Qdrant and OpenAI-compatible embedding/LLM APIs.
 */
export class LocalStore implements Store {
  private config: LocalConfig;
  private qdrant: QdrantWrapper;
  private embedding: EmbeddingClient;
  private llm: LLMClient;

  constructor(config: LocalConfig) {
    this.config = config;
    this.qdrant = new QdrantWrapper(config.qdrantUrl);
    this.embedding = new EmbeddingClient(
      config.embeddingUrl,
      config.embeddingModel,
    );
    this.llm = new LLMClient(config.llmUrl, config.llmModel);
  }

  private getCollectionName(storeId: string): string {
    return `mgrep_${storeId}`;
  }

  private generatePointId(externalId: string, chunkIndex: number): string {
    return createHash("sha256")
      .update(`${externalId}:${chunkIndex}`)
      .digest("hex")
      .slice(0, 32);
  }

  async *listFiles(storeId: string): AsyncGenerator<StoreFile> {
    const collection = this.getCollectionName(storeId);

    try {
      const fileMap = await this.qdrant.getAllExternalIds(collection);

      for (const [externalId, payload] of fileMap) {
        yield {
          external_id: externalId,
          metadata: {
            path: payload.path,
            hash: payload.hash,
          },
        };
      }
    } catch {
      // Collection doesn't exist yet, yield nothing
    }
  }

  async uploadFile(
    storeId: string,
    file: File | ReadableStream,
    options: UploadFileOptions,
  ): Promise<void> {
    const collection = this.getCollectionName(storeId);
    const filePath = options.metadata?.path || options.external_id;

    try {
      // Ensure collection exists
      await this.qdrant.createCollectionIfNotExists(
        collection,
        this.config.embeddingDimensions,
      );

      // Read file content
      const content = await this.readFileContent(file);

      // Chunk the content
      const chunks = chunkText(content, {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      });

      if (chunks.length === 0) {
        return; // Empty file, nothing to index
      }

      // Generate embeddings for all chunks (one at a time to avoid batch issues)
      const embeddings: number[][] = [];
      for (const chunk of chunks) {
        const embedding = await this.embedding.embedSingle(chunk.text);
        embeddings.push(embedding);
      }

      // Delete existing points for this file (if overwrite)
      if (options.overwrite !== false) {
        await this.qdrant.deletePointsByExternalId(
          collection,
          options.external_id,
        );
      }

      // Create points
      const points: QdrantPoint[] = chunks.map((chunk, index) => ({
        id: this.generatePointId(options.external_id, index),
        vector: embeddings[index],
        payload: {
          path: options.metadata?.path || options.external_id,
          hash: options.metadata?.hash || "",
          text: chunk.text,
          startLine: chunk.startLine,
          numLines: chunk.numLines,
          chunkIndex: chunk.chunkIndex,
          externalId: options.external_id,
        },
      }));

      // Upsert to Qdrant
      await this.qdrant.upsertPoints(collection, points);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[LocalStore] Failed to upload ${filePath}: ${errorMsg}`);
      throw error;
    }
  }

  async deleteFile(storeId: string, externalId: string): Promise<void> {
    const collection = this.getCollectionName(storeId);
    await this.qdrant.deletePointsByExternalId(collection, externalId);
  }

  async search(
    storeId: string,
    query: string,
    top_k?: number,
    _search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<SearchResponse> {
    const collection = this.getCollectionName(storeId);
    const limit = top_k || 10;

    // Generate query embedding
    const queryVector = await this.embedding.embedSingle(query);

    // Extract path prefix filter if present
    let pathPrefix: string | undefined;
    if (filters?.all) {
      const pathFilter = filters.all.find(
        (f) => "key" in f && f.key === "path" && f.operator === "starts_with",
      );
      if (pathFilter && "value" in pathFilter) {
        pathPrefix = pathFilter.value as string;
      }
    }

    // Search in Qdrant
    const results = await this.qdrant.search(
      collection,
      queryVector,
      limit,
      pathPrefix ? { path_prefix: pathPrefix } : undefined,
    );

    // Convert to ChunkType format
    const data: ChunkType[] = results.map(
      (r) =>
        ({
          type: "text",
          text: r.payload.text,
          score: r.score,
          metadata: {
            path: r.payload.path,
            hash: r.payload.hash,
          },
          chunk_index: r.payload.chunkIndex,
          generated_metadata: {
            start_line: r.payload.startLine,
            num_lines: r.payload.numLines,
          },
        }) as unknown as ChunkType,
    );

    return { data };
  }

  async ask(
    storeId: string,
    question: string,
    top_k?: number,
    search_options?: { rerank?: boolean },
    filters?: SearchFilter,
  ): Promise<AskResponse> {
    // First, search for relevant chunks
    const searchResults = await this.search(
      storeId,
      question,
      top_k || 5,
      search_options,
      filters,
    );

    if (searchResults.data.length === 0) {
      return {
        answer: "No relevant information found to answer this question.",
        sources: [],
      };
    }

    // Generate answer using LLM
    const answer = await this.llm.generateAnswer(question, searchResults.data);

    return {
      answer,
      sources: searchResults.data,
    };
  }

  async retrieve(storeId: string): Promise<unknown> {
    return await this.getInfo(storeId);
  }

  async create(options: CreateStoreOptions): Promise<unknown> {
    const collection = this.getCollectionName(options.name);
    await this.qdrant.createCollectionIfNotExists(
      collection,
      this.config.embeddingDimensions,
    );
    return {
      name: options.name,
      description: options.description || "",
    };
  }

  async getInfo(storeId: string): Promise<StoreInfo> {
    const collection = this.getCollectionName(storeId);

    try {
      const info = await this.qdrant.getCollectionInfo(collection);
      return {
        name: storeId,
        description: `Local store with ${info.points_count} chunks`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        counts: {
          pending: 0, // Local processing is synchronous
          in_progress: 0,
        },
      };
    } catch {
      return {
        name: storeId,
        description: "Local store (not initialized)",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        counts: { pending: 0, in_progress: 0 },
      };
    }
  }

  private async readFileContent(file: File | ReadableStream): Promise<string> {
    // Handle Web File API
    if ("text" in file && typeof (file as File).text === "function") {
      return await (file as File).text();
    }

    // Handle Web ReadableStream
    if ("getReader" in file && typeof (file as ReadableStream).getReader === "function") {
      const reader = (file as ReadableStream).getReader();
      const decoder = new TextDecoder();
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
      return result;
    }

    // Handle Node.js Readable stream (from fs.createReadStream)
    if (typeof (file as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of file as unknown as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf-8");
    }

    // Handle Node.js stream with 'on' method
    const fileWithOn = file as unknown as { on?: unknown };
    if (fileWithOn.on && typeof fileWithOn.on === "function") {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = file as unknown as NodeJS.ReadableStream;
        stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", reject);
      });
    }

    throw new Error("Unknown file type");
  }
}
