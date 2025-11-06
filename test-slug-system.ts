// Test utility to demonstrate URL slug functionality

import { titleToSlug, generateUniqueSlug, extractIdFromSlug, slugToTitle } from './lib/slug-utils';

// Test examples
console.log('=== URL Slug System Test ===');

// Test 1: Basic title to slug conversion
const eventTitle = "Concerto Rock: Pink Floyd Tribute Band Live!";
const eventId = 123;
const slug = generateUniqueSlug(eventTitle, eventId);
console.log(`Title: "${eventTitle}"`);
console.log(`Slug: "${slug}"`);
console.log(`URL: /events/${slug}`);

// Test 2: Extract ID from slug
const extractedId = extractIdFromSlug(slug);
console.log(`Extracted ID: ${extractedId}`);

// Test 3: Various title formats
const testTitles = [
    "Evento Speciale: Musica & Arte",
    "Workshop di Fotografia (Livello Avanzato)",
    "Festival dell'Estate 2024",
    "Conferenza Tech: AI e Machine Learning",
    "Mostra d'Arte Contemporanea"
];

console.log('\n=== Multiple Title Examples ===');
testTitles.forEach((title, index) => {
    const id = 100 + index;
    const generatedSlug = generateUniqueSlug(title, id);
    console.log(`"${title}" → "/events/${generatedSlug}"`);
});

export { titleToSlug, generateUniqueSlug, extractIdFromSlug, slugToTitle };