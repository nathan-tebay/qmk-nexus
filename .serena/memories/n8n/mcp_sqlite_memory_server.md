# n8n — MCP SQLite Memory Server

Project in `agent-memory/` directory. All 10 tool handlers implemented and complete.

**Core concept:** Shared SQLite database allowing multiple AI agents to store/query structured data across projects with custom schemas, a global knowledge base, inter-agent messaging, conflict detection, and full audit logging.

**Status as of 2026-03-28:** All code written. Remaining work:
1. Wire tool handler Code nodes into the n8n workflow (switch outputs → handlers → response formatter → webhook response)
2. Add authentication/API keys
3. Schema evolution strategy for existing projects
4. End-to-end testing

**How to apply:** The CLAUDE.md in `agent-memory/` has the complete project summary. Read it first when working on this project.
