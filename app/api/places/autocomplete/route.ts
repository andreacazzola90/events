import { NextRequest, NextResponse } from "next/server";

interface GooglePlacePrediction {
  text?: { text?: string };
  structuredFormat?: { mainText?: { text?: string } };
}

interface GoogleAutocompleteResponse {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("input")?.trim() ?? "";

  if (input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  if (input.length > 100) {
    return NextResponse.json({ error: "Input troppo lungo" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_SECRET_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { suggestions: [], configured: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text",
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["it"],
          languageCode: "it",
          locationBias: {
            circle: {
              center: { latitude: 45.713, longitude: 11.359 },
              radius: 30000,
            },
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Google Places non disponibile" },
        { status: 502 },
      );
    }

    const data = (await response.json()) as GoogleAutocompleteResponse;
    const suggestions = (data.suggestions ?? []).flatMap(({ placePrediction }) => {
      const label = placePrediction?.text?.text?.trim();
      const value = placePrediction?.structuredFormat?.mainText?.text?.trim();
      return label && value ? [{ label, value }] : [];
    });

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Google Places non disponibile" },
      { status: 502 },
    );
  }
}