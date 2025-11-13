import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer for OCR.space API
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create FormData for OCR.space API
    const ocrFormData = new FormData();
    
    // Use file directly instead of base64 for better server compatibility
    const blob = new Blob([buffer], { type: file.type });
    ocrFormData.append('file', blob, file.name);
    ocrFormData.append('apikey', 'K83907440988957');
    ocrFormData.append('language', 'ita');
    ocrFormData.append('isOverlayRequired', 'false');
    ocrFormData.append('detectOrientation', 'true');
    ocrFormData.append('scale', 'true');
    ocrFormData.append('OCREngine', '2');

    console.log('📡 Calling OCR.space API from server...');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': 'K83907440988957',
      },
      body: ocrFormData,
    });

    const data = await response.json();

    console.log('📊 OCR.space server response:', {
      isErrored: data.IsErroredOnProcessing,
      hasResults: !!data.ParsedResults?.[0],
    });

    if (data.IsErroredOnProcessing) {
      return NextResponse.json(
        { error: `OCR processing error: ${data.ErrorMessage || 'Unknown error'}` },
        { status: 500 }
      );
    }

    if (!data.ParsedResults?.[0]?.ParsedText) {
      return NextResponse.json(
        { error: 'OCR returned no text results' },
        { status: 500 }
      );
    }

    const extractedText = data.ParsedResults[0].ParsedText.trim();
    
    console.log('✅ OCR text extraction successful via server route');
    
    return NextResponse.json({
      success: true,
      text: extractedText,
    });
    
  } catch (error) {
    console.error('❌ Server OCR extraction failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? `OCR server error: ${error.message}` 
          : 'Unknown OCR server error'
      },
      { status: 500 }
    );
  }
}