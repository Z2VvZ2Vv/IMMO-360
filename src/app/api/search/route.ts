import { NextRequest, NextResponse } from "next/server";
import { searchAddresses } from "@/lib/providers";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 160)
    return NextResponse.json(
      { error: "Saisissez une adresse entre 3 et 160 caractères." },
      { status: 400 },
    );
  try {
    return NextResponse.json({ addresses: await searchAddresses(query) });
  } catch {
    return NextResponse.json(
      {
        error:
          "La recherche d’adresses est momentanément indisponible. Réessayez dans un instant.",
      },
      { status: 502 },
    );
  }
}
