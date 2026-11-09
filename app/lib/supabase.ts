import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

let supabaseClient: ReturnType<typeof createSupabaseClient> | undefined;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  supabaseClient = createSupabaseClient();
  return supabaseClient;
}

function createSupabaseClient(signal?: AbortSignal) {

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_SECRET_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Create the server-side client only when a Storage operation is requested.
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    ...(signal ? { global: { fetch: (input: RequestInfo | URL, options?: RequestInit) => fetch(input, {
      ...options,
      signal: AbortSignal.any([
        signal,
        ...(options?.signal ? [options.signal] : []),
        ...(input instanceof Request ? [input.signal] : []),
      ]),
    }) } } : {}),
  });
}

/**
 * Optimize and compress an image for web use
 * @param buffer - The image buffer to optimize
 * @returns Optimized image buffer
 */
async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    // Optimize image: resize if too large, compress, convert to JPEG
    const optimized = await sharp(buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
    
    console.log('[Image Optimization] Original size:', buffer.length, 'bytes');
    console.log('[Image Optimization] Optimized size:', optimized.length, 'bytes');
    console.log('[Image Optimization] Reduction:', ((1 - optimized.length / buffer.length) * 100).toFixed(2), '%');
    
    return optimized;
  } catch (error) {
    console.warn('[Image Optimization] Failed to optimize, using original:', error);
    return buffer;
  }
}

/**
 * Upload an image to Supabase Storage
 * @param file - The image file to upload
 * @param bucket - The storage bucket name (default: 'events')
 * @returns The public URL of the uploaded image
 */
export async function uploadImageToSupabase(
  file: File | Buffer,
  bucket: string = 'events'
): Promise<string> {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    
    let filename: string;
    let fileBuffer: Buffer;
    
    if (file instanceof File) {
      const extension = file.name.split('.').pop() || 'jpg';
      filename = `${timestamp}-${randomString}.${extension}`;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      filename = `${timestamp}-${randomString}.jpg`;
      fileBuffer = file;
    }

    // Optimize image before upload
    console.log('[Supabase] Optimizing image...');
    const optimizedBuffer = await optimizeImage(fileBuffer);

    // Upload to Supabase Storage
    const { error } = await getSupabaseClient().storage
      .from(bucket)
      .upload(filename, optimizedBuffer, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (error) {
      console.error('[Supabase] Upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = getSupabaseClient().storage
      .from(bucket)
      .getPublicUrl(filename);

    console.log('[Supabase] Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('[Supabase] Error uploading image:', error);
    throw error;
  }
}

export async function uploadEventMediaToSupabase(file: File, eventId: number, options: { signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const safeName = file.name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120) || "attachment";
  const storagePath = `${eventId}/${randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  options.signal?.throwIfAborted();
  const client = options.signal ? createSupabaseClient(options.signal) : getSupabaseClient();
  const { error } = await client.storage.from("events").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = client.storage.from("events").getPublicUrl(storagePath);
  return { storagePath, url: data.publicUrl };
}

export async function uploadOriginalEventImageToSupabase(file: File) {
  const safeName = file.name
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120) || "original-image";
  const storagePath = `originals/${randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await getSupabaseClient().storage.from("events").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = getSupabaseClient().storage.from("events").getPublicUrl(storagePath);
  return { storagePath, url: data.publicUrl };
}

export async function deleteEventMediaFromSupabase(storagePath: string, options: { signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const client = options.signal ? createSupabaseClient(options.signal) : getSupabaseClient();
  const { error } = await client.storage.from("events").remove([storagePath]);
  if (error) throw error;
}

export async function uploadPrivateCropLearningPair(
  userId: number,
  original: Buffer,
  corrected: Buffer,
  sample: { width: number; height: number; x: number; y: number; w: number; h: number },
) {
  const client = getSupabaseClient();
  const bucketName = 'crop-learning';
  const bucket = await client.storage.getBucket(bucketName);
  if (bucket.data?.public) {
    const updated = await client.storage.updateBucket(bucketName, { public: false });
    if (updated.error) throw updated.error;
  } else if (!bucket.data) {
    const created = await client.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: '8MB',
      allowedMimeTypes: ['image/jpeg'],
    });
    if (created.error) {
      const existing = await client.storage.getBucket(bucketName);
      if (!existing.data) throw created.error;
      if (existing.data.public) {
        const updated = await client.storage.updateBucket(bucketName, { public: false });
        if (updated.error) throw updated.error;
      }
    }
  }

  const folder = `${userId}/${randomUUID()}`;
  const originalPath = `${folder}/original.jpg`;
  const correctedPath = `${folder}/corrected.jpg`;
  const storage = client.storage.from(bucketName);
  const originalUpload = await storage.upload(originalPath, original, { contentType: 'image/jpeg', upsert: false });
  if (originalUpload.error) throw originalUpload.error;
  const correctedUpload = await storage.upload(correctedPath, corrected, { contentType: 'image/jpeg', upsert: false });
  if (correctedUpload.error) {
    await storage.remove([originalPath]);
    throw correctedUpload.error;
  }
  return { originalPath, correctedPath, sample };
}

export async function downloadPrivateCropLearningImage(path: string): Promise<Buffer> {
  const { data, error } = await getSupabaseClient().storage.from('crop-learning').download(path);
  if (error || !data) throw error ?? new Error('Crop learning object unavailable');
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePrivateCropLearningImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await getSupabaseClient().storage.from('crop-learning').remove(paths);
  if (error) throw error;
}

/**
 * Delete an image from Supabase Storage
 * @param imageUrl - The public URL of the image to delete
 * @param bucket - The storage bucket name (default: 'events')
 */
export async function deleteImageFromSupabase(
  imageUrl: string,
  bucket: string = 'events'
): Promise<void> {
  try {
    // Extract filename from URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];

    const { error } = await getSupabaseClient().storage
      .from(bucket)
      .remove([filename]);

    if (error) {
      console.error('[Supabase] Delete error:', error);
      throw error;
    }

    console.log('[Supabase] Image deleted successfully:', filename);
  } catch (error) {
    console.error('[Supabase] Error deleting image:', error);
    throw error;
  }
}
