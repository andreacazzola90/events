import sharp from 'sharp';

/**
 * Compress image to be under a specific size (default 1024KB)
 * Useful for OCR services that have file size limits.
 */
export async function compressImage(file: File, maxSizeBytes: number = 1024 * 1024): Promise<File> {
  const fileSize = file.size;
  const fileSizeKB = fileSize / 1024;
  const maxSizeKB = maxSizeBytes / 1024;
  
  console.log(`📏 Original image size: ${fileSizeKB.toFixed(2)} KB`);
  
  // If already small enough, return as is
  if (fileSize <= maxSizeBytes) {
    console.log('✅ Image size OK, no compression needed');
    return file;
  }
  
  console.log(`🗜️ Compressing image from ${fileSizeKB.toFixed(2)} KB to under ${maxSizeKB.toFixed(2)} KB...`);
  
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Calculate target dimensions (reduce by sqrt of size ratio to approximate area reduction)
    // We use a slightly aggressive ratio (0.9) to ensure we get under the limit
    const compressionRatio = Math.sqrt((maxSizeBytes * 0.9) / fileSize);
    const targetWidth = metadata.width ? Math.floor(metadata.width * compressionRatio) : undefined;
    
    // Compress with Sharp
    const compressedBuffer = await sharp(buffer)
      .resize(targetWidth, undefined, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80, // Slightly reduced quality
        progressive: true
      })
      .toBuffer();
    
    // Convert Buffer to Blob then to File
    const blob = new Blob([new Uint8Array(compressedBuffer)], { type: 'image/jpeg' });
    const compressedFile = new File([blob], file.name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    
    const newSizeKB = compressedFile.size / 1024;
    console.log(`✅ Compressed to ${newSizeKB.toFixed(2)} KB`);
    
    // Recursive check: if still too big, compress again (rare but possible)
    if (compressedFile.size > maxSizeBytes) {
        console.log('⚠️ Still too big, compressing again...');
        return compressImage(compressedFile, maxSizeBytes);
    }
    
    return compressedFile;
  } catch (error) {
    console.warn('⚠️ Compression failed, using original:', error);
    return file;
  }
}
