import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // 1. TANGANI IZIN CORS (PREFLIGHT) DARI BROWSER
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!API_KEY) {
      throw new Error("GEMINI_API_KEY belum disetel di menu Secrets Supabase!")
    }

    const finalParts = payload.parts ? payload.parts : [{ text: payload.prompt }];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: finalParts }] })
    });

    const data = await response.json();
    
    // 2. KEMBALIKAN DATA DENGAN HEADER CORS
    return new Response(JSON.stringify(data), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    })
  } catch (error) {
    // 3. KEMBALIKAN ERROR DENGAN HEADER CORS
    return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
    })
  }
})