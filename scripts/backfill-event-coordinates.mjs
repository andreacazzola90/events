import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { backfillEventCoordinates } from '../lib/event-coordinate-backfill.ts';
import { geocodeLocation } from '../lib/geocoding.ts';

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes('--apply');
const idsArgument = process.argv.find(argument => argument.startsWith('--ids='));
const eventIds = idsArgument
  ? idsArgument.slice('--ids='.length).split(',').map(Number)
  : undefined;
if (eventIds?.some(id => !Number.isInteger(id) || id < 1)) {
  throw new Error('--ids must contain comma-separated positive integer event IDs.');
}
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL,
    },
  },
});

try {
  const result = await backfillEventCoordinates({
    database: prisma,
    apply,
    eventIds,
    geocode: geocodeLocation,
    onProgress: (completed, total) => {
      if (completed % 25 === 0 || completed === total) {
        console.log(`Processed ${completed}/${total} event(s).`);
      }
    },
  });
  console.log(
    `${result.dryRun ? 'Dry run' : 'Backfill'}: ${result.candidates} candidate(s), ` +
      `${result.resolved} resolved, ${result.updated} updated, ` +
      `${result.reused} reused from matching published locations, ` +
      `${result.clearedInvalid} invalid coordinate(s) cleared, ` +
      `${result.unresolved} unresolved, ${result.concurrentChanges} changed concurrently, ` +
      `${result.failed} failed.`,
  );
  if (result.dryRun) {
    console.log('No geocoder requests or database writes were made; pass --apply to write coordinates.');
  }
  if (result.failedEventIds.length > 0) {
    const failures = result.failedEventErrors
      .map(({ eventId, errorType, errorCode }) =>
        `${eventId} (${errorType}${errorCode ? `, ${errorCode}` : ''})`,
      )
      .join(', ');
    console.error(`Failed events: ${failures}`);
  }
  if (result.unresolvedEventIds.length > 0) {
    const shownIds = result.unresolvedEventIds.slice(0, 50).join(', ');
    const remaining = result.unresolvedEventIds.length - 50;
    console.warn(
      `Unresolved event IDs: ${shownIds}${remaining > 0 ? ` (+${remaining} more)` : ''}`,
    );
  }
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
