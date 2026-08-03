import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();

    // Any OpenAI-compatible chat/completions endpoint works here.
    // Defaults to Groq (https://groq.com), which offers a generous free tier
    // and very fast inference. Check console.groq.com/docs/models for the
    // current list of available models.
    // Set these as Supabase function secrets:
    //   supabase secrets set AI_API_KEY=gsk_...
    //   supabase secrets set AI_API_URL=https://api.groq.com/openai/v1/chat/completions
    //   supabase secrets set AI_MODEL=llama-3.3-70b-versatile
    //
    // To switch providers, just change AI_API_URL / AI_MODEL (and use the
    // matching API key), e.g. for OpenRouter:
    //   AI_API_URL=https://openrouter.ai/api/v1/chat/completions
    //   AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
    //
    // GROQ_API_KEY is also accepted as an alias for AI_API_KEY, so you can
    // just run `supabase secrets set GROQ_API_KEY=gsk_...` if you'd rather
    // keep the name Groq uses in its own docs.
    const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? Deno.env.get("GROQ_API_KEY");
    const AI_API_URL =
      Deno.env.get("AI_API_URL") ??
      "https://api.groq.com/openai/v1/chat/completions";
    const AI_MODEL = Deno.env.get("AI_MODEL") ?? "llama-3.3-70b-versatile";

    if (!AI_API_KEY) throw new Error("AI_API_KEY (or GROQ_API_KEY) is not configured");

    const response = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful, friendly AI assistant. Keep your answers clear, concise, and well-formatted using markdown when appropriate. You can use code blocks, lists, bold, and other markdown formatting.",
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to your AI provider account." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "AI provider rejected the API key. Check that AI_API_KEY (or GROQ_API_KEY) is set correctly." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI provider error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
