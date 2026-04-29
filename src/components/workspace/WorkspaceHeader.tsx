import { ArrowLeft, Cog } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PhaseWidget } from "./PhaseWidget";
import type { Project } from "@/lib/projects";

export function WorkspaceHeader({ project }: { project: Project }) {
  return (
    <header className="glass-strong flex h-[60px] shrink-0 items-center justify-between px-5">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-xs text-ink/60 transition-colors hover:bg-blood/8 hover:text-blood"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Dashboard
        </Link>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blood text-paper shadow-[0_0_16px_-4px_oklch(0.58_0.22_24/0.6)]">
            <Cog className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h1 className="font-display text-base font-semibold leading-tight tracking-tight text-ink">
              {project.name}
            </h1>
            <p className="font-mono text-[10px] uppercase leading-tight tracking-widest text-ink/50">
              {project.client ?? "—"}
              {project.perceel ? ` · ${project.perceel}` : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <PhaseWidget projectId={project.id} current={project.phase_state ?? "VO_fase_1"} />
      </div>
    </header>
  );
}
