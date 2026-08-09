# Dual API surface: Route Handlers plus Server Actions

Mutations and reads that mobile will need live behind `/api/v1` Route Handlers. Web-only UX flows (quick-add, complete toggle, invite form revalidation) may use Server Actions. Both call the same domain services - no duplicated business logic. Server-Actions-only for MVP was rejected because it forces a later mobile rewrite; Route-Handlers-only was rejected because it fights Next.js form-centric UI patterns.
