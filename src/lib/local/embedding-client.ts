/**
 * OpenAI-compatible embedding API client.
 * Supports Ollama, LMStudio, and other compatible servers.
 */


/**
 * Client for generating text embeddings via OpenAI-compatible API.
 */
export class EmbeddingClient {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  /**
   * Generates embeddings for multiple texts in a single batch.
   * @param texts - Array of text strings to embed
   * @returns Array of embedding vectors in the same order as input
   */
  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error(`Invalid embedding response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    // Sort by index to maintain order (if index exists)
    const sorted = data.data.sort((a: { index?: number }, b: { index?: number }) =>
      (a.index ?? 0) - (b.index ?? 0)
    );
    return sorted.map((item: { embedding: number[] }) => item.embedding);
  }

  /**
   * Generates an embedding for a single text.
   * @param text - Text string to embed
   * @returns Embedding vector
   */
  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }
}
