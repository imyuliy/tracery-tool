import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PhaseWidget } from "./PhaseWidget";
import type { Project } from "@/lib/projects";

export function WorkspaceHeader({ project }: { project: Project }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-xs text-muted-foreground hover:bg-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <div className="h-5 w-px bg-border" />
        <div className="flex flex-col">
          <h1 className="font-display text-base font-semibold leading-tight text-ink">
            {project.name}
          </h1>
          <p className="font-sans text-[11px] leading-tight text-muted-foreground">
            {project.client ?? "—"}
            {project.perceel ? ` · ${project.perceel}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <PhaseWidget projectId={project.id} current={project.phase_state ?? "VO_fase_1"} />
      </div>
    </header>
  );
}
