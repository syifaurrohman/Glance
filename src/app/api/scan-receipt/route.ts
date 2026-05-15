import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Menggunakan Edge Runtime agar proses upload gambar stabil
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Image data is required and must be a valid string' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY belum dikonfigurasi. Tambahkan GEMINI_API_KEY di file .env' },
        { status: 500 }
      );
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `Kamu adalah asisten keuangan yang menganalisis nota/struk belanja. 
Analisis gambar nota ini dan ekstrak informasi berikut dalam format JSON saja (tanpa markdown, tanpa penjelasan tambahan):

{
  "merchant": "nama toko/merchant",
  "date": "tanggal_dalam_format_YYYY-MM-DD",
  "items": [
    { "name": "nama item", "price": harga_angka_tanpa_titik, "categoryId": "id_kategori" }
  ],
  "totalAmount": jumlah_total_angka_tanpa_titik_tanpa_koma
}

Kategori yang tersedia:
- makan: Makanan (restoran, kafe, makanan cepat saji, grocery, makanan ringan, minuman)
- trans: Transport (bensin, parkir, ojek, taxi, kereta, bus)
- belanja: Belanja (pakaian, elektronik, kebutuhan rumah, supermarket, kebutuhan harian)
- hiburan: Hiburan (film, game, konser, hobi)
- tagihan: Tagihan (listrik, air, internet, telepon, cicilan)
- kesehatan: Kesehatan (obat, dokter, rumah sakit, apotek)

PENTING:
- Setiap item di nota HARUS dicatat secara terpisah dengan harga masing-masing
- price harus berupa angka bulat tanpa titik/koma (contoh: 50000 bukan 50.000)
- totalAmount adalah jumlah keseluruhan
- Pilih categoryId yang paling sesuai untuk SETIAP item
- Jika tidak ada tanggal di nota, gunakan tanggal hari ini dalam format YYYY-MM-DD
- Jika nama toko terdeteksi, sertakan sebagai merchant
- Hanya kembalikan JSON murni, tanpa kode markdown atau penjelasan`;

    // Ekstrak data base64 dari URL gambar
    let base64Data = image;
    let mimeType = 'image/jpeg';
    
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:(.+?);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }
    
    console.log(`MimeType: ${mimeType}, Ukuran Base64: ${base64Data.length} karakter`);

    // ===================================================================
    // FITUR AUTO-DETECT: Mencari model yang tersedia khusus untuk API Key ini
    // ===================================================================
    let modelsToTry = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro-vision'
    ];

    try {
      console.log("Mendeteksi model yang tersedia untuk API Key kamu dari server Google...");
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const listData = await listRes.json();
      
      if (listData.models) {
        const validModels = listData.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''));
        
        console.log("✅ Model yang diizinkan oleh API Key:", validModels.join(', '));
        
        // Prioritaskan model gemini vision/flash/pro yang tersedia
        const flashModels = validModels.filter((m: string) => m.includes('flash') && !m.includes('8b'));
        const proModels = validModels.filter((m: string) => m.includes('pro') && !m.includes('vision'));
        const legacyVision = validModels.filter((m: string) => m.includes('vision'));
        
        const autoDetectedModels = [...flashModels, ...proModels, ...legacyVision];
        
        if (autoDetectedModels.length > 0) {
            modelsToTry = autoDetectedModels;
        } else if (validModels.length > 0) {
            // Jika tidak ada flash/pro, pakai model apa saja yang paling pertama
            modelsToTry = [validModels[0]];
        }
      } else {
         console.log("⚠️ Gagal mendapat daftar model dari server. Memakai daftar default.");
      }
    } catch (e) {
      console.log("⚠️ Error saat mendeteksi model:", e);
    }

    console.log("🚀 Daftar antrean model yang akan dieksekusi:", modelsToTry);
    // ===================================================================

    let lastError: any = null;
    let content: string = ''; 

    for (const modelName of modelsToTry) {
      try {
        console.log(`Mencoba model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ]);
        
        const responseText = result.response.text();
        if (responseText) {
          content = responseText;
          console.log(`🎉 Berhasil memproses gambar dengan model: ${modelName}`);
          break; // Keluar dari loop jika berhasil
        }
      } catch (e: any) {
        console.log(`❌ Model ${modelName} gagal:`, e?.message || 'Unknown error');
        lastError = e;
        continue; // Lanjut coba model berikutnya
      }
    }

    // Jika semua model gagal
    if (!content) {
      const errMsg = lastError?.message || 'Unknown error';
      if (errMsg.includes('429') || errMsg.includes('quota')) {
        return NextResponse.json(
          { success: false, error: 'Kuota Gemini API habis. Buat API key baru.' },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: `Gagal! Pesan Google: ${errMsg}` },
        { status: 500 }
      );
    }

    // Proses parsing JSON dari jawaban AI
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const backticks = String.fromCharCode(96, 96, 96); 
      const mdPattern = new RegExp(backticks + '(?:json)?\\s*([\\s\\S]*?)' + backticks);
      const jsonMatch = content.match(mdPattern);
      
      if (jsonMatch && jsonMatch[1]) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch && objectMatch[0]) {
          parsed = JSON.parse(objectMatch[0]);
        } else {
          return NextResponse.json(
            { success: false, error: 'Gagal membaca format data nota dari AI', raw: content },
            { status: 500 }
          );
        }
      }
    }

    // Validasi dan normalisasi daftar barang
    const items = (parsed?.items || []).map((item: any) => ({
      name: String(item?.name || 'Item'),
      price: Number(item?.price) || 0,
      categoryId: String(item?.categoryId || 'belanja'),
    }));

    return NextResponse.json({
      success: true,
      data: {
        merchant: parsed?.merchant || '',
        date: parsed?.date || new Date().toISOString().split('T')[0],
        items,
        totalAmount: Number(parsed?.totalAmount) || items.reduce((sum: number, i: any) => sum + (Number(i?.price) || 0), 0),
      },
    });

  } catch (error: any) {
    console.error('Scan receipt error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: `Terjadi kesalahan sistem: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}