import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Initialize Supabase with Service Role for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: Request) {
  try {
    // DEBUG: Check if .env variables are loading
    console.log("--- Bestie API Debug ---");
    console.log("GEMINI_KEY:", process.env.GEMINI_API_KEY ? "✅ Loaded" : "❌ Missing");
    console.log("SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ Loaded" : "❌ Missing");
    console.log("SUPABASE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Loaded" : "❌ Missing");

    if (!supabase) {
      return NextResponse.json({ error: "Supabase config missing in .env" }, { status: 500 });
    }

    const { userId, message } = await req.json();
    console.log("--- AI Backend Incoming ---");
    console.log("User Input:", message);
    console.log("Incoming request from userId:", userId);

    // 1. Fetch persistent history from Supabase
    const { data: dbHistory } = await supabase
      .from('messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // 2. Map Supabase roles to Gemini roles (ai -> model)
    const geminiHistory = (dbHistory || []).map((msg: any) => ({
      role: msg.role === "ai" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      systemInstruction: "You are Bestie, a cinematic and empathetic AI relationship coach for Gen Z. Use a supportive, deep, and conversational tone. Use Gen Z slang sparingly but effectively. Focus on emotional depth and 'glassmorphism' aesthetic in your descriptions.",
    });

    const chat = model.startChat({
      history: geminiHistory,
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    console.log("--- AI Backend Outgoing ---");
    console.log("Gemini Response:", text);

    // 3. Persist new messages to Supabase for future context
    await supabase.from('messages').insert([
      { user_id: userId, content: message, role: 'user' },
      { user_id: userId, content: text, role: 'ai' }
    ]);

    return NextResponse.json({ reply: text }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error: any) {
    console.error("CRITICAL AI BACKEND ERROR:", error);
    return NextResponse.json(
      { error: error.message || "Bestie is having a moment. Please try again later." },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
}