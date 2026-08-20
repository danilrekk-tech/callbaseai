import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/api-docs")({
  head: () => ({
    meta: [
      { title: "REST API — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Публичный API сервиса: создание звонков, поиск по базе знаний и AI-ответы по ключу.",
      },
      { property: "og:title", content: "REST API Sales Intelligence" },
      { property: "og:description", content: "Эндпоинты /api/public/v1 и управление API-ключами." },
    ],
  }),
  component: ApiPage,
});

const endpoints = [
  {
    method: "POST",
    path: "/api/public/v1/calls",
    body: `{
  "storage_path": "uuid-file.mp3",
  "file_name": "call.mp3",
  "manager_id": null,
  "client_name": "ООО Ромашка",
  "process": true
}`,
    text: "Регистрирует звонок по уже загруженному файлу и запускает пайплайн обработки.",
  },
  {
    method: "GET",
    path: "/api/public/v1/calls?limit=50&outcome=sale",
    text: "Список звонков с результатами анализа.",
  },
  {
    method: "GET",
    path: "/api/public/v1/calls/{id}",
    text: "Полный разбор звонка: транскрипт, профиль клиента, оценка менеджера.",
  },
  {
    method: "GET",
    path: "/api/public/v1/search?q=возражение+по+цене&limit=10",
    text: "Семантический поиск по базе знаний (pgvector).",
  },
  {
    method: "POST",
    path: "/api/public/v1/ask",
    body: `{ "question": "Почему клиенты уходят после презентации?" }`,
    text: "AI-ответ на основе базы знаний со ссылками на звонки.",
  },
  {
    method: "GET",
    path: "/api/public/v1/stats",
    text: "Агрегированные метрики: конверсия, возражения, паттерны.",
  },
];

function ApiPage() {
  const fetchKeys = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: () => fetchKeys() });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name } }),
    onSuccess: (result) => {
      setIssued(result.key);
      setName("");
      toast.success("Ключ создан — скопируйте его сейчас");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Ключ отозван");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="REST API"
        description="Все запросы требуют заголовок x-api-key с ключом, созданным ниже."
      />

      <div className="panel p-5">
        <h2 className="text-lg font-semibold">API-ключи</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              placeholder="Название интеграции"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            Создать ключ
          </Button>
        </div>
        {issued ? (
          <div className="mt-4 rounded-lg border border-accent/50 bg-accent/10 p-4 text-sm">
            <p className="font-medium">Скопируйте ключ — он больше не будет показан:</p>
            <code className="mt-2 block break-all font-mono text-xs">{issued}</code>
          </div>
        ) : null}

        {isLoading ? (
          <Skeleton className="mt-4 h-24" />
        ) : (
          <table className="mt-5 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Название</th>
                <th className="py-2">Префикс</th>
                <th className="py-2">Запросов</th>
                <th className="py-2">Последнее использование</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((key) => (
                <tr key={key.id as string} className="border-t border-border">
                  <td className="py-2">
                    {key.name as string}
                    {key.revoked ? (
                      <Badge variant="outline" className="ml-2 text-destructive">
                        отозван
                      </Badge>
                    ) : null}
                  </td>
                  <td className="py-2 font-mono text-xs">{key.key_prefix as string}…</td>
                  <td className="py-2">{key.request_count as number}</td>
                  <td className="py-2">
                    {key.last_used_at
                      ? new Date(key.last_used_at as string).toLocaleString("ru-RU")
                      : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {!key.revoked ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revokeMutation.mutate(key.id as string)}
                      >
                        Отозвать
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {endpoints.map((endpoint) => (
          <div key={endpoint.path} className="panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{endpoint.method}</Badge>
              <code className="font-mono text-sm">{endpoint.path}</code>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{endpoint.text}</p>
            {endpoint.body ? (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary p-4 text-xs">
                {endpoint.body}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
