import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "../../../../lib/auth-helpers";
import { closeBrowser, getBrowser } from "../../../../../lib/browser-vercel";

type InspectPayload = {
  url?: string;
  eventLinkSelector?: string;
  nextPageSelector?: string;
  waitMs?: number;
};

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

function parseSelector(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function parseOptionalSelector(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampWaitMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1500;
  }
  return Math.max(0, Math.min(10000, Math.round(parsed)));
}

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    let payload: InspectPayload;
    try {
      payload = (await request.json()) as InspectPayload;
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const url = parseRequiredUrl(payload.url);
    if (!url) {
      return NextResponse.json({ error: "url non valido" }, { status: 400 });
    }

    const eventLinkSelector = parseSelector(payload.eventLinkSelector, "a[href]");
    const nextPageSelector = parseOptionalSelector(payload.nextPageSelector);
    const waitMs = clampWaitMs(payload.waitMs);

    let browser: any = null;

    try {
      browser = await getBrowser({
        headless: true,
        timeout: 45000,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const result = await page.evaluate(
        ({ eventSelector, nextSelector }) => {
          const toAbs = (href: string) => {
            try {
              return new URL(href, window.location.href).toString();
            } catch {
              return "";
            }
          };

          const safeQueryAll = (selector: string) => {
            try {
              return Array.from(document.querySelectorAll(selector));
            } catch {
              return [] as Element[];
            }
          };

          const eventNodes = safeQueryAll(eventSelector);
          const eventLinks = eventNodes
            .map((node) => {
              if (node instanceof HTMLAnchorElement) {
                return toAbs(node.href);
              }
              const nestedAnchor = node.querySelector("a[href]") as HTMLAnchorElement | null;
              return nestedAnchor ? toAbs(nestedAnchor.href) : "";
            })
            .filter((href) => href.startsWith("http"));

          const uniqueEventLinks = Array.from(new Set(eventLinks));

          let nextPageHref: string | null = null;
          let nextMatched = false;
          if (nextSelector) {
            const nextNode = document.querySelector(nextSelector) as HTMLAnchorElement | null;
            if (nextNode) {
              nextMatched = true;
              const href =
                nextNode instanceof HTMLAnchorElement
                  ? nextNode.href
                  : nextNode.getAttribute("href") || "";
              nextPageHref = href ? toAbs(href) : null;
            }
          }

          const suggestedNextSelectors = [
            'a[rel="next"]',
            'a[aria-label*="next" i]',
            'a[href*="page="]',
            '.pagination a.next',
            'a.next',
          ].filter((selector) => {
            try {
              return !!document.querySelector(selector);
            } catch {
              return false;
            }
          });

          return {
            scannedUrl: window.location.href,
            eventLinkSelector: eventSelector,
            eventMatches: eventNodes.length,
            eventLinksFound: uniqueEventLinks.length,
            sampleEventLinks: uniqueEventLinks.slice(0, 10),
            nextPageSelector: nextSelector,
            nextPageMatched: nextMatched,
            nextPageHref,
            suggestedNextSelectors,
            title: document.title,
          };
        },
        {
          eventSelector: eventLinkSelector,
          nextSelector: nextPageSelector,
        },
      );

      return NextResponse.json({ ok: true, result });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Analisi selettori fallita",
          details: error instanceof Error ? error.message : "Errore sconosciuto",
        },
        { status: 500 },
      );
    } finally {
      if (browser) {
        await closeBrowser(browser);
      }
    }
  });
}
