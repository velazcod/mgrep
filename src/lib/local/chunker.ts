/**
 * Text chunking utilities with line number tracking.
 */

import type { Chunk } from "./types";

export interface ChunkerOptions {
  chunkSize: number;
  chunkOverlap: number;
}

/**
 * Splits text into chunks while preserving line number information.
 * @param content - The text content to chunk
 * @param options - Chunking configuration
 * @returns Array of chunks with line number metadata
 */
export function chunkText(content: string, options: ChunkerOptions): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentChunk = "";
  let chunkStartLine = 0;
  let linesInChunk = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineWithNewline = `${line}\n`;

    // Check if adding this line would exceed chunk size
    if (
      currentChunk.length + lineWithNewline.length > options.chunkSize &&
      currentChunk.length > 0
    ) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trimEnd(),
        startLine: chunkStartLine,
        numLines: linesInChunk,
        chunkIndex: chunks.length,
      });

      // Calculate overlap: find lines that fit within overlap size
      const overlapLines: string[] = [];
      let overlapSize = 0;
      const currentLines = currentChunk.split("\n");

      for (
        let i = currentLines.length - 1;
        i >= 0 && overlapSize < options.chunkOverlap;
        i--
      ) {
        overlapLines.unshift(currentLines[i]);
        overlapSize += currentLines[i].length + 1;
      }

      // Start new chunk with overlap
      currentChunk = `${overlapLines.join("\n")}\n${line}\n`;
      chunkStartLine = lineIndex - overlapLines.length + 1;
      linesInChunk = overlapLines.length + 1;
    } else {
      if (currentChunk.length === 0) {
        chunkStartLine = lineIndex;
        linesInChunk = 0;
      }
      currentChunk += lineWithNewline;
      linesInChunk++;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trimEnd(),
      startLine: chunkStartLine,
      numLines: linesInChunk,
      chunkIndex: chunks.length,
    });
  }

  return chunks;
}
