# Chatbot Guide

Setup, development, and deployment guide for `chillist-whatsapp-bot`.

> **Architecture spec:** [specs/whatsapp-chatbot-spec.md](../specs/whatsapp-chatbot-spec.md)

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+, TypeScript |
| Framework | Fastify 5 |
| AI SDK | Vercel AI SDK (`ai` package) |
| LLM Provider | TBD (Anthropic or OpenAI) |
| Session storage | Redis via Upstash |
| WhatsApp API | Green API (shared instance with app BE) |
| Hosting | Railway (same project as app BE) |

---

## Environment Variables

```
# Green API
GREEN_API_INSTANCE_ID=       # shared with app BE
GREEN_API_TOKEN=             # shared with app BE

# Internal API
APP_BE_INTERNAL_URL=         # e.g., app-be.railway.internal:3333
CHATBOT_SERVICE_KEY=         # shared secret for internal auth

# AI
AI_PROVIDER=                 # "anthropic" | "openai"
AI_API_KEY=                  # provider API key

# Session
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=

# Supabase (for phone lookup)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # admin access for user lookup
```

---

## Local Development

_TBD — will be filled in once the project is scaffolded._

---

## Deployment

- Deployed to Railway in the same project as the app backend
- Internal networking: chatbot reaches app BE via `http://chillist-api.railway.internal:<PORT>/api/internal/*`
- Has its own Dockerfile and deploy pipeline
- Can be deployed independently of the app BE

---

## What's Next

- [ ] Project scaffolding (package.json, tsconfig, Fastify setup)
- [ ] Green API webhook endpoint
- [ ] Session management with Upstash Redis
- [ ] AI SDK integration with tool definitions
- [ ] Internal API client for app BE communication
