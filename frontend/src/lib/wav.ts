// Concatenate multiple WAV blobs (same format) into one downloadable WAV.
// Assumes all inputs share the same sample rate / bits / channels — true here
// because every chunk is synthesized by the same model with the same settings.

export async function concatWavBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("no blobs");
  if (blobs.length === 1) return blobs[0];

  const buffers = await Promise.all(blobs.map((b) => b.arrayBuffer()));
  const dataChunks: Uint8Array[] = [];
  let totalDataSize = 0;
  let headerTemplate: Uint8Array | null = null;

  for (const buf of buffers) {
    const view = new DataView(buf);
    let pos = 12; // skip RIFF/WAVE

    while (pos < buf.byteLength - 8) {
      const id =
        String.fromCharCode(view.getUint8(pos)) +
        String.fromCharCode(view.getUint8(pos + 1)) +
        String.fromCharCode(view.getUint8(pos + 2)) +
        String.fromCharCode(view.getUint8(pos + 3));
      const size = view.getUint32(pos + 4, true);

      if (id === "data") {
        dataChunks.push(new Uint8Array(buf, pos + 8, size));
        totalDataSize += size;
        if (!headerTemplate) {
          headerTemplate = new Uint8Array(buf.slice(0, pos + 8));
        }
        break;
      }
      pos += 8 + size;
    }
  }

  if (!headerTemplate) throw new Error("no data chunk");

  const out = new Uint8Array(headerTemplate.length + totalDataSize);
  out.set(headerTemplate, 0);

  // Patch RIFF size (offset 4) and data size (last 4 bytes of header)
  const dv = new DataView(out.buffer);
  dv.setUint32(4, headerTemplate.length + totalDataSize - 8, true);
  dv.setUint32(headerTemplate.length - 4, totalDataSize, true);

  let off = headerTemplate.length;
  for (const chunk of dataChunks) {
    out.set(chunk, off);
    off += chunk.length;
  }

  return new Blob([out], { type: "audio/wav" });
}
