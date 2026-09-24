import { NextRequest, NextResponse } from "next/server";
import { buildReport, searchAddresses } from "@/lib/providers";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const id = request.nextUrl.searchParams.get("id");
  if (query.length < 3 || query.length > 160)
    return NextResponse.json({ error: "Adresse invalide." }, { status: 400 });
  try {
    const addresses = await searchAddresses(query);
    const address = id ? addresses.find((a) => a.id === id) : addresses[0];
    if (!address)
      return NextResponse.json(
        {
          error:
            "Cette adresse n’a pas été trouvée à Paris. Sélectionnez une suggestion.",
        },
        { status: 404 },
      );
    return NextResponse.json(await buildReport(address), {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "L’analyse n’a pas pu démarrer. Réessayez dans un instant." },
      { status: 502 },
    );
  }
}
