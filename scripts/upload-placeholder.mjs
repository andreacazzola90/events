import { createClient } from '@supabase/supabase-js';
import { createCanvas } from 'canvas';
import fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create a simple placeholder image
const canvas = createCanvas(800, 600);
const ctx = canvas.getContext('2d');

// Background gradient
const gradient = ctx.createLinearGradient(0, 0, 800, 600);
gradient.addColorStop(0, '#6366f1');
gradient.addColorStop(1, '#8b5cf6');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 800, 600);

// Add text
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 60px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('EVENT PLACEHOLDER', 400, 300);

// Add icon (calendar emoji representation)
ctx.font = '120px Arial';
ctx.fillText('📅', 400, 450);

// Convert to buffer
const buffer = canvas.toBuffer('image/jpeg', { quality: 0.9 });

// Upload to Supabase
async function uploadPlaceholder() {
    try {
        console.log('📤 Uploading placeholder image to Supabase...');

        const { data, error } = await supabase.storage
            .from('events')
            .upload('placeholder-event.jpg', buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) {
            console.error('❌ Upload error:', error);
            process.exit(1);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('events')
            .getPublicUrl('placeholder-event.jpg');

        console.log('✅ Placeholder uploaded successfully!');
        console.log('📎 Public URL:', publicUrl);

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

uploadPlaceholder();
