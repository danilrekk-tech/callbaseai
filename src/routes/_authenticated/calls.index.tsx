import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, OutcomeBadge, PageHeader, StatusBadge } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteCall, listCalls, processCall } from "@/lib/calls.functions";
import { listManagers } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/calls/")({
  head: () => ({
    meta: [
      { title: "Звонки — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Список обработанных звонков с фильтрами по менеджеру, результату и статусу.",
      },
      { property: "og:title", content: "Звонки отдела продаж" },
      { property: "og:description", content: "Фильтры, статусы обработки и переход к разбору звонка." },
    ],
  }),
  component: CallsPage,
});

const ANY = "any";

function CallsPage() {
  const fetchCalls = useServerFn(listCalls);
  const fetchManagers = useServerFn(listManagers);
  const reprocess = useServerFn(processCall);
  const removeCall = useServerFn(deleteCall);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [managerId, setManagerId] = useState(ANY);
  const [outcome, setOutcome] = useState(ANY);
  const [status, setStatus] = useState(ANY);

  const filters = {
    search: search || undefined,
    managerId: managerId === ANY ? undefined : managerId,
    outcome: outcome === ANY ? undefined : outcome,
    status: status === ANY ? undefined : status,
    limit: 100,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["calls", filters],
    queryFn: () => fetchCalls({ data: filters }),
  });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: () => fetchManagers() });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => reprocess({ data: { id } }),
    onSuccess: () => {
      toast.success("Звонок переобработан");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeCall({ data: { id } }),
    onSuccess: () => {
      toast.success("Звонок удалён");
      queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Звонки"
        description={`Найдено: ${data?.count ?? 0}`}
        actions={
          <Button asChild>
            <Link to="/upload">Загрузить звонок</Link>
          </Button>
        }
      />

      <div className="panel mb-6 grid gap-3 p-4 md:grid-cols-4">
        <Input
          placeholder="Поиск: клиент, компания, файл…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger>
            <SelectValue placeholder="Менеджер" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Все менеджеры</SelectItem>
            {(managers ?? []).map((manager) => (
              <SelectItem key={manager.id as string} value={manager.id as string}>
                {manager.full_name as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger>
            <SelectValue placeholder="Результат" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Любой результат</SelectItem>
            <SelectItem value="sale">Продажа</SelectItem>
            <SelectItem value="loss">Отказ</SelectItem>
            <SelectItem value="in_progress">В процессе</SelectItem>
            <SelectItem value="unknown">Не определён</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Любой статус</SelectItem>
            <SelectItem value="uploaded">Загружен</SelectItem>
            <SelectItem value="transcribing">Транскрибация</SelectItem>
            <SelectItem value="analyzing">Анализ</SelectItem>
            <SelectItem value="indexing">Индексация</SelectItem>
            <SelectItem value="completed">Готов</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="Звонков пока нет"
          description="Загрузите первую запись, чтобы система начала собирать базу знаний."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Менеджер</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Длительность</th>
                <th className="px-4 py-3">Результат</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((call) => (
                <tr key={call.id as string} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <Link
                      to="/calls/$callId"
                      params={{ callId: call.id as string }}
                      className="font-medium hover:text-accent"
                    >
                      {(call.client_name as string) || (call.file_name as string)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {(call.client_company as string) || (call.client_type as string) || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {(call.managers as { full_name?: string } | null)?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(call.call_date as string).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-4 py-3">
                    {call.duration_seconds
                      ? `${Math.round(Number(call.duration_seconds) / 60)} мин`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeBadge outcome={call.outcome as string} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={call.status as string} />
                    {call.error_message ? (
                      <p className="mt-1 max-w-[220px] text-xs text-destructive">
                        {call.error_message as string}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Переобработать"
                        disabled={reprocessMutation.isPending}
                        onClick={() => reprocessMutation.mutate(call.id as string)}
                      >
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Удалить"
                        onClick={() => deleteMutation.mutate(call.id as string)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
