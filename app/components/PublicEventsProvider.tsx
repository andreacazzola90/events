"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicCalendarEvent } from "../../lib/public-event-list";

const PublicEventsContext = createContext<PublicCalendarEvent[] | undefined>(undefined);
const PublicTodayContext = createContext<string | undefined>(undefined);

export function PublicEventsProvider({ events, today, children }: { events?: PublicCalendarEvent[]; today?: string; children: ReactNode }) {
  return <PublicTodayContext.Provider value={today}><PublicEventsContext.Provider value={events}>{children}</PublicEventsContext.Provider></PublicTodayContext.Provider>;
}

export function usePublicEvents() {
  return useContext(PublicEventsContext);
}

export function usePublicToday() {
  return useContext(PublicTodayContext);
}