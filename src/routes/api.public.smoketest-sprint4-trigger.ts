// Sprint 4 — Tijdelijke trigger-route voor invoke-server-function.
//
// GET /api/public/smoketest-sprint4-trigger?trace_id=<uuid>
//
// Roept de smoke-test handler DIRECT aan (geen interne fetch — dat loopt
// in een Cloudflare Worker subrequest-loop). Verifieert SMOKETEST_SECRET
// server-side via env, geen client header nodig.
//
// TODO(Sprint 5): VERWIJDER deze route compleet.
import { createFileRoute } from "@tanstack/react-router";
import { runSmoketestSprint4 } from "@/lib/server/smoketest-sprint4.server";

export const Route = createFileRoute("/api/public/smoketest-sprint4-trigger")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.SMOKETEST_SECRET;
        if (!secret) {
          return Response.json(
            { error: "SMOKETEST_SECRET niet geconfigureerd" },
            { status: 500 },
          );
        }
        const url = new URL(request.url);
        const traceId = url.searchParams.get("trace_id");
        const projectId = url.searchParams.get("project_id");
        const seed = url.searchParams.get("seed") === "true";

        let payload: { trace_id?: string; seed?: boolean; project_id?: string };
        if (traceId) {
          payload = { trace_id: traceId };
        } else if (seed && projectId) {
          payload = { seed: true, project_id: projectId };
        } else {
          return Response.json(
            { error: "Geef ?trace_id=<uuid> OF ?seed=true&project_id=<uuid>" },
            { status: 400 },
          );
        }

        const result = await runSmoketestSprint4(payload);
        return Response.json(result, {
          status: result.success ? 200 : 500,
        });
      },
    },
  },
});
