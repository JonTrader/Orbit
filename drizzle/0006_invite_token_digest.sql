ALTER TABLE "invite" RENAME COLUMN "token" TO "token_digest";--> statement-breakpoint
ALTER TABLE "invite" RENAME CONSTRAINT "invite_token_unique" TO "invite_token_digest_unique";
