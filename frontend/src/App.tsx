import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Sparkles, Volume2, Wand2, Wind, Smile, Cloud, Zap } from "lucide-react";
import { Select } from "@/components/Select";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import { AudioPlayer } from "@/components/AudioPlayer";
import { StreamingPlayer, type Chunk } from "@/components/StreamingPlayer";
import { fetchVoices, synthesize, type VoicesResponse } from "@/lib/api";
import { DEMOS, EXPRESSION_TAGS, type Demo, type DemoLang } from "@/lib/demos";
import { splitByPunctuation } from "@/lib/split";
import { cn } from "@/lib/cn";

const SAMPLE_TEXT =
  "A gentle breeze moved through the open window while everyone listened to the story.";

const DEMO_LANGS: { code: DemoLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

const TAG_ICONS: Record<string, React.ReactNode> = {
  "<laugh>": <Smile className="h-3.5 w-3.5" />,
  "<breath>": <Wind className="h-3.5 w-3.5" />,
  "<sigh>": <Cloud className="h-3.5 w-3.5" />,
};

export default function App() {
  const [voices, setVoices] = useState<VoicesResponse | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [gender, setGender] = useState<"M" | "F">("F");
  const [voice, setVoice] = useState("1");
  const [language, setLanguage] = useState("en");
  const [text, setText] = useState(SAMPLE_TEXT);
  const [speed, setSpeed] = useState(1.05);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const [streamMode, setStreamMode] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [streamSession, setStreamSession] = useState(0);
  const chunkUrlsRef = useRef<string[]>([]);

  const [demoLang, setDemoLang] = useState<DemoLang>("en");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const applyDemo = (d: Demo) => {
    setText(d.text);
    setLanguage(d.lang);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => `${t} ${tag} `.replace(/\s+/g, " ").trim());
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + tag + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length;
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    fetchVoices().then(setVoices).catch((e) => setVoicesError(e.message));
  }, []);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      chunkUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const resetChunks = () => {
    chunkUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    chunkUrlsRef.current = [];
    setChunks([]);
    setChunkTotal(0);
  };

  const regenerateChunk = async (idx: number) => {
    const chunk = chunks.find((c) => c.index === idx);
    if (!chunk || chunk.status === "fetching") return;

    if (chunk.url) URL.revokeObjectURL(chunk.url);
    setChunks((cs) =>
      cs.map((c) =>
        c.index === idx ? { ...c, status: "fetching", url: undefined, blob: undefined } : c
      )
    );

    try {
      const blob = await synthesize({
        text: chunk.text,
        gender, voice, language, speed, total_steps: 5,
      });
      const url = URL.createObjectURL(blob);
      chunkUrlsRef.current.push(url);
      setChunks((cs) =>
        cs.map((c) => (c.index === idx ? { ...c, status: "ready", url, blob } : c))
      );
    } catch (err: any) {
      setError(err?.message || "Regeneration failed");
      setChunks((cs) =>
        cs.map((c) => (c.index === idx ? { ...c, status: "error" } : c))
      );
    }
  };

  const langOptions = useMemo(
    () => voices?.languages.map((l) => ({ value: l.code, label: l.label })) ?? [],
    [voices]
  );

  const voiceOptions = useMemo(
    () => (voices?.voices ?? []).map((v) => ({ value: v, label: `Voice ${v}` })),
    [voices]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setError(null);

    // Decide whether streaming actually applies (>1 segment)
    const segments = streamMode ? splitByPunctuation(text.trim()) : [];
    const useStream = streamMode && segments.length > 1;

    if (!useStream) {
      setBusy(true);
      resetChunks();
      try {
        const blob = await synthesize({
          text: text.trim(),
          gender, voice, language, speed, total_steps: 5,
        });
        const url = URL.createObjectURL(blob);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setAudioUrl(url);
      } catch (err: any) {
        setError(err?.message || "Generation failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    // ---- streaming path ----
    setAudioUrl(null);
    if (lastUrlRef.current) { URL.revokeObjectURL(lastUrlRef.current); lastUrlRef.current = null; }
    resetChunks();
    setStreamSession((s) => s + 1);

    setBusy(true);
    setChunkTotal(segments.length);
    setChunks(segments.map((t, i) => ({ index: i, text: t, status: "pending" })));

    try {
      for (let i = 0; i < segments.length; i++) {
        setChunks((cs) => cs.map((c) => c.index === i ? { ...c, status: "fetching" } : c));
        const blob = await synthesize({
          text: segments[i],
          gender, voice, language, speed, total_steps: 5,
        });
        const url = URL.createObjectURL(blob);
        chunkUrlsRef.current.push(url);
        setChunks((cs) => cs.map((c) => c.index === i ? { ...c, status: "ready", url, blob } : c));
      }
    } catch (err: any) {
      setError(err?.message || "Generation failed");
      setChunks((cs) => cs.map((c) => c.status === "fetching" ? { ...c, status: "error" } : c));
    } finally {
      setBusy(false);
    }
  };

  const charCount = text.length;
  const charLimit = 5000;

  return (
    <div className="min-h-full">
      <header className="mx-auto w-full max-w-3xl px-6 pt-12 pb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-fuchsia-500 shadow-lg shadow-accent-600/30">
            <Volume2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Supertonic <span className="text-accent-400">TTS</span>
            </h1>
            <p className="text-sm text-ink-300">
              On-device neural voices · 31 languages · 16-bit studio output
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 pb-24 space-y-6">
        <form onSubmit={onSubmit} className="glass rounded-2xl p-6 sm:p-8 space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-2 sm:col-span-1">
              <div className="label">Gender</div>
              <SegmentedToggle
                value={gender}
                onChange={(v) => setGender(v as "M" | "F")}
                items={[
                  { value: "F", label: "Female" },
                  { value: "M", label: "Male" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <div className="label">Voice</div>
              <Select value={voice} onChange={setVoice} options={voiceOptions} placeholder="Voice" />
            </div>
            <div className="space-y-2">
              <div className="label">Language</div>
              <Select
                value={language}
                onChange={setLanguage}
                options={langOptions}
                placeholder="Language"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="label flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" />Text</div>
              <div className={`text-xs ${charCount > charLimit ? "text-rose-400" : "text-ink-400"}`}>
                {charCount.toLocaleString()} / {charLimit.toLocaleString()}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={charLimit}
              rows={6}
              placeholder="Type something for the model to speak…"
              className="input resize-y min-h-[140px] leading-relaxed"
            />
          </div>

          <DemoBar
            demoLang={demoLang}
            setDemoLang={setDemoLang}
            currentText={text}
            onPick={applyDemo}
          />

          <TagLegend onInsert={insertTag} />

          <StreamToggle enabled={streamMode} onToggle={setStreamMode} />

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-6">
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <div className="label">Speed</div>
                <div className="text-xs text-ink-300">{speed.toFixed(2)}×</div>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-accent-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !text.trim() || !voices}
              className="btn-primary px-6 py-3 sm:min-w-[180px]"
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
              ) : (
                <><Wand2 className="h-4 w-4" />Generate</>
              )}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
          {voicesError && !voices && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Backend not reachable: {voicesError}
            </div>
          )}
        </form>

        {chunkTotal > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-sm text-ink-300">
              <Zap className="h-4 w-4 text-accent-400" />
              Streaming output · {chunkTotal} chunks
            </div>
            <StreamingPlayer
              key={streamSession}
              chunks={chunks}
              total={chunkTotal}
              autoPlay
              onRegenerate={regenerateChunk}
            />
          </section>
        ) : audioUrl ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-sm text-ink-300">
              <Sparkles className="h-4 w-4 text-accent-400" />
              Latest output
            </div>
            <AudioPlayer src={audioUrl} autoPlay />
          </section>
        ) : null}

        <footer className="pt-2 text-center text-xs text-ink-400">
          Powered by <a className="underline decoration-dotted hover:text-ink-200" href="https://github.com/supertone-inc/supertonic" target="_blank" rel="noreferrer">Supertonic-3</a> · ONNX Runtime · FastAPI
        </footer>
      </main>
    </div>
  );
}

