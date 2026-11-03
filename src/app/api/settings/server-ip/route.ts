import { failFrom, ok } from "@/lib/api";
import { serverAddresses, setServerIp } from "@/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public IP shown in DNS instructions, for servers whose own network address is not the public one. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { ip?: unknown };
    const ip = setServerIp(typeof body.ip === "string" ? body.ip : "");
    return ok({ ip, serverAddresses: serverAddresses() });
  } catch (error) {
    return failFrom(error);
  }
}
