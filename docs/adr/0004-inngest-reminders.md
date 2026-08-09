# Inngest runs MVP Reminder jobs

Reminder scanning and Resend sends run on Inngest (scheduled functions, step retries). Bare Vercel Cron was rejected for weak retries and less workflow control; heavier queue workers were deferred as ops cost for a serverless MVP. Domain Reminder logic stays in shared services so the runner can be swapped later.
