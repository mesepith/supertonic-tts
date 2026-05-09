import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";

interface Props {
  src: string;
  filename?: string;
  autoPlay?: boolean;
}

export function AudioPlayer({ src, filename = "supertonic.wav", autoPlay = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    // Reset state for the new clip
    setProgress(0);
    setDuration(0);
    setPlaying(false);
    a.load();

    const onTime = () => setProgress(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    const onCanPlay = () => {
      if (autoPlay) {
        a.play().then(() => setPlaying(true)).catch(() => {});
      }
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("canplay", onCanPlay);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("canplay", onCanPlay);
    };
  }, [src, autoPlay]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
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
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            "bg-gradient-to-br from-accent-500 to-fuchsia-500 text-white shadow-lg shadow-accent-600/30",
            "hover:from-accent-400 hover:to-fuchsia-400 active:scale-95 transition"
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
        </button>
        <div className="flex-1">
          <div
            onClick={seek}
            className="h-2 w-full cursor-pointer rounded-full bg-white/10 overflow-hidden"
          >
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-fuchsia-500 transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-300">
            <span>{fmt(progress)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
        <a
          href={src}
          download={filename}
          className="btn-ghost"
          title="Download WAV"
          aria-label="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
