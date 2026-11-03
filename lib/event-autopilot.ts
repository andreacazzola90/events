export const AUTOPUBLISH_STORAGE_KEY = 'eventscanner:autopublish';

export type RocketStage = 'build' | 'position' | 'ignite' | 'launch' | 'stopped';

export const ROCKET_STAGE_LABELS: Record<RocketStage, string> = {
  build: 'Costruisco il razzo: sto leggendo l’evento',
  position: 'Razzo in posizione: preparo copertina e controlli',
  ignite: 'Accensione: sto pubblicando',
  launch: 'Decollo! Evento pubblicato',
  stopped: 'Lancio in pausa',
};

export type AutopilotStopReason =
  | 'no-events'
  | 'missing-data'
  | 'review-requested'
  | 'cover-failed'
  | 'duplicate'
  | 'user-stopped';

export const AUTOPILOT_STOP_MESSAGES: Record<AutopilotStopReason, string> = {
  'no-events': 'Nessun evento da pubblicare.',
  'missing-data': 'Non siamo riusciti a leggere titolo o data: completali e pubblica.',
  'review-requested': 'Il programma è stato riassunto: controlla gli appuntamenti e pubblica.',
  'cover-failed': 'La copertina non è pronta: sistemala e pubblica.',
  duplicate: 'Sembra già presente nel calendario: controlla prima di pubblicare.',
  'user-stopped': 'Hai scelto di rivedere i dettagli prima di pubblicare.',
};

export type AutopilotDecision =
  | { action: 'wait' }
  | { action: 'publish' }
  | { action: 'stop'; reason: AutopilotStopReason };

export type AutopilotInput = {
  events: { title?: string | null; date?: string | null }[];
  duplicates: unknown[];
  duplicatesChecked: boolean;
  cropStatus: 'idle' | 'processing' | 'completed' | 'failed';
  sectionsPending: boolean;
  coverMissing?: boolean;
  needsReview?: boolean;
};

const isMissing = (value?: string | null) => !value?.trim() || /^\s*non\s+trovat/i.test(value);

export function getAutopilotDecision(input: AutopilotInput): AutopilotDecision {
  if (input.events.length === 0) return { action: 'stop', reason: 'no-events' };
  if (input.events.some(event => isMissing(event.title) || isMissing(event.date))) {
    return { action: 'stop', reason: 'missing-data' };
  }
  if (input.needsReview) return { action: 'stop', reason: 'review-requested' };
  if (input.cropStatus === 'failed' || input.coverMissing) return { action: 'stop', reason: 'cover-failed' };
  if (input.cropStatus === 'processing' || input.sectionsPending || !input.duplicatesChecked) return { action: 'wait' };
  if (input.duplicates.some(Boolean)) return { action: 'stop', reason: 'duplicate' };
  return { action: 'publish' };
}
