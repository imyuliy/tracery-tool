// De Tracémolen — Sprint 4.6 server-fn voor trek-part aggregatie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { runGenerateTrekPartDescriptions } from "./trek_part.helpers.server";

export const config = { maxDuration: 120 };

const generateSchema = z.object({
  trace_id: z.string().uuid(),
});

export const generateTrekPartDescriptions = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runGenerateTrekPartDescriptions({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });
