// Converts Event.date from DD/MM/YYYY to YYYY-MM-DD (list queries compare dates as strings).
// Dry run by default; pass --apply to write.
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

const rows = await prisma.event.findMany({
  where: { date: { contains: '/' } },
  select: { id: true, title: true, date: true },
});

let changed = 0;
for (const row of rows) {
  const m = row.date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) continue;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  console.log(`${row.id}\t${row.date} -> ${iso}\t${row.title.slice(0, 60)}`);
  if (apply) await prisma.event.update({ where: { id: row.id }, data: { date: iso } });
  changed++;
}

console.log(`${changed} event(s) ${apply ? 'updated' : 'would be updated (dry run, use --apply)'}`);
await prisma.$disconnect();
