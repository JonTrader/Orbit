CREATE OR REPLACE FUNCTION "public"."orbit_prevent_section_kind_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'Section kind is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'section_kind_immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "section_kind_immutable_trigger"
BEFORE UPDATE OF "kind" ON "section"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_prevent_section_kind_change"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."orbit_set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "user_updated_at_trigger"
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "session_updated_at_trigger"
BEFORE UPDATE ON "session"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "account_updated_at_trigger"
BEFORE UPDATE ON "account"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "verification_updated_at_trigger"
BEFORE UPDATE ON "verification"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "space_updated_at_trigger"
BEFORE UPDATE ON "space"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "space_member_updated_at_trigger"
BEFORE UPDATE ON "space_member"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "section_updated_at_trigger"
BEFORE UPDATE ON "section"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "task_updated_at_trigger"
BEFORE UPDATE ON "task"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "monthly_updated_at_trigger"
BEFORE UPDATE ON "monthly"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "note_updated_at_trigger"
BEFORE UPDATE ON "note"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "invite_updated_at_trigger"
BEFORE UPDATE ON "invite"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();--> statement-breakpoint
CREATE TRIGGER "notification_preference_updated_at_trigger"
BEFORE UPDATE ON "notification_preference"
FOR EACH ROW
EXECUTE FUNCTION "public"."orbit_set_updated_at"();
