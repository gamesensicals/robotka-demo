"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/company";
import type { ErrorCode } from "@/server/events";
import { MEDIA_LIMITS, extOf, mediaKind, presignPut, uploadToken, validUploadToken } from "@/server/files";
import { getJob } from "@/server/queries";
import { SyncError, submit } from "@/server/sync";

export type UploadMeta = { name: string; size: number; type: string };
export type PreparedUpload = { key: string; url: string; token: string };
export type DoneUpload = UploadMeta & { key: string; token: string };

/** Krok 1: server overí oprávnenie a veľkosti a podpíše odkazy na nahratie priamo do úložiska. */
export async function prepareUploads(jobId: string, files: UploadMeta[]): Promise<{ error?: ErrorCode; items?: PreparedUpload[] }> {
  const { company, readOnly } = await getContext();
  if (readOnly) return { error: "read_only" };
  if (!getJob(company.id, jobId)) return { error: "not_found" };
  if (!files.length || files.length > 50) return { error: "invalid" };
  for (const f of files) {
    const kind = mediaKind(f.type);
    if (!kind || !(f.size > 0) || f.size > MEDIA_LIMITS[kind]) return { error: "photos_invalid" };
  }
  return {
    items: files.map((f) => {
      const key = `${company.id}/${jobId}/${randomUUID()}.${extOf(f.name, f.type.split("/")[1] ?? "bin")}`;
      return { key, url: presignPut(key, f.size, f.type), token: uploadToken(key, f.size, f.type) };
    }),
  };
}

/** Krok 2: po nahratí zapíše súbory k zákazke (udalosť ide cez hub na všetky servery). */
export async function commitUploads(jobId: string, takenOn: string, caption: string, files: DoneUpload[]): Promise<{ error?: ErrorCode }> {
  const { company, user } = await getContext();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : new Date().toISOString().slice(0, 10);
  try {
    for (const f of files) {
      if (!f.key.startsWith(`${company.id}/${jobId}/`) || !validUploadToken(f.key, f.size, f.type, f.token)) return { error: "forbidden" };
      await submit({
        type: "photo.add",
        companyId: company.id,
        photo: {
          id: randomUUID(), job_id: jobId, storage_path: f.key, caption: caption.trim().slice(0, 500) || null,
          taken_on: day, size_bytes: f.size, mime: f.type, file_name: f.name.slice(0, 255),
        },
      }, user.id);
    }
  } catch (e) {
    if (e instanceof SyncError) return { error: e.code };
    throw e;
  } finally {
    revalidatePath(`/jobs/${jobId}`);
  }
  return {};
}
