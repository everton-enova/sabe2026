import { ApiError, failure, json, readRequest } from "@/lib/api-security";
import { sheets, validateLocation } from "@/lib/sheets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await readRequest(request);
    validateLocation("CP", payload.nte, payload.polo);
    const result = await sheets({ tipo: "indicacao", nte: payload.nte, polo: payload.polo });
    // Ultima barreira: sem este guarda, json(undefined) estoura e o erro chega como 502.
    if (!result.coordinator) throw new ApiError(404, "Não encontramos uma indicação para este polo.");
    return json(result.coordinator);
  } catch (error) { return failure(error); }
}
