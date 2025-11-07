'use client';

import { useEffect } from 'react';

export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

// Initialize Google Tag Manager
export const initGTM = () => {
    if (!GTM_ID) return;

    // Initialize dataLayer for GTM
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        'gtm.start': new Date().getTime(),
        event: 'gtm.js'
    });
};

// Push events to GTM dataLayer
export const pushToDataLayer = (data: Record<string, any>) => {
    if (!GTM_ID || typeof window === 'undefined') return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(data);
};

// Track specific events for our events app
export const trackGTMEvent = (eventName: string, parameters?: Record<string, any>) => {
    pushToDataLayer({
        event: eventName,
        ...parameters,
    });
};

// Event-specific tracking functions
export const trackEventView = (eventData: any) => {
    trackGTMEvent('view_event', {
        event_id: eventData.id,
        event_title: eventData.title,
        event_category: eventData.category,
        event_location: eventData.location,
        event_date: eventData.date,
        event_price: eventData.price,
    });
};

export const trackEventCreate = (eventData: any) => {
    trackGTMEvent('create_event', {
        event_id: eventData.id,
        event_title: eventData.title,
        event_category: eventData.category,
    });
};

export const trackEventEdit = (eventData: any) => {
    trackGTMEvent('edit_event', {
        event_id: eventData.id,
        event_title: eventData.title,
    });
};

export const trackSearch = (searchTerm: string, category?: string, resultsCount?: number) => {
    trackGTMEvent('search', {
        search_term: searchTerm,
        search_category: category,
        search_results_count: resultsCount,
    });
};

export const trackUserAction = (action: string, target?: string) => {
    trackGTMEvent('user_action', {
        action: action,
        target: target,
    });
};

// GTM Component
export function GoogleTagManager() {
    useEffect(() => {
        if (!GTM_ID) return;
        initGTM();
    }, []);

    // Don't render anything if no GTM_ID
    if (!GTM_ID) return null;

    return (
        <>
            {/* Google Tag Manager Script */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `,
                }}
            />
            {/* Google Tag Manager (noscript) */}
            <noscript>
                <iframe
                    src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                    height="0"
                    width="0"
                    style={{ display: 'none', visibility: 'hidden' }}
                />
            </noscript>
        </>
    );
}