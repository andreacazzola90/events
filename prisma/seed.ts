import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  try {
    // Verifica connessione database
    await prisma.$connect()
    console.log('✅ Database connection established')

    // Pulisci i dati esistenti (in ordine per rispettare le foreign key)
    await prisma.favorite.deleteMany()
    await prisma.event.deleteMany()
    await prisma.user.deleteMany()

    console.log('✅ Cleaned existing data')
  } catch (error) {
    console.log('ℹ️ Database might be empty or connection issue, continuing...')
  }

  // Crea utenti di esempio
  const hashedPassword = await bcrypt.hash('password123', 10)
  
  const user1 = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Admin User'
    }
  })

  const user2 = await prisma.user.create({
    data: {
      email: 'user@example.com',
      password: hashedPassword,
      name: 'Test User'
    }
  })

  console.log('✅ Created users')

  // Crea eventi di esempio
  const events = await Promise.all([
    prisma.event.create({
      data: {
        title: 'Concerto Jazz al Tramonto',
        description: 'Una serata magica con i migliori musicisti jazz della città. Atmosfera intima e musica di qualità in un ambiente unico.',
        date: '2025-11-15',
        time: '20:00',
        location: 'Jazz Club Roma, Via del Corso 123, Roma',
        organizer: 'Jazz Club Roma',
        category: 'Musica',
        price: '25€',
        rawText: 'Concerto Jazz al Tramonto - 15 Novembre 2025 ore 20:00 - Jazz Club Roma',
        imageUrl: null,
        createdById: user1.id
      }
    }),
    prisma.event.create({
      data: {
        title: 'Mostra d\'Arte Contemporanea',
        description: 'Esposizione delle opere più innovative degli artisti emergenti. Un viaggio attraverso le nuove tendenze dell\'arte moderna.',
        date: '2025-11-20',
        time: '18:30',
        location: 'Galleria Moderna, Via Nazionale 456, Milano',
        organizer: 'Galleria Moderna',
        category: 'Arte',
        price: 'Gratuito',
        rawText: 'Mostra Arte Contemporanea - Dal 20 Novembre 2025 - Galleria Moderna Milano',
        imageUrl: null,
        createdById: user1.id
      }
    }),
    prisma.event.create({
      data: {
        title: 'Workshop di Cucina Italiana',
        description: 'Impara i segreti della cucina italiana tradizionale con chef esperti. Include degustazione e ricette da portare a casa.',
        date: '2025-11-25',
        time: '15:00',
        location: 'Scuola di Cucina Italia, Piazza San Marco 789, Venezia',
        organizer: 'Scuola di Cucina Italia',
        category: 'Gastronomia',
        price: '75€',
        rawText: 'Workshop Cucina Italiana - 25 Novembre 2025 ore 15:00 - Scuola di Cucina Italia Venezia',
        imageUrl: null,
        createdById: user2.id
      }
    }),
    prisma.event.create({
      data: {
        title: 'Conferenza Tech Innovation',
        description: 'I leader del settore tecnologico discutono le ultime innovazioni in AI, blockchain e sviluppo sostenibile.',
        date: '2025-12-01',
        time: '09:00',
        location: 'Centro Congressi Tech, Via Torino 321, Torino',
        organizer: 'Tech Innovation Hub',
        category: 'Tecnologia',
        price: '50€',
        rawText: 'Tech Innovation Conference - 1 Dicembre 2025 ore 09:00 - Centro Congressi Tech Torino',
        imageUrl: null,
        createdById: user2.id
      }
    })
  ])

  console.log('✅ Created events')

  // Crea alcuni favoriti
  await prisma.favorite.create({
    data: {
      userId: user1.id,
      eventId: events[2].id
    }
  })

  await prisma.favorite.create({
    data: {
      userId: user2.id,
      eventId: events[0].id
    }
  })

  await prisma.favorite.create({
    data: {
      userId: user2.id,
      eventId: events[1].id
    }
  })

  console.log('✅ Created favorites')
  console.log('🎉 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })