# Dual API surface: Route Handlers plus Server Actions

Mutations and reads that mobile will need live behind `/api/v1` Route Handlers. Web UX uses Server Actions over the same domain services. The spec lists the flows that stay on the existing Server Actions and existing handlers; do not add a new REST route for those. Server-Actions-only for MVP was rejected because it forces a later mobile rewrite. Route-Handlers-only was rejected because it fights Next.js form-centric UI patterns.
