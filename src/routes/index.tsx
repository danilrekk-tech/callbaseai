import { createFileRoute, Link } from "@tanstack/react-router";
import { AudioLines, BrainCircuit, Database, LineChart, Users, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Intelligence Мегагруп — база знаний по звонкам" },
      {
        name: "description",
        content:
          "Превращаем записи звонков менеджеров Мегагруп в базу знаний: транскрибация Scribe v2, разбор клиента и менеджера, паттерны, возражения, семантический поиск.",
      },
      { property: "og:title", content: "Sales Intelligence Мегагруп" },
      {
        property: "og:description",
        content: "Записи звонков → транскрипт → анализ → база знаний → ответы AI со ссылками на звонки.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: AudioLines,
    title: "Транскрибация Scribe v2",
    text: "ElevenLabs распознаёт речь, язык, разделяет спикеров и ставит временные метки.",
  },
  {
    icon: BrainCircuit,
    title: "AI-разбор звонка",
    text: "Профиль клиента, оценка менеджера, этапы, причины продажи и потери, рекомендации.",
  },
  {
    icon: Database,
    title: "База знаний с pgvector",
    text: "Каждый звонок превращается в семантические фрагменты с эмбеддингами.",
  },
  {
    icon: Sparkles,
    title: "AI-поиск и ответы",
    text: "Задавайте вопросы отделу продаж — ответ приходит со ссылками на конкретные звонки.",
  },
  {
    icon: Users,
    title: "Менеджеры и паттерны",
    text: "Сильные и слабые стороны, повторяющиеся возражения и работающие сценарии.",
  },
  {
    icon: LineChart,
    title: "Дашборд и API",
    text: "Динамика конверсии плюс REST API для внешних систем и интеграций.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <section className="brand-gradient relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 text-primary-foreground">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Мегагруп</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            Sales Intelligence: звонки превращаются в знания
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-primary-foreground/80">
            Загрузите запись — сервис расшифрует диалог, разберёт клиента и менеджера, выделит
            возражения и паттерны, а затем добавит всё в единую базу знаний с семантическим поиском.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/dashboard">Открыть рабочее пространство</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Link to="/auth">Войти</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold">Что внутри</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="panel p-6">
              <feature.icon className="size-6 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold">Пайплайн обработки</h2>
          <ol className="mt-6 grid gap-4 text-sm md:grid-cols-5">
            {[
              "Загрузка аудио в защищённое хранилище",
              "Транскрибация ElevenLabs Scribe v2",
              "AI-анализ через OpenRouter с fallback",
              "Извлечение знаний и эмбеддинги",
              "Дашборды, поиск и REST API",
            ].map((step, index) => (
              <li key={step} className="panel p-5">
                <span className="text-2xl font-semibold text-accent">{index + 1}</span>
                <p className="mt-2 text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
