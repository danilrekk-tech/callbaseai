import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui-kit";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createCallRecord, processCall } from "@/lib/calls.functions";
import { listManagers } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Загрузка звонков — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content:
          "Загрузите аудиозапись звонка: транскрибация Scribe v2, AI-анализ и пополнение базы знаний.",
      },
      { property: "og:title", content: "Загрузка звонков" },
      { property: "og:description", content: "Аудио → транскрипт → анализ → база знаний." },
    ],
  }),
  component: UploadPage,
});

type QueueItem = {
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  message?: string;
  callId?: string;
};

function UploadPage() {
  const navigate = useNavigate();
  const fetchManagers = useServerFn(listManagers);
  const createCall = useServerFn(createCallRecord);
  const runPipeline = useServerFn(processCall);

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: () => fetchManagers(),
  });

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [managerId, setManagerId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [callDate, setCallDate] = useState("");
  const [busy, setBusy] = useState(false);

  const updateItem = (index: number, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const start = async () => {
    if (queue.length === 0) {
      toast.error("Выберите аудиофайлы");
      return;
    }
    setBusy(true);
    for (let index = 0; index < queue.length; index++) {
      const item = queue[index];
      if (!item || item.status === "done") continue;
      try {
        updateItem(index, { status: "uploading", message: "Загрузка в хранилище…" });
        const path = `${crypto.randomUUID()}-${item.file.name.replace(/[^\w.\-]+/g, "_")}`;
        const upload = await supabase.storage
          .from("call-audio")
          .upload(path, item.file, { contentType: item.file.type || "audio/mpeg" });
        if (upload.error) throw new Error(upload.error.message);

        const { id } = await createCall({
          data: {
            fileName: item.file.name,
            storagePath: path,
            mimeType: item.file.type || null,
            fileSize: item.file.size,
            managerId: managerId || null,
            clientName: clientName || null,
            clientCompany: clientCompany || null,
            callDate: callDate ? new Date(callDate).toISOString() : null,
          },
        });
        updateItem(index, {
          status: "processing",
          callId: id,
          message: "Транскрибация и AI-анализ…",
        });
        const result = await runPipeline({ data: { id } });
        updateItem(index, {
          status: "done",
          message: `Готово · ${result.outcome ?? "результат не определён"}`,
        });
      } catch (error) {
        updateItem(index, {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    setBusy(false);
    toast.success("Обработка очереди завершена");
  };

  const progress =
    queue.length === 0
      ? 0
      : (queue.filter((item) => item.status === "done" || item.status === "error").length /
          queue.length) *
        100;

  return (
    <div>
      <PageHeader
        title="Загрузка звонков"
        description="Аудио → ElevenLabs Scribe v2 → AI-анализ → база знаний с эмбеддингами."
        actions={
          <Button variant="outline" onClick={() => navigate({ to: "/calls" })}>
            К списку звонков
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-accent">
            <UploadCloud className="size-8 text-accent" />
            <span className="font-medium">Выберите аудиофайлы</span>
            <span className="text-xs text-muted-foreground">
              mp3, wav, m4a, ogg — можно несколько файлов сразу
            </span>
            <input
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={(event) =>
                setQueue(
                  Array.from(event.target.files ?? []).map((file) => ({
                    file,
                    status: "pending" as const,
                  })),
                )
              }
            />
          </label>

          {queue.length > 0 ? (
            <div className="mt-5 space-y-3">
              <Progress value={progress} />
              {queue.map((item, index) => (
                <div
                  key={`${item.file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / 1024 / 1024).toFixed(1)} МБ
                      {item.message ? ` · ${item.message}` : ""}
                    </p>
                  </div>
                  {item.status === "uploading" || item.status === "processing" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
                  ) : item.status === "done" ? (
                    <span className="text-success">готово</span>
                  ) : item.status === "error" ? (
                    <span className="text-destructive">ошибка</span>
                  ) : (
                    <span className="text-muted-foreground">в очереди</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <Button className="mt-6 w-full" onClick={start} disabled={busy || queue.length === 0}>
            {busy ? "Обработка…" : "Загрузить и обработать"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            Обработка длинных записей занимает несколько минут: транскрибация, анализ и построение
            эмбеддингов выполняются на сервере.
          </p>
        </div>

        <div className="panel h-fit p-6">
          <h2 className="text-lg font-semibold">Метаданные звонка</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Менеджер</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Не указан" />
                </SelectTrigger>
                <SelectContent>
                  {(managers ?? []).map((manager) => (
                    <SelectItem key={manager.id as string} value={manager.id as string}>
                      {manager.full_name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Клиент</Label>
              <Input id="client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Компания клиента</Label>
              <Input
                id="company"
                value={clientCompany}
                onChange={(e) => setClientCompany(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Дата звонка</Label>
              <Input
                id="date"
                type="datetime-local"
                value={callDate}
                onChange={(e) => setCallDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
