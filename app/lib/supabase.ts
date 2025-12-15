import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client with service role key for server-side operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

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
    const { data, error } = await supabase.storage
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
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename);

    console.log('[Supabase] Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('[Supabase] Error uploading image:', error);
    throw error;
  }
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

    const { error } = await supabase.storage
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
