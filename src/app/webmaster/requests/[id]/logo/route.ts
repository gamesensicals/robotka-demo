import { NextResponse } from "next/server";
import { getViewer } from "@/lib/company";
import { signedFileUrl } from "@/server/files";
import { getAccountRequest } from "@/server/queries";

// Logo zo žiadosti o účet sa načíta až po kliknutí (zoznam žiadostí obrázky nenačítava).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isWebmaster) return new NextResponse("Not found", { status: 404 });
  const r = getAccountRequest((await params).id);
  if (!r?.logo_path) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(new URL(signedFileUrl(r.logo_path), req.url), 302);
}
