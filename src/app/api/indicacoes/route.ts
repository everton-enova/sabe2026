import { failure, json, readRequest } from "@/lib/api-security";
import { sheets, validateLocation } from "@/lib/sheets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    validateLocation("CP", payload.nte, payload.polo);
    const result = await sheets({ tipo: "indicacao", nte: payload.nte, polo: payload.polo });
    return json(result.coordinator);
  } catch (error) { return failure(error); }
}
