# Phase 12 — AI Workspace

Goal: a polished AI chat app plus AI features inside other apps, all powered by **AI servers the user configures** (local or remote). Nexus never fakes AI output. When no provider is configured or the server is unreachable, the UI explains why and how to fix it.

## 12.1 Provider layer (`services/ai`)
- [P1] One provider interface: `listModels()`, `chat(messages, options)` with **streaming**, `cancel()`, `embed(texts)` where supported, capability flags (streaming, tools, vision, embeddings, JSON mode).
- [P1] Adapters:
  - **Ollama** (native API: `/api/tags`, `/api/chat`, `/api/embed`),
  - **Lemonade** (its OpenAI-compatible endpoint),
  - **any OpenAI-compatible API** (LM Studio, llama.cpp server, vLLM, LocalAI, OpenRouter, OpenAI …: `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`).
- [P2] **Anthropic API** adapter (Messages API with streaming; requires the browser-access header; warn clearly that the API key is stored in this browser).
- [P1] Multiple saved provider profiles (name, type, base URL, API key, default model, extra headers), "Test connection" with a clear diagnosis (offline, DNS/connection refused, CORS blocked, 401 unauthorized, model not found).
- [P1] Setup guides in Help: installing Ollama, allowing the Nexus origin (`OLLAMA_ORIGINS`), starting Lemonade, using an OpenAI-compatible server; and the note that the live HTTPS site can't call an `http://` server on another machine because of mixed-content rules (localhost is fine in most browsers).
- [P1] API keys encrypted at rest with a device key (and optionally the profile password); never written to logs or backups unless the user opts in.
- [P1] Token/time stats per message (tokens in/out if reported, tokens per second, latency).

## 12.2 Chat app
- [P1] Conversation list with search, folders/pins, rename (auto-title from the first message using the model, optional), delete, archive.
- [P1] Messages rendered as Markdown with code highlighting, math (KaTeX), tables; copy buttons per message and per code block.
- [P1] Streaming with a stop button; regenerate; edit a previous user message and resend (branching: keep alternative answers, switch between them).
- [P1] Model selector per conversation, parameters panel (temperature, top-p, max tokens, context length where supported), system prompt per conversation.
- [P1] **Personas / assistants:** saved system prompts with name, icon, default model and parameters (e.g. "CS Tutor", "German ↔ English translator", "Code Reviewer", "Exam Coach").
- [P1] **Prompt templates** with variables (`{{topic}}`, `{{language}}`), filled in by a small form; library with categories; import/export.
- [P1] Attachments: text files and code from VFS or drag & drop inserted as context (with size/token estimate warnings); **images for vision models**.
- [P1] Export a conversation as Markdown/JSON/HTML; import JSON.
- [P1] Context management: show approximate token usage, auto-trim oldest messages with a visible note, or summarize older parts (P2).
- [P2] **Compare mode:** send the same prompt to 2–3 models side by side.
- [P2] Voice input via the Web Speech API where supported, read answers aloud via speech synthesis.

## 12.3 Code assistant mode
- [P1] A layout with a code panel next to the chat; the assistant's code blocks can be applied to the panel, diffed against the current version (Diff Viewer), and sent to Code Playground / Nexus Code via intents.
- [P1] Quick actions on selected code: explain, find bugs, add comments, write tests, convert to another language, optimize.
- [P2] "Fix this error": send the Playground console error + code to the assistant.

## 12.4 Knowledge: chat with your files (RAG)
- [P1] Index selected folders (e.g. Notes) using the provider's **embedding** endpoint; chunking with overlap; vectors stored in IndexedDB; cosine similarity search in a worker.
- [P1] In chat: "Use my notes" toggle; retrieved chunks shown as citations that open the source note.
- [P1] Index status, re-index on changes, clear index; honest message if the configured provider has no embedding model.
- [P2] Hybrid search (keyword via the OS search index + vectors).

## 12.5 OS actions (tool calling)
- [P1] Tools exposed to models that support tool calling: create note, append to note, search notes, create task, list today's tasks, create calendar event, start a focus session, open app, set theme/wallpaper, create flashcards.
- [P1] **Every action needs user confirmation** in an approval card that shows exactly what will happen; a per-conversation "allow this tool without asking" option for harmless read-only tools.
- [P1] Actions are logged and undoable where the target app supports undo.
- [P2] For models without native tool calling: a JSON-mode fallback with strict parsing; if parsing fails, ask the user instead of guessing.

## 12.6 AI inside other apps (through `ctx.ai`)
Each is [P2] and only shown when `ctx.ai.isAvailable()`:
- **Notes:** summarize, continue writing, fix grammar (EN/DE), translate, generate an outline, explain a selection.
- **Tasks:** break a task into subtasks, estimate effort, plan my day from today's tasks and calendar.
- **Flashcards:** generate cards from a note or selection (user reviews them before saving).
- **Exam planner:** generate a study plan from topics.
- **Sheets:** explain a formula, write a formula from a description.
- **Code Playground / Nexus Code / Regex / SQL:** explain, generate, fix (regex from description, SQL from description using the current schema).
- **Terminal:** `ai "question"` command and `ai explain <command>`.
- **Photos:** describe an image (vision models), generate alt text.

## 12.7 Safety and privacy
- [P1] A clear notice in the AI app and Settings: what is sent where (only to the configured server), nothing else leaves the browser.
- [P1] Per-request preview of attached context (which files/notes are being sent).
- [P1] No auto-sending of any data in the background; RAG indexing only on user request.

## Done when
With Ollama or any OpenAI-compatible server configured, the user gets a fast, streaming, well-rendered chat with personas, templates, attachments, chat-with-notes and confirmed OS actions. With nothing configured, every AI feature is hidden or shows an honest setup guide, and nothing is faked.
