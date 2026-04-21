import { Card } from "@/components/ui/card";
import { useAuditLog } from "@/lib/project-detail";
import { formatRelativeDate, type Project } from "@/lib/projects";

export function OverviewTab({ project }: { project: Project }) {
  const { data: audit } = useAuditLog(project.id);

  const rows: Array<[string, React.ReactNode]> = [
    ["Naam", project.name],
    ["Opdrachtgever", project.client ?? "—"],
    ["Perceel", project.perceel ?? "—"],
    ["BTO-referentie", project.bto_reference ?? "—"],
    ["Status", project.status ?? "draft"],
    [
      "Budget-plafond",
      project.budget_plafond_eur
        ? `€ ${Number(project.budget_plafond_eur).toLocaleString("nl-NL")}`
        : "—",
    ],
    [
      "Planning-plafond",
      project.planning_plafond_weken
        ? `${project.planning_plafond_weken} weken`
        : "—",
    ],
    ["Aangemaakt", formatRelativeDate(project.created_at)],
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="border-border bg-card p-6 lg:col-span-2">
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">
          Project-metadata
        </h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
                {k}
              </dt>
              <dd className="mt-0.5 font-sans text-sm text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {project.description && (
          <div className="mt-5 border-t border-border pt-4">
            <dt className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
              Beschrijving
            </dt>
            <dd className="mt-1 font-sans text-sm text-ink">
              {project.description}
            </dd>
          </div>
        )}
      </Card>

      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">
          Activity
        </h3>
        {!audit || audit.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">
            Nog geen activiteit. Audit-log vult zich automatisch zodra de
            backend draait.
          </p>
        ) : (
          <ul className="space-y-3">
            {audit.map((a) => (
              <li key={a.id} className="border-l-2 border-border pl-3">
                <p className="font-sans text-sm text-ink">{a.action}</p>
                <p className="font-sans text-xs text-muted-foreground">
                  {formatRelativeDate(a.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
