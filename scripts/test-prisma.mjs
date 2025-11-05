import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const eventCount = await prisma.event.count();
  const favCount = await prisma.favorite.count();
  console.log({ userCount, eventCount, favCount });
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
