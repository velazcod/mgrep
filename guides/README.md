# mgrep – Practical Guide

`mgrep` is a semantic, grep‑like search tool for your local files. Instead of
matching exact keywords, it understands your natural-language questions and
finds relevant code, docs, and configuration across your repo.

This guide complements the main [`README`](../README.md) by focusing on
**practical, task-based workflows and examples**. If you just want installation
and a quick command overview, start with the main README. If you want to see how
to use mgrep in your day‑to‑day work, read on.

## TL;DR

```bash
npm install -g @mixedbread/mgrep    # or pnpm / bun
```

### Manual usage

```bash
cd path/to/repo                     # go to the project you want to index
mgrep watch                         # index and keep your store in sync

mgrep "What code parsers are available?"  # ask questions in natural language
mgrep -a "How is rate limiting implemented?"  # get a human and agent readable answer to the question
mgrep "What are the results of this paper?" my-paper.pdf  # search for PDF pages
```

### Claude Code usage

```bash
cd path/to/repo                     # go to the project you want to index
mgrep install-claude-code
claude
```

## How it works

At a high level, `mgrep` works in two steps:

1. **Index your files.**  
   When you run `mgrep watch` in a repo, `mgrep`:
   - Scans your files (respecting `.gitignore` and common build artifacts).
   - Uploads them into a Mixedbread Store (a cloud-backed semantic index).
   - Keeps that store up to date as files change via a file watcher.

2. **Search with natural language.**  
   When you run `mgrep "Where is the auth middleware configured?" src`, mgrep:
   - Uses [Mixedbread Search](https://www.mixedbread.com/blog/mixedbread-search)
     to retrieve the most semantically relevant chunks.
   - Reranks results so that the most useful matches appear first, even if the
     exact words you used never appear in the code.

Think of it as \"grep for meaning\": you describe what you are looking for in
plain language, and `mgrep` finds the parts of the repo that best answer that
description.

The claude code plugin will start to index the repo and keep the store in sync
automatically. No need to run `mgrep watch` manually.

### Example 1: Set up a repo for mgrep and an agent

```bash
cd ~/code/my-project

# 1. Sign in once (or set MXBAI_API_KEY in your shell/CI)
mgrep login

# 2. Install the mgrep plugin for claude code. The mgrep plugin will start to index the repo and keep the store in sync automatically.
mgrep install-claude-code

# 3. Ask questions while you work
mgrep "Where do we initialize the HTTP server?" src
mgrep "How is error handling wired up in the API layer?" src/api
```

Now open your editor or Claude Code and point the agent at `~/code/my-project`.
As you refactor, your index stays fresh automatically, so agent answers stay
grounded in the latest version of your code. No need to run `mgrep watch`
manually for claude code.

### Example 2: Classic `grep` vs mgrep

You know there is some authentication middleware, but you do not remember the exact
symbol or file name. With classic `grep` you might try:

```bash
# Searching for any mention of "auth"
grep -R "auth" src
```

This can be noisy, especially in large repos or where the concept you care about is
implemented under different names.

With `mgrep`, you describe what you mean instead of guessing the exact keyword:

```bash
# Search semantically within src
mgrep "Where is the auth middleware configured?" src

# Limit to the top 5 most relevant matches (the default is 10)
mgrep -m 5 "Where is the auth middleware configured?" src

# Get a human and agent readable answer to the question
mgrep -a "Where is the auth middleware configured?" src
```

Because `mgrep` searches by meaning, it can surface files like `auth_middleware.ts`,
`session.ts`, or `passport-setup.js` even if they never contain the literal phrase
\"auth middleware\".

### Example 3: Asking higher‑level questions

Semantic search becomes even more powerful when you use it to explore architecture
and behavior, not just symbols. For example, in a new repo you might ask:

```bash
# Explore how background jobs work
mgrep -m 15 "How are background jobs scheduled?"

# See content around the matches to skim quickly
mgrep -c "Where do we validate user input for the signup form?"

# Let mgrep summarize across results
mgrep -a "How does rate limiting work in this service?"
```

- `-m` controls how many results you see.  
- `-c` prints the surrounding content for each match so you can skim without opening files.  
- `-a` asks `mgrep` to generate an answer based on the retrieved context, which is helpful
  when you want a narrative explanation rather than a list of matches.

### Example 4: Searching PDFs and other non-code files

`mgrep` can be used to search other file types than just code. For example, you
can search PDFs:

```bash
mgrep "What is the conclusion of the paper?" my-paper.pdf
```

This will return the most relevant pages from the PDF in order of relevance.

## Local Mode Setup

`mgrep` can run entirely locally without the Mixedbread cloud. Local mode requires:
- A **Qdrant** vector database
- An **OpenAI-compatible** embedding server (e.g., Ollama, LM Studio)
- Optionally, an **OpenAI-compatible** LLM server for the `-a` flag

### Configuration

Enable local mode by setting the `MGREP_PROVIDER` environment variable:

```bash
export MGREP_PROVIDER=local
```

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `MGREP_PROVIDER` | Set to `local` for local mode | `mixedbread` |
| `MGREP_QDRANT_URL` | Qdrant server URL | `http://localhost:6333` |
| `MGREP_EMBEDDING_URL` | Embedding API endpoint (OpenAI-compatible `/v1/embeddings`) | `http://localhost:11434` |
| `MGREP_EMBEDDING_MODEL` | Embedding model name | `mxbai-embed-large` |
| `MGREP_EMBEDDING_DIMENSIONS` | Vector dimensions for the embedding model | `1024` |
| `MGREP_LLM_URL` | LLM API endpoint (OpenAI-compatible `/v1/chat/completions`) | Falls back to `MGREP_EMBEDDING_URL` |
| `MGREP_LLM_MODEL` | LLM model for answer generation (`-a` flag) | `llama3.2` |
| `MGREP_CHUNK_SIZE` | Text chunk size in characters | `1000` |
| `MGREP_CHUNK_OVERLAP` | Overlap between chunks in characters | `200` |

### Example Configuration

```bash
# Enable local mode
export MGREP_PROVIDER=local

# Qdrant vector database
export MGREP_QDRANT_URL=http://localhost:6333

# Embedding configuration
export MGREP_EMBEDDING_URL=http://localhost:11434
export MGREP_EMBEDDING_MODEL=mxbai-embed-large
export MGREP_EMBEDDING_DIMENSIONS=1024

# LLM configuration (for -a flag)
export MGREP_LLM_URL=http://localhost:11434
export MGREP_LLM_MODEL=llama3.2

# Use mgrep
mgrep watch                          # Index your files
mgrep "Where is auth configured?"    # Search
mgrep -a "How does caching work?"    # Search with answer generation
```

### Limitations

Local mode has some differences compared to Mixedbread cloud:

| Feature | Mixedbread Cloud | Local Mode |
| --- | --- | --- |
| Reranking | Yes (enabled by default) | No (pure vector similarity) |
| Multimodal (images, PDFs) | Yes | Text-only |
| Background indexing | Yes (async processing) | No (synchronous) |
| Cloud sync/sharing | Yes | No (data stays local) |
| Authentication | Required | Not needed |

## Further reading

- Main project overview and full command list: [`../README.md`](../README.md)  
- Mixedbread Search, the engine behind mgrep:
  <https://www.mixedbread.com/blog/mixedbread-search>
