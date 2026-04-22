// Sprint 4 — Tijdelijke trigger-route voor invoke-server-function.
//
// GET /api/public/smoketest-sprint4-trigger?trace_id=<uuid>
//
// Deze route leest SMOKETEST_SECRET server-side uit env en post intern naar
// /api/public/smoketest-sprint4. Geen externe header nodig.
//
// TODO(Sprint 5): VERWIJDER deze route compleet zodra smoke-test gedraaid is.
// Dit is een Sprint 4-only convenience-trigger en heeft geen plek in productie.
import { createFileRoute } from "@tanstack/react-router";

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

        let body: Record<string, unknown>;
        if (traceId) {
          body = { trace_id: traceId };
        } else if (seed && projectId) {
          body = { seed: true, project_id: projectId };
        } else {
          return Response.json(
            {
              error:
                "Geef ?trace_id=<uuid> OF ?seed=true&project_id=<uuid>",
            },
            { status: 400 },
          );
        }

        const target = `${url.origin}/api/public/smoketest-sprint4`;
        const res = await fetch(target, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-smoketest-secret": secret,
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: {
            "content-type":
              res.headers.get("content-type") ?? "application/json",
          },
        });
      },
    },
  },
});
