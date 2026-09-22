import { authorizeCp, failure, json, readRequest, verifyBot } from "@/lib/api-security";
import { sheets, validateLocation } from "@/lib/sheets";

export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    authorizeCp(payload);
    validateLocation("CP", payload.nte, payload.polo);
    await verifyBot(payload, "consulta_cp");
    const result = await sheets({ tipo: "indicacao", nte: payload.nte, polo: payload.polo });
    return json(result.coordinator);
  } catch (error) { return failure(error); }
}
