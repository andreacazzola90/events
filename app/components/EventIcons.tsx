// Icone SVG per data, ora, luogo
export type AppIconName = "events" | "map" | "calendar" | "profile" | "create" | "install" | "locate" | "search" | "close";

export function AppIcon({
    name,
    className = "w-5 h-5",
}: {
    name: AppIconName;
    className?: string;
}) {
    const common = {
        className,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        viewBox: "0 0 24 24",
        "aria-hidden": true as const,
    };

    switch (name) {
        case "events":
            return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.5" /></svg>;
        case "map":
            return <svg {...common}><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></svg>;
        case "calendar":
            return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" strokeWidth="2" /></svg>;
        case "profile":
            return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
        case "create":
            return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
        case "install":
            return <svg {...common}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 16v4h14v-4" /></svg>;
        case "locate":
            return <svg {...common}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2" /></svg>;
        case "search":
            return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
        case "close":
            return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    }
}

export function CalendarIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3v4M8 3v4M3 9h18" />
        </svg>
    );
}

export function ClockIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
        </svg>
    );
}

export function MapPinIcon({ className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-4.418 0-8-5.373-8-9a8 8 0 1 1 16 0c0 3.627-3.582 9-8 9z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}
