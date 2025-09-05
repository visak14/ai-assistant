const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;

const supabaseUrl =
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_KEY ;

const supabase = createClient(supabaseUrl, supabaseKey);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY is not set in environment variables");
  console.log(
    "💡 Get your API key from: https://makersuite.google.com/app/apikey"
  );
  process.exit(1);
}

console.log(
  "🔑 Using Gemini API key:",
  GEMINI_API_KEY.substring(0, 20) + "..."
);

const buildContextPrompt = (currentMessage, chatHistory) => {
  let contextPrompt = "You are a helpful AI assistant. ";

  if (chatHistory && chatHistory.length > 0) {
    contextPrompt += "Here's our conversation history for context:\n\n";

    const recentHistory = chatHistory.slice(-10);

    recentHistory.forEach((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      contextPrompt += `${role}: ${msg.content}\n`;
    });

    contextPrompt +=
      "\nBased on this conversation context, please provide a helpful and relevant response to: ";
  } else {
    contextPrompt +=
      "Please provide a clear, concise, and helpful response to: ";
  }

  return contextPrompt + currentMessage;
};

// Get chat history for context
const getChatHistory = async (chatId, limit = 10) => {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Error fetching chat history:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error in getChatHistory:", error);
    return [];
  }
};

const saveMessage = async (chatId, role, content) => {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([
        {
          chat_id: chatId,
          role: role,
          content: content,
        },
      ])
      .select();

    if (error) {
      console.error("Error saving message:", error);
      return null;
    }

    return data[0];
  } catch (error) {
    console.error("Error in saveMessage:", error);
    return null;
  }
};

const getOrCreateChatSession = async (userId, title = null) => {
  try {
    if (!title) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error fetching recent chat:", error);
        return null;
      }

      if (data && data.length > 0) {
        return data[0];
      }
    }

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert([
        {
          user_id: userId,
          title: title || "New Chat",
        },
      ])
      .select();

    if (error) {
      console.error("Error creating chat session:", error);
      return null;
    }

    return data[0];
  } catch (error) {
    console.error("Error in getOrCreateChatSession:", error);
    return null;
  }
};

const updateChatSession = async (chatId) => {
  try {
    const { error } = await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);

    if (error) {
      console.error("Error updating chat session:", error);
    }
  } catch (error) {
    console.error("Error in updateChatSession:", error);
  }
};

const testGeminiAPI = async () => {
  try {
    console.log("🧪 Testing Gemini API connection...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "Hello, this is a test message." }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            maxOutputTokens: 100,
          },
        }),
      }
    );

    const data = await response.json();

    if (response.ok && data.candidates) {
      console.log("✅ Gemini API connection successful!");
      return true;
    } else {
      console.error("❌ Gemini API test failed:", data);
      return false;
    }
  } catch (error) {
    console.error("❌ Gemini API test error:", error.message);
    return false;
  }
};

app.post("/chat", async (req, res) => {
  try {
    const { userId, message, chatId = null } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }

    let chatSession;
    if (chatId) {
      const { data } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("id", chatId)
        .eq("user_id", userId)
        .single();

      chatSession = data;
    }

    if (!chatSession) {
      const title =
        message.length > 50 ? message.substring(0, 50) + "..." : message;
      chatSession = await getOrCreateChatSession(userId, title);
    }

    if (!chatSession) {
      return res
        .status(500)
        .json({ error: "Failed to create/get chat session" });
    }

    await saveMessage(chatSession.id, "user", message);

    const chatHistory = await getChatHistory(chatSession.id, 10);

    const contextPrompt = buildContextPrompt(message, chatHistory);
    const workingModel = "gemini-2.0-flash";
    console.log(
      `Sending to Gemini (${workingModel}) with context:`,
      contextPrompt.length,
      "characters"
    );
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: contextPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error response:", data);

      if (data.error) {
        if (data.error.message.includes("API key")) {
          throw new Error(
            "Invalid or expired API key. Please check your Gemini API key."
          );
        } else if (data.error.message.includes("quota")) {
          throw new Error(
            "API quota exceeded. Please check your Gemini API usage."
          );
        } else {
          throw new Error(data.error.message || "Gemini API error");
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }

    if (!data.candidates || data.candidates.length === 0) {
      console.error("No candidates in Gemini response:", data);
      throw new Error("No response generated by Gemini API");
    }

    const candidate = data.candidates[0];

    if (candidate.finishReason === "SAFETY") {
      throw new Error(
        "Content was filtered for safety reasons. Please try rephrasing your message."
      );
    }

    const aiResponse =
      candidate?.content?.parts?.[0]?.text ||
      "Sorry, I couldn't generate a response.";

    console.log("AI Response:", aiResponse.substring(0, 100) + "...");

    await saveMessage(chatSession.id, "bot", aiResponse);

    await updateChatSession(chatSession.id);

    res.json({
      reply: aiResponse,
      chatId: chatSession.id,
      contextUsed: chatHistory.length > 0,
    });
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

app.get("/chat-sessions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    res.json(data || []);
  } catch (err) {
    console.error("Error fetching chat sessions:", err);
    res.status(500).json({ error: "Failed to fetch chat sessions" });
  }
});

app.get("/chat-messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    res.json(data || []);
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});

app.delete("/chat-sessions/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    await supabase.from("chat_messages").delete().eq("chat_id", chatId);

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", chatId);

    if (error) {
      throw new Error(error.message);
    }

    res.json({ message: "Chat session deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat session:", err);
    res.status(500).json({ error: "Failed to delete chat session" });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    geminiApiConfigured: !!GEMINI_API_KEY,
  });
});

app.get("/test-gemini", async (req, res) => {
  try {
    const isWorking = await testGeminiAPI();
    res.json({
      geminiApiWorking: isWorking,
      apiKeyConfigured: !!GEMINI_API_KEY,
    });
  } catch (error) {
    res.status(500).json({
      error: "Gemini API test failed",
      details: error.message,
    });
  }
});

app.listen(PORT, async () => {
  console.log(`🤖 Chatbot backend running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test Gemini: http://localhost:${PORT}/test-gemini`);
  await testGeminiAPI();
});
