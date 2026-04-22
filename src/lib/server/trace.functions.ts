// De Tracémolen — Sprint 4 server-fns: BGT-segmentatie, tracé-omschrijving, .docx-export.
// Dunne wrappers rond de pure helpers in trace.helpers.server.ts. De helpers
// worden ook gedeeld met de smoke-test route (api.public.smoketest-sprint4.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import {
  runSegmentTraceByBgt,
  runGenerateTraceDescription,
  runExportTraceDescriptionDocx,
} from "./trace.helpers.server";

export const config = { maxDuration: 60 };

const segmentSchema = z.object({ trace_id: z.string().uuid() });

export const segmentTraceByBgt = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => segmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runSegmentTraceByBgt({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

const generateSchema = z.object({ trace_id: z.string().uuid() });

export const generateTraceDescription = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runGenerateTraceDescription({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

const exportSchema = z.object({
  trace_id: z.string().uuid(),
  section_id: z.string().uuid().optional(),
});

export const exportTraceDescriptionDocx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runExportTraceDescriptionDocx({
      supabase: context.supabase,
      traceId: data.trace_id,
      sectionId: data.section_id,
      userId: context.userId,
    });
  });
