// Icone SVG per data, ora, luogo
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
