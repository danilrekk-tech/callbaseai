import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LabeledList, PageHeader } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { listManagers, upsertManager } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/managers")({
  head: () => ({
    meta: [
      { title: "Менеджеры — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Профили менеджеров: конверсия, эмпатия, экспертность, типичные ошибки и сильные стороны.",
      },
      { property: "og:title", content: "Менеджеры отдела продаж" },
      { property: "og:description", content: "Сравнение качества работы менеджеров по звонкам." },
    ],
  }),
  component: ManagersPage,
});

function ManagersPage() {
  const fetchManagers = useServerFn(listManagers);
  const saveManager = useServerFn(upsertManager);
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });

  const create = useMutation({
    mutationFn: () =>
      saveManager({ data: { full_name: fullName, email: email || null, department: department || null } }),
    onSuccess: () => {
      toast.success("Менеджер сохранён");
      setFullName("");
      setEmail("");
      setDepartment("");
      queryClient.invalidateQueries({ queryKey: ["managers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader title="Менеджеры" description="Оценки формируются из AI-разбора звонков." />

      <div className="panel mb-6 grid items-end gap-3 p-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="name">Имя</Label>
          <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dept">Отдел</Label>
          <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <Button onClick={() => create.mutate()} disabled={!fullName || create.isPending}>
          Добавить менеджера
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Менеджеров пока нет" description="Добавьте первого менеджера выше." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((manager) => (
            <div key={manager.id as string} className="panel space-y-4 p-5">
              <div>
                <p className="font-display text-lg font-semibold">{manager.full_name as string}</p>
                <p className="text-xs text-muted-foreground">
                  {(manager.department as string) || "отдел не указан"} ·{" "}
                  {(manager.email as string) || "без e-mail"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Metric label="Звонки" value={manager.calls} />
                <Metric label="Конверсия" value={`${Math.round(manager.conversion * 100)}%`} />
                <Metric label="Итоговая оценка" value={fmt(manager.overall)} />
                <Metric label="Эмпатия" value={fmt(manager.empathy)} />
                <Metric label="Экспертность" value={fmt(manager.expertise)} />
                <Metric label="Давление" value={fmt(manager.pressure)} />
              </div>
              <LabeledList
                title="Частые ошибки"
                items={manager.mistakes.map((item) => `${item.text} (${item.count})`)}
              />
              <LabeledList
                title="Сильные стороны"
                items={manager.strengths.map((item) => `${item.text} (${item.count})`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
