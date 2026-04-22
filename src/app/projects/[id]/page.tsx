import { ProjectList } from "@/components/projects/project-list";
import { ProjectDetail } from "@/components/projects/project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-[360px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <ProjectList />
      </aside>
      <section className="flex-1 min-w-0 overflow-y-auto">
        <ProjectDetail projectId={id} />
      </section>
    </div>
  );
}
