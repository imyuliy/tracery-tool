// De Tracémolen — Sprint 4.5 server-fns: per-segment scan + Brondocument v1 .docx
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import {
  runGenerateSegmentScanV1,
  runExportBrondocumentV1Docx,
} from "./scan.helpers.server";

export const config = { maxDuration: 300 };

const scanSchema = z.object({ trace_id: z.string().uuid() });

export const generateSegmentScanV1 = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => scanSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runGenerateSegmentScanV1({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });

const exportSchema = z.object({ trace_id: z.string().uuid() });

export const exportBrondocumentV1Docx = createServerFn({ method: "POST" })
  .middleware([withSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => exportSchema.parse(input))
  .handler(async ({ data, context }) => {
    return runExportBrondocumentV1Docx({
      supabase: context.supabase,
      traceId: data.trace_id,
      userId: context.userId,
    });
  });
