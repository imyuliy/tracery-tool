// Sprint 4 — UI voor smoke-test runner met retry + detailed error log.
//
// TODO(Sprint 5): VERWIJDER deze route compleet samen met de andere smoketest-bestanden.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/smoketest")({
  component: SmoketestPage,
});

type SmokeResult = {
  success: boolean;
  trace_id?: string;
  seeded?: boolean;
  steps?: Record<string, any>;
  asserts?: Record<string, any>;
  timings_ms?: Record<string, number>;
  error?: { message: string; stack?: string };
};

function SmoketestPage() {
  const [traceId, setTraceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [mode, setMode] = useState<"trace" | "seed">("trace");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmokeResult | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastRunRef = useRef<{ url: string } | null>(null);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (mode === "trace" && traceId) params.set("trace_id", traceId);
    if (mode === "seed" && projectId) {
      params.set("seed", "true");
      params.set("project_id", projectId);
    }
    return `/api/public/smoketest-sprint4-trigger?${params.toString()}`;
  }, [mode, traceId, projectId]);

  const run = useCallback(
    async (url?: string) => {
      const target = url ?? buildUrl();
      lastRunRef.current = { url: target };
      setLoading(true);
      setFetchError(null);
      setResult(null);
      setHttpStatus(null);
      try {
        const res = await fetch(target);
        setHttpStatus(res.status);
        const json = (await res.json()) as SmokeResult;
        setResult(json);
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [buildUrl],
  );

  const retry = useCallback(() => {
    if (lastRunRef.current) void run(lastRunRef.current.url);
  }, [run]);

  const featuresFetched = useMemo(
    () => result?.steps?.segment?.features_fetched ?? null,
    [result],
  );
  const zeroFeatures = featuresFetched === 0;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Smoke-test Sprint 4</h1>
        <p className="text-muted-foreground text-sm">
          Trigger de end-to-end pipeline en bekijk gedetailleerde uitvoer.
          Tijdelijke route — verwijderen in Sprint 5.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Run configuratie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "trace" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("trace")}
            >
              Bestaande trace_id
            </Button>
            <Button
              variant={mode === "seed" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("seed")}
            >
              Seed nieuwe trace
            </Button>
          </div>

          {mode === "trace" ? (
            <div className="space-y-2">
              <Label htmlFor="trace">trace_id (UUID)</Label>
              <Input
                id="trace"
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="project">project_id (UUID)</Label>
              <Input
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => run()}
              disabled={
                loading ||
                (mode === "trace" ? !traceId : !projectId)
              }
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Run smoke-test
            </Button>
            <Button
              variant="outline"
              onClick={retry}
              disabled={loading || !lastRunRef.current}
            >
              <RefreshCw />
              Retry last run
            </Button>
          </div>
        </CardContent>
      </Card>

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Netwerkfout</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      {result && (
        <>
          <div className="flex items-center gap-3">
            <Badge variant={result.success ? "default" : "destructive"}>
              {result.success ? "SUCCESS" : "FAILED"}
            </Badge>
            {httpStatus && (
              <Badge variant="outline">HTTP {httpStatus}</Badge>
            )}
            {result.trace_id && (
              <code className="text-muted-foreground text-xs">
                trace_id: {result.trace_id}
              </code>
            )}
          </div>

          {zeroFeatures && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>PDOK retourneerde 0 features</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  De BGT OGC API leverde geen features voor deze trace. Mogelijke oorzaken:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>Trace-geometrie ligt buiten Nederland of buiten BGT-dekking</li>
                  <li>Bbox is verkeerd geprojecteerd (verwacht EPSG:28992)</li>
                  <li>PDOK endpoint of collection-id is gewijzigd</li>
                  <li>Rate-limiting of tijdelijke storing bij api.pdok.nl</li>
                </ul>
                <details className="mt-2">
                  <summary className="text-foreground cursor-pointer text-sm font-medium">
                    Detailed error log (segment step)
                  </summary>
                  <pre className="bg-muted mt-2 max-h-96 overflow-auto rounded p-3 text-xs">
{JSON.stringify(result.steps?.segment ?? {}, null, 2)}
                  </pre>
                </details>
                {result.error && (
                  <details>
                    <summary className="text-foreground cursor-pointer text-sm font-medium">
                      Server error
                    </summary>
                    <pre className="bg-muted mt-2 max-h-96 overflow-auto rounded p-3 text-xs">
{result.error.message}
{result.error.stack ? "\n\n" + result.error.stack : ""}
                    </pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result.error && !zeroFeatures && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Server error</AlertTitle>
              <AlertDescription>
                <pre className="bg-muted mt-2 max-h-96 overflow-auto rounded p-3 text-xs">
{result.error.message}
{result.error.stack ? "\n\n" + result.error.stack : ""}
                </pre>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Volledige response</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted max-h-[600px] overflow-auto rounded p-3 text-xs">
{JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
