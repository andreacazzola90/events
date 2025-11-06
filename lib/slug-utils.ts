// Utility functions for converting event titles to URL-friendly slugs

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Generate unique slug by appending ID if needed
export function generateUniqueSlug(title: string, id: number): string {
  const baseSlug = titleToSlug(title);
  return `${baseSlug}-${id}`;
}

// Extract ID from slug (for database queries)
export function extractIdFromSlug(slug: string): number | null {
  const parts = slug.split('-');
  const lastPart = parts[parts.length - 1];
  const id = parseInt(lastPart, 10);
  return isNaN(id) ? null : id;
}

// Generate slug without ID (for display)
export function getDisplaySlug(title: string): string {
  return titleToSlug(title);
}