import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  addAiProvider,
  listAiProviders,
  listJobs,
  testConnections,
  updateAiProvider,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({
    meta: [
      { title: "Интеграции AI — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content:
          "Настройка провайдеров: ElevenLabs Scribe v2, OpenRouter, эмбеддинги, приоритеты и fallback.",
      },
      { property: "og:title", content: "Интеграции AI-провайдеров" },
      { property: "og:description", content: "Проверка соединения и порядок резервных моделей." },
    ],
  }),
  component: IntegrationsPage,
});

const kindLabels: Record<string, string> = {
  transcription: "Транскрибация",
  analysis: "Анализ",
  embedding: "Эмбеддинги",
};

function IntegrationsPage() {
  const fetchProviders = useServerFn(listAiProviders);
  const fetchJobs = useServerFn(listJobs);
  const update = useServerFn(updateAiProvider);
  const add = useServerFn(addAiProvider);
  const test = useServerFn(testConnections);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => fetchProviders(),
  });
  const { data: jobs } = useQuery({ queryKey: ["ai-jobs"], queryFn: () => fetchJobs() });

  const [form, setForm] = useState({
    name: "",
    kind: "analysis" as "analysis" | "embedding" | "transcription",
    base_url: "https://openrouter.ai/api/v1",
    model: "",
    secret_name: "OPENROUTER_API_KEY",
    priority: 60,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; enabled?: boolean; priority?: number; model?: string }) =>
      update({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-providers"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const addMutation = useMutation({
    mutationFn: () => add({ data: form }),
    onSuccess: () => {
      toast.success("Провайдер добавлен");
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: (kind: "transcription" | "analysis" | "embedding") => test({ data: { kind } }),
    onSuccess: (result) =>
      result.ok ? toast.success(result.message) : toast.error(result.message),
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;

  const grouped = ["transcription", "analysis", "embedding"].map((kind) => ({
    kind,
    providers: data.providers.filter((provider) => provider.kind === kind),
  }));

  return (
    <div>
      <PageHeader
        title="Интеграции"
        description="Ключи хранятся только на сервере в защищённых секретах. Fallback идёт по возрастанию приоритета."
        actions={
          <>
            <Button variant="outline" onClick={() => testMutation.mutate("transcription")}>
              Проверить ElevenLabs
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate("analysis")}>
              Проверить анализ
            </Button>
            <Button variant="outline" onClick={() => testMutation.mutate("embedding")}>
              Проверить эмбеддинги
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {grouped.map((group) => (
          <div key={group.kind} className="panel p-5">
            <h2 className="text-lg font-semibold">{kindLabels[group.kind]}</h2>
            <div className="mt-4 space-y-3">
              {group.providers.map((provider) => (
                <div
                  key={provider.id as string}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{provider.name as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {(provider.model as string) ?? "модель по умолчанию"} ·{" "}
                      {(provider.base_url as string) ?? "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {provider.secret_name ? (
                        data.configured[provider.secret_name as string] ? (
                          <Badge variant="outline" className="border-transparent bg-success/15 text-success">
                            <CheckCircle2 className="mr-1 size-3" /> ключ задан
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-destructive/15 text-destructive"
                          >
                            <XCircle className="mr-1 size-3" /> ключ отсутствует
                          </Badge>
                        )
                      ) : null}
                      <Badge variant="secondary">статус: {provider.status as string}</Badge>
                      <span className="text-muted-foreground">
                        запросов {provider.request_count as number} · ошибок{" "}
                        {provider.error_count as number}
                      </span>
                    </div>
                    {provider.last_error ? (
                      <p className="mt-1 max-w-xl text-xs text-destructive">
                        {provider.last_error as string}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-20">
                      <Label className="text-xs text-muted-foreground">Приоритет</Label>
                      <Input
                        type="number"
                        defaultValue={provider.priority as number}
                        onBlur={(event) =>
                          updateMutation.mutate({
                            id: provider.id as string,
                            priority: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="w-52">
                      <Label className="text-xs text-muted-foreground">Модель</Label>
                      <Input
                        defaultValue={(provider.model as string) ?? ""}
                        onBlur={(event) =>
                          updateMutation.mutate({
                            id: provider.id as string,
                            model: event.target.value,
                          })
                        }
                      />
                    </div>
                    <Switch
                      checked={provider.enabled as boolean}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({ id: provider.id as string, enabled: checked })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="text-lg font-semibold">Добавить провайдера</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Любой OpenAI-совместимый провайдер. Ключ должен быть заранее добавлен в секреты проекта — в
          коде он никогда не хранится.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Тип</Label>
            <Select
              value={form.kind}
              onValueChange={(value) =>
                setForm({ ...form, kind: value as "analysis" | "embedding" | "transcription" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="analysis">Анализ</SelectItem>
                <SelectItem value="embedding">Эмбеддинги</SelectItem>
                <SelectItem value="transcription">Транскрибация</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Модель</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Имя секрета</Label>
            <Input
              value={form.secret_name}
              onChange={(e) => setForm({ ...form, secret_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Приоритет</Label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button
          className="mt-4"
          onClick={() => addMutation.mutate()}
          disabled={!form.name || !form.model || addMutation.isPending}
        >
          Добавить
        </Button>
      </div>

      <div className="panel mt-6 overflow-x-auto p-5">
        <h2 className="text-lg font-semibold">Журнал обработки</h2>
        <table className="mt-3 w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2">Звонок</th>
              <th className="py-2">Этап</th>
              <th className="py-2">Статус</th>
              <th className="py-2">Провайдер</th>
              <th className="py-2">Время</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((job) => (
              <tr key={job.id as string} className="border-t border-border">
                <td className="py-2">
                  {(job.calls as { client_name?: string; file_name?: string } | null)?.client_name ??
                    (job.calls as { file_name?: string } | null)?.file_name ??
                    "—"}
                </td>
                <td className="py-2">{job.stage as string}</td>
                <td className="py-2">{job.status as string}</td>
                <td className="py-2">{(job.provider as string) ?? "—"}</td>
                <td className="py-2">
                  {new Date(job.started_at as string).toLocaleString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
