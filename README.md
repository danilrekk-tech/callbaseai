# Sales AI Insights

Создай полноценный MVP веб-сервиса Sales Intelligence для компании Мегагруп.

Цель продукта — превратить записи звонков менеджеров в постоянно пополняемую базу знаний о клиентах, менеджерах, причинах продаж и отказов, возражениях, поведенческих паттернах и эффективных сценариях общения.

Используй Supabase как backend: PostgreSQL, Storage, Auth, Edge Functions и pgvector.

АРХИТЕКТУРА AI:

Сделай отдельный AI Processing Layer, чтобы провайдеры AI можно было менять без изменения основной логики приложения.

TRANSCRIPTION PROVIDER:

Основной провайдер транскрибации — ElevenLabs Speech-to-Text / Scribe v2.

После загрузки аудио:

audio → Supabase Storage → ElevenLabs STT → transcript → AI analysis → knowledge extraction → embeddings → database.

Используй ElevenLabs Scribe v2 для:

- транскрибации;

- определения языка;

- speaker diarization;

- временных меток;

- разделения участников разговора;

- сохранения исходной транскрипции.

API key ElevenLabs хранить только на серверной стороне через Supabase Secrets. Никогда не помещать ключ во frontend.

Создай настройки интеграций, где администратор может указать ElevenLabs API key и проверить соединение.

AI ANALYSIS PROVIDERS:

Создай абстракцию AI Provider.

Основной вариант для MVP — OpenRouter с бесплатными моделями через openrouter/free.

Добавь возможность выбирать AI provider и model:

- OpenRouter Free;

- конкретная бесплатная модель OpenRouter;

- другие OpenAI-compatible providers в будущем.

API keys должны храниться только в Supabase Secrets.

Не зашивай API keys в код.

Создай автоматический fallback:

если основной AI provider недоступен или превышен лимит — использовать следующий доступный provider/model.

Если бесплатный provider требует API key, показывай это в настройках и не пытайся обходить авторизацию или лимиты провайдера.

Основной сценарий:

1. Пользователь загружает аудиозапись звонка.

2. Файл сохраняется в Supabase Storage.

3. Создаётся запись звонка со статусом "uploaded".

4. Edge Function отправляет аудио в ElevenLabs.

5. После получения транскрипции сохраняются текст, speakers, timestamps и metadata.

6. Звонок получает статус "transcribed".

7. AI Provider анализирует транскрипцию.

8. Сохраняется структурированный AI-анализ.

9. Из анализа извлекаются знания.

10. Создаются embeddings.

11. Знания сохраняются в pgvector.

12. Звонок получает статус "completed".

Статусы:

uploaded

processing

transcribing

transcribed

analyzing

completed

failed

При ошибке сохраняй понятную причину ошибки и возможность повторной обработки.

AI должен извлекать:

КЛИЕНТ:

- тип клиента;

- потребность;

- мотивация;

- боли;

- критерии выбора;

- бюджет/чувствительность к цене;

- уровень заинтересованности;

- возражения;

- страхи;

- стиль общения;

- сигналы покупки;

- сигналы отказа.

МЕНЕДЖЕР:

- структура разговора;

- выявление потребности;

- задаваемые вопросы;

- качество презентации;

- работа с возражениями;

- аргументация;

- эмпатия;

- экспертность;

- давление;

- ошибки;

- пропущенные возможности;

- удачные действия;

- неудачные действия.

ЗВОНОК:

- этапы разговора;

- ключевые моменты;

- причины продажи;

- причины потери;

- переломный момент;

- эффективные формулировки;

- неэффективные формулировки;

- рекомендации.

Разделяй факты, непосредственно присутствующие в транскрипции, и AI-интерпретации.

Создай разделы:

Dashboard

Calls

Upload

Managers

Patterns

Objections

Knowledge Base

AI Search

Integrations

API

Dashboard:

- количество звонков;

- продажи;

- потери;

- конверсия;

- динамика;

- основные возражения;

- причины потерь;

- лучшие менеджеры;

- обнаруженные паттерны.

Calls:

- поиск;

- фильтры;

- менеджер;

- дата;

- результат;

- статус обработки;

- тип клиента;

- подробная карточка звонка;

- аудио;

- транскрипция;

- speaker diarization;

- AI-анализ;

- связанные паттерны;

- связанные возражения.

Patterns:

Автоматически выявляемые закономерности по всей базе.

Каждый pattern:

- название;

- описание;

- количество подтверждений;

- успешность;

- связь с результатом;

- confidence;

- примеры звонков.

Knowledge Base:

Единая семантическая база знаний с pgvector.

AI Search:

Пользователь задаёт вопросы естественным языком.

Примеры:

"Как работать с клиентом, который говорит дорого?"

"Какие ошибки чаще всего приводят к потере клиента?"

"Какие менеджеры лучше работают с возражением дорого?"

"Покажи успешные звонки с похожими клиентами."

"Какие аргументы чаще всего приводят к продаже?"

Ответы должны формироваться через retrieval из базы знаний и содержать ссылки на конкретные звонки.

API:

POST /api/calls

GET /api/calls

GET /api/calls/{id}

GET /api/search

POST /api/ask

GET /api/managers

GET /api/patterns

GET /api/objections

Создай API Keys и документацию.

Структура БД минимум:

calls

managers

client_profiles

transcripts

transcript_segments

objections

patterns

insights

knowledge_chunks

embeddings

ai_processing_jobs

ai_providers

api_keys

Создай Integration Settings:

- ElevenLabs;

- OpenRouter;

- AI provider;

- model;

- connection status;

- last successful request;

- usage/errors.

Сделай систему готовой к подключению новых AI providers без изменения основной бизнес-логики.

Интерфейс — современный корпоративный SaaS, ориентированный на большие объёмы данных.

Главный приоритет:

реально работающий pipeline

upload audio

→ ElevenLabs transcription

→ structured AI analysis

→ knowledge extraction

→ embeddings

→ semantic search

→ AI answer

→ API access.

Не используй fake data, mock API или неработающие кнопки.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://callbaseai.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2937c26e-b4b2-481a-9dca-b8642369e473).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