interface DemoBarProps {
  demoLang: DemoLang;
  setDemoLang: (l: DemoLang) => void;
  currentText: string;
  onPick: (d: Demo) => void;
}

function DemoBar({ demoLang, setDemoLang, currentText, onPick }: DemoBarProps) {
  const filtered = DEMOS.filter((d) => d.lang === demoLang);
  const plain = filtered.filter((d) => !d.expressive);
  const expressive = filtered.filter((d) => d.expressive);

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-400" />
          <span className="text-sm font-semibold text-ink-100">Try a demo</span>
          <span className="text-xs text-ink-400">— click to load into the box</span>
        </div>
        <div className="inline-flex rounded-lg border border-white/10 bg-ink-900/70 p-0.5">
          {DEMO_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setDemoLang(l.code)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition",
                demoLang === l.code
                  ? "bg-gradient-to-r from-accent-500 to-fuchsia-500 text-white shadow"
                  : "text-ink-300 hover:text-white"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <DemoGroup label="Without expression" demos={plain} currentText={currentText} onPick={onPick} />
      <div className="my-3 border-t border-white/5" />
      <DemoGroup label="With expression" demos={expressive} currentText={currentText} onPick={onPick} expressive />
    </div>
  );
}

function DemoGroup({
  label, demos, currentText, onPick, expressive,
}: {
  label: string;
  demos: Demo[];
  currentText: string;
  onPick: (d: Demo) => void;
  expressive?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          {label}
        </span>
        {expressive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[10px] text-accent-400">
            uses tags
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {demos.map((d) => {
          const active = currentText === d.text;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d)}
              title={d.text}
              className={cn(
                "max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-accent-500/50 bg-accent-500/15 text-white"
                  : "border-white/10 bg-ink-900/60 text-ink-200 hover:border-white/20 hover:bg-white/5"
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StreamToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={cn(
        "w-full text-left rounded-2xl border p-4 transition",
        "flex items-start gap-4",
        enabled
          ? "border-accent-500/40 bg-accent-500/10 hover:bg-accent-500/15"
          : "border-white/10 bg-ink-900/40 hover:bg-ink-900/60"
      )}
      aria-pressed={enabled}
    >
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          enabled
            ? "bg-gradient-to-br from-accent-500 to-fuchsia-500 text-white shadow-lg shadow-accent-600/30"
            : "bg-white/5 text-ink-300"
        )}
      >
        <Zap className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Fast streaming playback</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              enabled ? "bg-accent-500/20 text-accent-400" : "bg-white/5 text-ink-400"
            )}
          >
            {enabled ? "ON" : "OFF"}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-300">
          {enabled ? (
            <>
              Splits your text on <code className="rounded bg-white/5 px-1 text-ink-200">,</code>{" "}
              <code className="rounded bg-white/5 px-1 text-ink-200">.</code>{" "}
              <code className="rounded bg-white/5 px-1 text-ink-200">।</code>{" "}
              <code className="rounded bg-white/5 px-1 text-ink-200">?</code>{" "}
              <code className="rounded bg-white/5 px-1 text-ink-200">!</code> and starts playing the
              first chunk while the next ones are still synthesizing in the background. Lower time
              to first sound; same total quality.
            </>
          ) : (
            <>
              Generates the entire text in one pass before playback. Higher latency for long inputs,
              but produces a single seamless WAV.
            </>
          )}
        </span>
      </span>
      <span
        className={cn(
          "mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
          enabled ? "bg-gradient-to-r from-accent-500 to-fuchsia-500" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

function TagLegend({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mic className="h-4 w-4 text-accent-400" />
        <span className="text-sm font-semibold text-ink-100">Expression tags</span>
        <span className="text-xs text-ink-400">— click to insert at cursor</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {EXPRESSION_TAGS.map((t) => (
          <button
            key={t.tag}
            type="button"
            onClick={() => onInsert(t.tag)}
            className="group flex flex-col gap-1 rounded-xl border border-white/10 bg-ink-900/60 p-3 text-left transition hover:border-accent-500/40 hover:bg-accent-500/5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500/15 text-accent-400">
                {TAG_ICONS[t.tag]}
              </span>
              <code className="text-sm font-semibold text-white">{t.tag}</code>
            </div>
            <div className="text-xs text-ink-300">{t.description}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-ink-400 group-hover:text-ink-300">
              {t.example}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
