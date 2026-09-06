import { createFileRoute, Link } from "@tanstack/react-router";
import { AudioLines, BrainCircuit, Database, LineChart, Users, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import heroImage from "@/assets/sales-intelligence-hero.jpg";

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
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold tracking-tight">
            Мегагруп <span className="text-primary">Sales Intelligence</span>
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Войти</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/dashboard">Рабочее пространство</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            База знаний отдела продаж
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
            Звонки менеджеров превращаются в знания о клиентах и сделках
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Каждая запись расшифровывается, разбирается по клиенту и менеджеру, а выводы попадают в
            единую базу. Вы спрашиваете обычными словами — сервис отвечает и показывает, из каких
            звонков взят ответ.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full">
              <Link to="/upload">Загрузить звонок</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/search">Спросить базу знаний</Link>
            </Button>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-4 text-sm">
            {[
              ["Один звонок", "10+ выводов"],
              ["Ответы AI", "со ссылками"],
              ["Паттерн", "от 3 звонков"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-display text-lg font-bold text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <img
          src={heroImage}
          alt="Аналитика звонков отдела продаж Мегагруп"
          className="w-full rounded-3xl border border-border shadow-panel"
          loading="lazy"
        />
      </section>

      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold">Зачем это отделу продаж</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Понимать, почему покупают",
                text: "Причины продаж и отказов собираются по всем звонкам, а не остаются в памяти одного менеджера.",
              },
              {
                title: "Учить на реальных диалогах",
                text: "Видно, какие формулировки работают, где менеджер давит, а где теряет клиента.",
              },
              {
                title: "Не терять возражения",
                text: "Возражения накапливаются вместе с лучшими ответами — новый сотрудник входит в работу быстрее.",
              },
            ].map((item) => (
              <div key={item.title} className="panel p-6">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
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
