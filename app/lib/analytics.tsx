'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Google Analytics 4
declare global {
    interface Window {
        gtag: (...args: any[]) => void;
        dataLayer: any[];
    }
}

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Initialize Google Analytics
export const initGA = () => {
    if (!GA_MEASUREMENT_ID) return;

    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };

    // Configure GA
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
        page_title: document.title,
        page_location: window.location.href,
    });
};

// Track page views
export const trackPageView = (url: string, title?: string) => {
    if (!GA_MEASUREMENT_ID || !window.gtag) return;

    window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: url,
        page_title: title || document.title,
        page_location: window.location.origin + url,
    });
};

// Track events
export const trackEvent = (
    action: string,
    category: string,
    label?: string,
    value?: number,
    customParameters?: Record<string, any>
) => {
    if (!GA_MEASUREMENT_ID || !window.gtag) return;

    window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
        ...customParameters,
    });
};

// Track custom events for events app
export const trackEventInteraction = (eventType: string, eventData?: any) => {
    trackEvent(eventType, 'Event', eventData?.title || eventData?.id, undefined, {
        event_id: eventData?.id,
        event_category: eventData?.category,
        event_location: eventData?.location,
    });
};

// Component for auto-tracking page views  
function GoogleAnalyticsInner() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!GA_MEASUREMENT_ID) return;

        const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
        trackPageView(url);
    }, [pathname, searchParams]);

    return null;
}

export function GoogleAnalytics() {

    // Don't render anything if no GA_MEASUREMENT_ID
    if (!GA_MEASUREMENT_ID) return null;

    return (
        <>
            {/* Google Analytics Script */}
            <script
                async
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            />
            <script
                dangerouslySetInnerHTML={{
                    __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname,
              page_title: document.title,
              page_location: window.location.href,
            });
          `,
                }}
            />
            {/* Auto-track page views */}
            <Suspense fallback={null}>
                <GoogleAnalyticsInner />
            </Suspense>
        </>
    );
}