export interface VoicesResponse {
  genders: { code: "M" | "F"; label: string }[];
  voices: string[];
  languages: { code: string; label: string }[];
}

export interface TTSParams {
  text: string;
  gender: "M" | "F";
  voice: string;
  language: string;
  speed: number;
  total_steps: number;
}

const API_BASE = ""; // same origin (vite proxy in dev, apache in prod)

export async function fetchVoices(): Promise<VoicesResponse> {
  const r = await fetch(`${API_BASE}/api/voices`);
  if (!r.ok) throw new Error(`voices: HTTP ${r.status}`);
  return r.json();
}

export async function fetchHealth(): Promise<{ status: string; model: string }> {
  const r = await fetch(`${API_BASE}/api/health`);
  if (!r.ok) throw new Error(`health: HTTP ${r.status}`);
  return r.json();
}

export async function synthesize(params: TTSParams): Promise<Blob> {
  const r = await fetch(`${API_BASE}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(detail || `tts: HTTP ${r.status}`);
  }
  return r.blob();
}
