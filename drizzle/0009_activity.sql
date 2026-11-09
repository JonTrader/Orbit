CREATE TYPE "public"."activity_action" AS ENUM('created', 'updated', 'completed', 'reopened', 'moved', 'assigned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."activity_entity_type" AS ENUM('task', 'monthly', 'note', 'section');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"actor_user_id" text,
	"entity_type" "activity_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "activity_action" NOT NULL,
	"period" date,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_space_created_idx" ON "activity" USING btree ("space_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "activity_entity_created_idx" ON "activity" USING btree ("entity_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);