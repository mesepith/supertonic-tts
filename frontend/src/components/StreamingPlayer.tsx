import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { concatWavBlobs } from "@/lib/wav";

export type ChunkStatus = "pending" | "fetching" | "ready" | "error";

export interface Chunk {
  index: number;
  text: string;
  status: ChunkStatus;
  url?: string;
  blob?: Blob;
}

interface Props {
  chunks: Chunk[];
  total: number;
  autoPlay?: boolean;
  onRegenerate?: (idx: number) => void;
}

export function StreamingPlayer({ chunks, total, autoPlay = true, onRegenerate }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [combinedUrl, setCombinedUrl] = useState<string | null>(null);
  const lastSrcRef = useRef<string | null>(null);

  const current = chunks.find((c) => c.index === playIdx);
  const readyCount = chunks.filter((c) => c.status === "ready").length;
  const fetchingCount = chunks.filter((c) => c.status === "fetching").length;
  const errored = chunks.some((c) => c.status === "error");
  const allReady = readyCount === total && total > 0;

  // When the current chunk becomes ready, set src + load. Playback is started
  // from the `canplay` event so the audio is actually buffered first.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current?.url) {
      if (current && !current.url) setWaiting(true);
      return;
    }
    if (lastSrcRef.current === current.url) return;
    lastSrcRef.current = current.url;
    a.src = current.url;
    a.load();
    setWaiting(false);
  }, [current?.url]);

  // Wire up time/end/canplay/error listeners. The set depends on (playIdx, total)
  // so onEnded sees the correct chunk index when it fires.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => {
      if (playIdx < total - 1) {
        setPlayIdx((i) => i + 1);
      } else {
        setPlaying(false);
      }
    };
    const onCanPlay = () => {
      if (autoPlay || playing) {
        a.play().then(() => setPlaying(true)).catch((err) => {
          console.warn("[StreamingPlayer] play() rejected:", err);
        });
      }
    };
    const onErr = () => {
      console.error("[StreamingPlayer] audio error:", a.error);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("error", onErr);
    };
  }, [playIdx, total, autoPlay, playing]);

  // Build (or rebuild) the combined WAV when all chunks land. Tracking a
  // fingerprint of chunk URLs ensures the download is rebuilt after any
  // single chunk is regenerated.
  const fingerprint = chunks.map((c) => `${c.index}:${c.url ?? ""}`).join("|");
  const lastFingerprintRef = useRef<string>("");

  useEffect(() => {
    if (!allReady) return;
    if (lastFingerprintRef.current === fingerprint) return;

    const blobs = chunks
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => c.blob!)
      .filter(Boolean);
    if (blobs.length !== total) return;

    let cancelled = false;
    lastFingerprintRef.current = fingerprint;
    concatWavBlobs(blobs)
      .then((blob) => {
        if (cancelled) return;
        setCombinedUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [allReady, fingerprint, chunks, total]);

  useEffect(() => {
    return () => {
      if (combinedUrl) URL.revokeObjectURL(combinedUrl);
    };
  }, [combinedUrl]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;

    // If the full sequence has finished, Play restarts from chunk #1.
    const sequenceFinished = a.ended && playIdx === total - 1;
    if (sequenceFinished) {
      if (playIdx === 0) {
        a.currentTime = 0;
        a.play().then(() => setPlaying(true)).catch((err) => console.warn(err));
      } else {
        setPlayIdx(0);
        setPlaying(true); // canplay listener will autoplay the new src
      }
      return;
    }

    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch((err) => console.warn(err));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seekToChunk = (idx: number) => {
    if (chunks.find((c) => c.index === idx)?.status !== "ready") return;
    const a = audioRef.current;
    if (idx === playIdx && a) {
      a.currentTime = 0;
      a.play().then(() => setPlaying(true)).catch((err) => console.warn(err));
      return;
    }
    setPlayIdx(idx);
    setPlaying(true); // canplay listener will autoplay the new src
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="glass rounded-2xl p-5 animate-fade-in">
      <audio ref={audioRef} preload="auto" />
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          disabled={!current?.url}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            "bg-gradient-to-br from-accent-500 to-fuchsia-500 text-white shadow-lg shadow-accent-600/30",
            "hover:from-accent-400 hover:to-fuchsia-400 active:scale-95 transition disabled:opacity-50"
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {waiting && !current?.url ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 translate-x-[1px]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-ink-300 mb-1.5">
            <span className="truncate">
              Chunk <span className="text-white">{playIdx + 1}</span> of {total}
              {fetchingCount > 0 && (
                <span className="text-ink-400"> · {fetchingCount} fetching</span>
              )}
              {errored && <span className="text-rose-400"> · error</span>}
            </span>
            <span className="ml-2 shrink-0">{fmt(progress)} / {fmt(duration)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-fuchsia-500 transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {chunks.map((c) => {
              const clickable = c.status === "ready";
              return (
                <button
                  key={c.index}
                  type="button"
                  disabled={!clickable}
                  onClick={() => seekToChunk(c.index)}
                  title={`${c.index + 1}: ${c.text}`}
                  aria-label={`Jump to chunk ${c.index + 1}`}
                  className={cn(
                    "group relative flex-1 min-w-[14px] py-2 -my-2 outline-none",
                    clickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition",
                      c.status === "ready" && c.index < playIdx && "bg-ink-300 group-hover:bg-white",
                      c.status === "ready" && c.index === playIdx && "bg-gradient-to-r from-accent-500 to-fuchsia-500 ring-2 ring-accent-400/50 ring-offset-2 ring-offset-ink-900",
                      c.status === "ready" && c.index > playIdx && "bg-accent-400/40 group-hover:bg-accent-400",
                      c.status === "fetching" && "bg-amber-400/40 animate-pulse",
                      c.status === "pending" && "bg-white/10",
                      c.status === "error" && "bg-rose-500/40"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <a
          href={combinedUrl ?? "#"}
          download="supertonic.wav"
          onClick={(e) => { if (!combinedUrl) e.preventDefault(); }}
          className={cn("btn-ghost", !combinedUrl && "opacity-40 cursor-not-allowed")}
          title={combinedUrl ? "Download combined WAV" : "Download available when all chunks are ready"}
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>

      {current && (
        <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/60 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              <span className="rounded-md bg-accent-500/15 px-1.5 py-0.5 text-accent-400">
                #{playIdx + 1}
              </span>
              <span>Now speaking</span>
            </div>
            {onRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate(playIdx)}
                disabled={current.status === "fetching"}
                title="Re-synthesize this chunk (use if a word was skipped or sounds off)"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/70 px-2.5 py-1",
                  "text-[11px] font-medium text-ink-200 transition",
                  "hover:border-accent-500/40 hover:bg-accent-500/10 hover:text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {current.status === "fetching" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
                Regenerate
              </button>
            )}
          </div>
          <div className="text-sm leading-relaxed text-ink-100" lang="auto" dir="auto">
            {current.text}
          </div>
        </div>
      )}
    </div>
  );
}
