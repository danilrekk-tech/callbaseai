// Transcription provider: ElevenLabs Scribe v2 (speech-to-text with
// diarization, language detection and word timestamps).
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  authHeaders,
  listProviders,
  markProviderError,
  markProviderSuccess,
  readSecret,
} from "./registry.server";
import type { TranscriptionResult, TranscriptSegmentInput } from "./types";

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

function buildSegments(words: ElevenWord[]): TranscriptSegmentInput[] {
  const segments: TranscriptSegmentInput[] = [];
  let current: TranscriptSegmentInput | null = null;

  for (const word of words) {
    const speaker = word.speaker_id ?? "speaker_0";
    if (!current || current.speaker !== speaker) {
      if (current && current.text.trim().length > 0) segments.push(current);
      current = {
        idx: segments.length,
        speaker,
        speaker_role: null,
        start_ms: word.start != null ? Math.round(word.start * 1000) : null,
        end_ms: word.end != null ? Math.round(word.end * 1000) : null,
        text: word.text ?? "",
      };
    } else {
      current.text += word.text ?? "";
      if (word.end != null) current.end_ms = Math.round(word.end * 1000);
    }
  }
  if (current && current.text.trim().length > 0) segments.push(current);
  return segments.map((segment, idx) => ({
    ...idxFix(segment, idx),
    text: segment.text.replace(/\s+/g, " ").trim(),
  }));
}

function idxFix(segment: TranscriptSegmentInput, idx: number): TranscriptSegmentInput {
  return { ...segment, idx };
}

export async function transcribeAudio(
  db: SupabaseClient,
  audio: Blob,
  fileName: string,
): Promise<TranscriptionResult> {
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
    try {
      const form = new FormData();
      form.append("file", audio, fileName);
      form.append("model_id", provider.model ?? "scribe_v2");
      form.append("diarize", "true");
      form.append("tag_audio_events", "true");
      form.append("timestamps_granularity", "word");

      const response = await fetch(provider.base_url!, {
        method: "POST",
        headers: authHeaders(provider, key),
        body: form,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
      const json = JSON.parse(text) as ElevenResponse;
      const words = json.words ?? [];
      const segments = buildSegments(words.filter((w) => w.type !== "spacing" || w.text));
      const fullText = (json.text ?? segments.map((s) => s.text).join(" ")).trim();
      if (!fullText) throw new Error("Провайдер вернул пустую транскрипцию");

      await markProviderSuccess(db, provider);
      return {
        provider: provider.name,
        model: provider.model ?? "scribe_v2",
        language: json.language_code ?? null,
        languageProbability: json.language_probability ?? null,
        fullText,
        wordsCount: words.filter((w) => w.type !== "spacing").length,
        segments,
        raw: json,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${message}`);
      await markProviderError(db, provider, message);
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
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: authHeaders(provider, key),
    });
    const body = await response.text();
    if (!response.ok) {
      await markProviderError(db, provider, `HTTP ${response.status}`);
      return { ok: false, message: `ElevenLabs вернул ${response.status}: ${body.slice(0, 200)}` };
    }
    const json = JSON.parse(body) as { tier?: string; character_count?: number };
    await markProviderSuccess(db, provider);
    return {
      ok: true,
      message: `Соединение установлено. Тариф: ${json.tier ?? "n/a"}, использовано символов: ${json.character_count ?? 0}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markProviderError(db, provider, message);
    return { ok: false, message };
  }
}
