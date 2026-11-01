"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { commitUploads, prepareUploads, type DoneUpload } from "@/app/jobs/[id]/upload-actions";
import { fmtBytes } from "@/lib/format";

type Labels = {
  dropTitle: string; dropOr: string; limits: string; shrink: string; takenOn: string; caption: string;
  upload: string; remove: string; uploading: string; done: string; failed: string; uploaded: string;
};
type Item = { id: string; file: File; preview?: string; status: "ready" | "uploading" | "done" | "error"; progress: number };

const ACCEPT = "image/*,video/*,application/pdf";
const kindOf = (t: string) => (t.startsWith("image/") ? "image" : t.startsWith("video/") ? "video" : t === "application/pdf" ? "pdf" : null);

/** Fotku zmenšíme v prehliadači (max. 2560 px, JPEG 85 %): menej miesta v úložisku = menej kreditov. */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // HEIC, GIF, SVG… necháme tak
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // priehľadné PNG -> biele pozadie
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** PUT priamo do úložiska s priebehom (fetch priebeh nahrávania neukazuje). */
function put(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

export default function MediaUpload({ jobId, today, locale, labels, errors }: { jobId: string; today: string; locale: string; labels: Labels; errors: Record<string, string> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [takenOn, setTakenOn] = useState(today);
  const [caption, setCaption] = useState("");
  const [doShrink, setDoShrink] = useState(true);

  useEffect(() => () => items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => kindOf(f.type));
    setMessage(null);
    setItems((prev) => [
      ...prev.filter((i) => i.status !== "done"),
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        status: "ready" as const,
        progress: 0,
      })),
    ]);
  };
  const patch = (id: string, p: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const ready = items.filter((i) => i.status === "ready" || i.status === "error");

  async function upload() {
    if (!ready.length || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const files = await Promise.all(ready.map(async (i) => (doShrink ? await shrink(i.file) : i.file)));
      const prepared = await prepareUploads(jobId, files.map((f) => ({ name: f.name, size: f.size, type: f.type })));
      if (prepared.error || !prepared.items) throw new Error(prepared.error ?? "invalid");
      const done: DoneUpload[] = [];
      // po troch naraz, aby slabý mobilný signál nezamrzol
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const n = next++;
          const item = ready[n];
          const file = files[n];
          const p = prepared.items![n];
          patch(item.id, { status: "uploading", progress: 0 });
          try {
            await put(p.url, file, (progress) => patch(item.id, { progress }));
            done.push({ name: file.name, size: file.size, type: file.type, key: p.key, token: p.token });
            patch(item.id, { status: "done", progress: 1 });
          } catch {
            patch(item.id, { status: "error" });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (done.length) {
        const res = await commitUploads(jobId, takenOn, caption, done);
        if (res.error) throw new Error(res.error);
        setCaption("");
        router.refresh();
      }
      const failed = files.length - done.length;
      setMessage(failed ? { ok: false, text: `${labels.failed} (${failed})` } : { ok: true, text: labels.uploaded });
    } catch (e) {
      setMessage({ ok: false, text: errors[(e as Error).message] ?? errors.invalid });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload">
      <div className="fields">
        <label className="field">{labels.takenOn} <input type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} /></label>
        <label className="field">{labels.caption} <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} /></label>
      </div>

      <div
        className={`dropzone${over ? " over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <strong>{labels.dropTitle}</strong>
        <span>{labels.dropOr}</span>
        <small className="muted">{labels.limits}</small>
        <input
          ref={input}
          type="file"
          name="files"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="upload-list">
          {items.map((i) => (
            <li key={i.id} className={`upload-item ${i.status}`}>
              {i.preview ? <img src={i.preview} alt="" /> : <span className="file-icon">{kindOf(i.file.type) === "pdf" ? "PDF" : "▶"}</span>}
              <span className="upload-name">{i.file.name}<small className="muted"> · {fmtBytes(i.file.size, locale)}</small></span>
              <span className="upload-state">
                {i.status === "uploading" && <progress max={1} value={i.progress} aria-label={labels.uploading} />}
                {i.status === "done" && <span className="pos">{labels.done}</span>}
                {i.status === "error" && <span className="neg">{labels.failed}</span>}
              </span>
              {i.status !== "uploading" && i.status !== "done" && (
                <button type="button" className="linklike" onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))} aria-label={labels.remove}>✕</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={!ready.length || busy} onClick={upload}>
          {busy ? labels.uploading : labels.upload.replace("{n}", String(ready.length))}
        </button>
        <label className="check"><input type="checkbox" checked={doShrink} onChange={(e) => setDoShrink(e.target.checked)} /> {labels.shrink}</label>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "notice" : "alert"}>{message.text}</p>}
    </div>
  );
}
