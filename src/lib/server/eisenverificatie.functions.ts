// De Tracémolen — Sprint 5.2 server-fns voor eisenverificatie + DOCX-export.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { runEisVerification } from "./eisenverificatie.helpers.server";
import { runExportEisenverificatieDocx } from "./eisenverificatie_export.helpers.server";

export const config = { maxDuration: 300 };

const traceSchema = z.object({ trace_id: z.string().uuid() });

export const runEisenverificatie = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => traceSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runEisVerification({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

export const exportEisenverificatieDocx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => traceSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runExportEisenverificatieDocx({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });
