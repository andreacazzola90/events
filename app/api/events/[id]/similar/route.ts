import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const eventId = parseInt(id);

        if (isNaN(eventId)) {
            return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
        }

        // Get the current event to find similar ones
        const currentEvent = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!currentEvent) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        // Find similar events based on category, location, or date proximity
        const similarEvents = await prisma.event.findMany({
            where: {
                AND: [
                    { id: { not: eventId } }, // Exclude current event
                    {
                        OR: [
                            { category: currentEvent.category }, // Same category
                            { location: { contains: currentEvent.location.split(',')[0] } }, // Same city/area
                            {
                                AND: [
                                    { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } }, // Events in the next week
                                    { date: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } }
                                ]
                            }
                        ]
                    }
                ]
            },
            take: 6, // Limit to 6 similar events
            orderBy: [
                { category: 'desc' }, // Prioritize same category
                { date: 'asc' } // Then by date
            ],
            select: {
                id: true,
                title: true,
                description: true,
                date: true,
                time: true,
                location: true,
                category: true,
                imageUrl: true,
            }
        });

        return NextResponse.json(similarEvents);
    } catch (error) {
        console.error('Error fetching similar events:', error);
        return NextResponse.json({ error: 'Failed to fetch similar events' }, { status: 500 });
    }
}