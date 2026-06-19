import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";
import { discoverCronSourceConfig } from "../../../../lib/cron-source-autodiscovery";

type CronSourcePayload = {
  id?: number;
  name?: string;
  listUrl?: string;
  scheduleCron?: string;
  timezone?: string;
  eventLinkSelector?: string;
  listingContainerSelector?: string;
  nextPageSelector?: string;
  includePattern?: string;
  excludePattern?: string;
  waitMs?: number;
  requestTimeoutMs?: number;
  maxPages?: number;
  maxLinksPerRun?: number;
  renderJs?: boolean;
  isActive?: boolean;
  notes?: string;
};

const cronSourceModel = (prisma as any).cronSource;

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (lowered === "true") {
      return true;
    }
    if (lowered === "false") {
      return false;
    }
  }

  return fallback;
}

function parseRequiredUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePayload(payload: CronSourcePayload) {
  return {
    name: parseOptionalString(payload.name),
    listUrl: parseRequiredUrl(payload.listUrl),
    scheduleCron: parseOptionalString(payload.scheduleCron) || "0 4 * * *",
    timezone: parseOptionalString(payload.timezone) || "Europe/Rome",
    eventLinkSelector: parseOptionalString(payload.eventLinkSelector) || "a[href]",
    listingContainerSelector: parseOptionalString(payload.listingContainerSelector),
    nextPageSelector: parseOptionalString(payload.nextPageSelector),
    includePattern: parseOptionalString(payload.includePattern),
    excludePattern: parseOptionalString(payload.excludePattern),
    waitMs: clampInt(payload.waitMs, 3000, 0, 120000),
    requestTimeoutMs: clampInt(payload.requestTimeoutMs, 60000, 1000, 300000),
    maxPages: clampInt(payload.maxPages, 10, 1, 200),
    maxLinksPerRun: clampInt(payload.maxLinksPerRun, 200, 1, 5000),
    renderJs: parseBoolean(payload.renderJs, true),
    isActive: parseBoolean(payload.isActive, true),
    notes: parseOptionalString(payload.notes),
  };
}

function validateModelAvailability() {
  if (!cronSourceModel) {
    return NextResponse.json(
      {
        error: "Model CronSource non disponibile. Esegui migrazione e prisma generate.",
      },
      { status: 500 },
    );
  }

  return null;
}

export async function GET() {
  return withAdminAuth(async () => {
    const modelError = validateModelAvailability();
    if (modelError) {
      return modelError;
    }

    const items = await cronSourceModel.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json(items);
  });
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    const modelError = validateModelAvailability();
    if (modelError) {
      return modelError;
    }

    let payload: CronSourcePayload;
    try {
      payload = (await request.json()) as CronSourcePayload;
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const normalized = normalizePayload(payload);
    if (!normalized.name || !normalized.listUrl) {
      return NextResponse.json(
        { error: "I campi name e listUrl sono obbligatori" },
        { status: 400 },
      );
    }

    // Try to auto-discover listing/detail/pagination selectors from the target site.
    // If discovery fails, fallback to the user-provided values without blocking creation.
    let enriched = { ...normalized };
    let discoveryMeta: {
      confidence: number;
      listingSelector?: string | null;
      sampleEventUrl?: string | null;
    } | null = null;

    try {
      const discovered = await discoverCronSourceConfig(normalized.listUrl);
      if (discovered) {
        enriched = {
          ...enriched,
          listUrl: discovered.listUrl || enriched.listUrl,
          eventLinkSelector: discovered.eventLinkSelector || enriched.eventLinkSelector,
          nextPageSelector:
            discovered.nextPageSelector === undefined
              ? enriched.nextPageSelector
              : discovered.nextPageSelector,
          includePattern:
            discovered.includePattern === undefined
              ? enriched.includePattern
              : discovered.includePattern,
          excludePattern:
            discovered.excludePattern === undefined
              ? enriched.excludePattern
              : discovered.excludePattern,
          notes: [enriched.notes, discovered.notes].filter(Boolean).join("\n\n") || null,
        };

        discoveryMeta = {
          confidence: discovered.confidence,
          listingSelector: discovered.listingSelector || null,
          sampleEventUrl: discovered.sampleEventUrl || null,
        };
      }
    } catch (error) {
      console.warn("[cron-sources] Auto-discovery failed, using submitted config:", error);
    }

    const created = await cronSourceModel.create({
      data: enriched,
    });

    return NextResponse.json(
      {
        ...created,
        autoDiscovery: discoveryMeta,
      },
      { status: 201 },
    );
  });
}

export async function PATCH(request: NextRequest) {
  return withAdminAuth(async () => {
    const modelError = validateModelAvailability();
    if (modelError) {
      return modelError;
    }

    let payload: CronSourcePayload;
    try {
      payload = (await request.json()) as CronSourcePayload;
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "id non valido" }, { status: 400 });
    }

    const normalized = normalizePayload(payload);
    if (!normalized.name || !normalized.listUrl) {
      return NextResponse.json(
        { error: "I campi name e listUrl sono obbligatori" },
        { status: 400 },
      );
    }

    const updated = await cronSourceModel.update({
      where: { id },
      data: normalized,
    });

    return NextResponse.json(updated);
  });
}

export async function DELETE(request: NextRequest) {
  return withAdminAuth(async () => {
    const modelError = validateModelAvailability();
    if (modelError) {
      return modelError;
    }

    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "id non valido" }, { status: 400 });
    }

    await cronSourceModel.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
