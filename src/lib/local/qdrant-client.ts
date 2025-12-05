/**
 * Qdrant vector database wrapper with typed operations.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import type { ChunkPayload, QdrantPoint } from "./types";

export interface SearchResult {
  id: string;
  score: number;
  payload: ChunkPayload;
}

/**
 * Typed wrapper around the Qdrant client for mgrep operations.
 */
export class QdrantWrapper {
  private client: QdrantClient;

  constructor(url: string) {
    this.client = new QdrantClient({ url });
  }

  /**
   * Creates a collection if it doesn't already exist.
   * @param name - Collection name
   * @param dimensions - Vector dimensions (must match embedding model)
   */
  async createCollectionIfNotExists(
    name: string,
    dimensions: number,
  ): Promise<void> {
    const exists = await this.collectionExists(name);
    if (!exists) {
      await this.client.createCollection(name, {
        vectors: {
          size: dimensions,
          distance: "Cosine",
        },
      });
    }
  }

  /**
   * Checks if a collection exists.
   * @param name - Collection name
   * @returns true if collection exists
   */
  async collectionExists(name: string): Promise<boolean> {
    try {
      await this.client.getCollection(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Upserts points into a collection.
   * @param collection - Collection name
   * @param points - Points to upsert
   */
  async upsertPoints(collection: string, points: QdrantPoint[]): Promise<void> {
    await this.client.upsert(collection, {
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
  }

  /**
   * Deletes all points for a given external ID (file).
   * @param collection - Collection name
   * @param externalId - External ID to delete
   */
  async deletePointsByExternalId(
    collection: string,
    externalId: string,
  ): Promise<void> {
    await this.client.delete(collection, {
      filter: {
        must: [
          {
            key: "externalId",
            match: { value: externalId },
          },
        ],
      },
    });
  }

  /**
   * Performs a vector similarity search.
   * @param collection - Collection name
   * @param vector - Query vector
   * @param limit - Maximum number of results
   * @param filter - Optional path prefix filter
   * @returns Sorted search results
   */
  async search(
    collection: string,
    vector: number[],
    limit: number,
    filter?: { path_prefix?: string },
  ): Promise<SearchResult[]> {
    const qdrantFilter = filter?.path_prefix
      ? {
          must: [
            {
              key: "path",
              match: { text: filter.path_prefix },
            },
          ],
        }
      : undefined;

    const results = await this.client.search(collection, {
      vector,
      limit,
      filter: qdrantFilter,
      with_payload: true,
    });

    return results.map((r) => ({
      id: r.id as string,
      score: r.score,
      payload: r.payload as unknown as ChunkPayload,
    }));
  }

  /**
   * Gets all unique external IDs (files) in a collection.
   * @param collection - Collection name
   * @returns Map of external ID to first chunk payload
   */
  async getAllExternalIds(
    collection: string,
  ): Promise<Map<string, ChunkPayload>> {
    const fileMap = new Map<string, ChunkPayload>();
    let offset: string | number | undefined;

    do {
      const response = await this.client.scroll(collection, {
        limit: 100,
        offset,
        with_payload: true,
      });

      for (const point of response.points) {
        const payload = point.payload as unknown as ChunkPayload;
        if (payload.externalId && payload.chunkIndex === 0) {
          fileMap.set(payload.externalId, payload);
        }
      }

      offset = response.next_page_offset as string | number | undefined;
    } while (offset !== undefined && offset !== null);

    return fileMap;
  }

  /**
   * Gets collection statistics.
   * @param collection - Collection name
   * @returns Object with points count
   */
  async getCollectionInfo(
    collection: string,
  ): Promise<{ points_count: number }> {
    const info = await this.client.getCollection(collection);
    return {
      points_count: info.points_count ?? 0,
    };
  }
}
