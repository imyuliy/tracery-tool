// Sprint 4 — End-to-end smoke-test endpoint.
//
// POST /api/public/smoketest-sprint4
// Header: x-smoketest-secret: <SMOKETEST_SECRET env-var>
// Body: { "trace_id": "uuid" }  OF  { "seed": true, "project_id": "uuid" }
//
// SECURITY: deze route is ALLEEN bedoeld voor smoke-tests.
//
// TODO(Sprint 5): remove smoketest bypass, replace with user-JWT auth.
// Productie server-fns in trace.functions.ts behouden requireSupabaseAuth —
// die middleware wordt NIET vervangen door deze secret. Deze route hergebruikt
// alleen de helpers in trace.helpers.server.ts via smoketest-sprint4.server.ts.
import { createFileRoute } from "@tanstack/react-router";
import {
  runSmoketestSprint4,
  type SmokeRequest,
} from "@/lib/server/smoketest-sprint4.server";

export const Route = createFileRoute("/api/public/smoketest-sprint4")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-smoketest-secret");
        const expected = process.env.SMOKETEST_SECRET;
        if (!expected) {
          return Response.json(
            { success: false, error: "SMOKETEST_SECRET niet geconfigureerd" },
            { status: 500 },
          );
        }
        if (!secret || secret !== expected) {
          return Response.json(
            { success: false, error: "Invalid smoketest secret" },
            { status: 401 },
          );
        }

        let body: SmokeRequest;
        try {
          body = (await request.json()) as SmokeRequest;
        } catch {
          return Response.json(
            { success: false, error: "Invalid JSON body" },
            { status: 400 },
          );
        }

        const result = await runSmoketestSprint4(body);
        return Response.json(result, { status: result.success ? 200 : 500 });
      },
    },
  },
});
