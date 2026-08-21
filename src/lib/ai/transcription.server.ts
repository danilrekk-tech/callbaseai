// Transcription provider: ElevenLabs Speech-to-Text Scribe v2.
// Handles diarization, language detection, word-level timestamps, long files
// and common audio containers (mp3, wav, m4a, ogg, flac, webm, ...).
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  authHeaders,
  fetchWithTimeout,
  listProviders,
  markProviderError,
  markProviderSuccess,
  readSecret,
} from "./registry.server";
import {
  MAX_AUDIO_BYTES,
  SUPPORTED_AUDIO_EXTENSIONS,
  type TranscriptionResult,
  type TranscriptSegmentInput,
} from "./types";

type ElevenWord = {
  text: string;
  start?: number;
  end?: number;
  type?: string;
  speaker_id?: string;
};

type ElevenResponse = {
  text?: string;
  language_code?: string;
  language_probability?: number;
  words?: ElevenWord[];
};

const MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "video/mp4": "mp4",
};

/** ElevenLabs infers the container from the file extension, so the upload name
 *  must match the real bytes. Falls back to the blob MIME type. */
export function resolveUploadName(fileName: string, mimeType?: string | null): string {
  const base = (fileName.split("/").pop() ?? "audio").replace(/[^\w.\-]+/g, "_");
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  if ((SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return base;
  const fromMime = mimeType ? MIME_TO_EXT[mimeType.split(";")[0]!.trim().toLowerCase()] : undefined;
  if (fromMime) return `${base.replace(/\.[^.]*$/, "")}.${fromMime}`;
  throw new Error(
    `Формат файла «${fileName}» не поддерживается. Допустимые форматы: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}.`,
  );
}

function buildSegments(words: ElevenWord[]): TranscriptSegmentInput[] {
  const segments: TranscriptSegmentInput[] = [];
  let current: TranscriptSegmentInput | null = null;

  for (const word of words) {
    const speaker = word.speaker_id ?? "speaker_0";
    const wordEntry = {
      text: word.text ?? "",
      start_ms: word.start != null ? Math.round(word.start * 1000) : null,
      end_ms: word.end != null ? Math.round(word.end * 1000) : null,
    };
    if (!current || current.speaker !== speaker) {
      if (current && current.text.trim().length > 0) segments.push(current);
      current = {
        idx: segments.length,
        speaker,
        speaker_role: null,
        start_ms: wordEntry.start_ms,
        end_ms: wordEntry.end_ms,
        text: word.text ?? "",
        words: [wordEntry],
      };
    } else {
      current.text += word.text ?? "";
      current.words = [...(current.words ?? []), wordEntry];
      if (wordEntry.end_ms != null) current.end_ms = wordEntry.end_ms;
    }
  }
  if (current && current.text.trim().length > 0) segments.push(current);

  return segments.map((segment, idx) => ({
    ...segment,
    idx,
    text: segment.text.replace(/\s+/g, " ").trim(),
  }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function transcribeAudio(
  db: SupabaseClient,
  audio: Blob,
  fileName: string,
  mimeType?: string | null,
): Promise<TranscriptionResult> {
  if (audio.size === 0) throw new Error("Аудиофайл пустой.");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Файл слишком большой (${(audio.size / 1024 / 1024).toFixed(0)} МБ). Максимум ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)} МБ.`,
    );
  }
  const uploadName = resolveUploadName(fileName, mimeType ?? audio.type);

  const providers = await listProviders(db, "transcription");
  if (providers.length === 0) {
    throw new Error("Не настроен провайдер транскрибации.");
  }
  const errors: string[] = [];

  for (const provider of providers) {
    const key = readSecret(provider.secret_name);
    if (!key) {
      errors.push(
        `${provider.name}: ключ ${provider.secret_name} не задан — добавьте его в настройках интеграций.`,
      );
      continue;
    }

    // Long recordings need a generous timeout; one bounded retry covers
    // transient upstream failures without hammering the provider.
    const timeoutMs = Math.min(900_000, 120_000 + Math.round(audio.size / 1024 / 1024) * 8_000);

    for (let attempt = 0; attempt < 2; attempt++) {
      const startedAt = Date.now();
      try {
        const form = new FormData();
        form.append("file", audio, uploadName);
        form.append("model_id", provider.model ?? "scribe_v2");
        form.append("diarize", "true");
        form.append("tag_audio_events", "true");
        form.append("timestamps_granularity", "word");

        const response = await fetchWithTimeout(
          provider.base_url!,
          { method: "POST", headers: authHeaders(provider, key), body: form },
          timeoutMs,
        );
        const text = await response.text();
        if (!response.ok) {
          const transient = response.status === 429 || response.status >= 500;
          if (transient && attempt === 0) {
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 2000);
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
        }
        const json = JSON.parse(text) as ElevenResponse;
        const words = json.words ?? [];
        const spoken = words.filter((w) => w.type !== "spacing" && (w.text ?? "").trim().length > 0);
        const segments = buildSegments(words);
        const fullText = (json.text ?? segments.map((s) => s.text).join(" ")).trim();
        if (!fullText) throw new Error("Провайдер вернул пустую транскрипцию");

        const lastEnd = words.reduce((max, w) => (w.end != null && w.end > max ? w.end : max), 0);

        await markProviderSuccess(db, provider, Date.now() - startedAt);
        return {
          provider: provider.name,
          model: provider.model ?? "scribe_v2",
          language: json.language_code ?? null,
          languageProbability: json.language_probability ?? null,
          fullText,
          wordsCount: spoken.length,
          durationSeconds: lastEnd > 0 ? Math.round(lastEnd) : null,
          segments,
          raw: json,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name}: ${message}`);
        await markProviderError(db, provider, message, Date.now() - startedAt);
        break;
      }
    }
  }
  throw new Error(`Транскрибация не удалась. ${errors.join(" | ")}`);
}

export async function testTranscriptionConnection(
  db: SupabaseClient,
): Promise<{ ok: boolean; message: string }> {
  const providers = await listProviders(db, "transcription");
  const provider = providers[0];
  if (!provider) return { ok: false, message: "Провайдер транскрибации не настроен." };
  const key = readSecret(provider.secret_name);
  if (!key) return { ok: false, message: `Ключ ${provider.secret_name} не задан.` };
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/user/subscription",
      { headers: authHeaders(provider, key) },
      20_000,
    );
    const body = await response.text();
    if (!response.ok) {
      await markProviderError(db, provider, `HTTP ${response.status}`, Date.now() - startedAt);
      return { ok: false, message: `ElevenLabs вернул ${response.status}: ${body.slice(0, 200)}` };
    }
    const json = JSON.parse(body) as { tier?: string; character_count?: number };
    await markProviderSuccess(db, provider, Date.now() - startedAt);
    return {
      ok: true,
      message: `Соединение установлено. Тариф: ${json.tier ?? "n/a"}, использовано символов: ${json.character_count ?? 0}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markProviderError(db, provider, message, Date.now() - startedAt);
    return { ok: false, message };
  }
}
