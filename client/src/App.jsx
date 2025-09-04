import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, History, Plus, Trash2 } from "lucide-react";

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [userId] = useState(() => {
    return "user_" + Math.random().toString(36).substr(2, 9);
  });
  const [connectionError, setConnectionError] = useState(null);

  const messagesEndRef = useRef(null);

  const BACKEND_URL = "http://localhost:5000";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    loadChatSessions();
    startNewChat();
  }, []);

  const loadChatSessions = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/chat-sessions/${userId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const sessions = await response.json();
      setChatSessions(sessions);
      setConnectionError(null);
    } catch (error) {
      console.error("Error loading chat sessions:", error);
      setConnectionError("Failed to connect to backend server");
    }
  };

  const loadChatMessages = async (chatId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/chat-messages/${chatId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const messagesData = await response.json();
      setMessages(
        messagesData.map((msg) => ({
          role: msg.role,
          message: msg.content,
          timestamp: msg.created_at,
        }))
      );
      setConnectionError(null);
    } catch (error) {
      console.error("Error loading messages:", error);
      setConnectionError("Failed to load chat messages");
    }
  };

  const deleteChatSession = async (chatId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/chat-sessions/${chatId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      await loadChatSessions();
      if (currentChatId === chatId) {
        startNewChat();
      }
      setConnectionError(null);
    } catch (error) {
      console.error("Error deleting chat session:", error);
      setConnectionError("Failed to delete chat session");
    }
  };

  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([
      {
        role: "bot",
        message:
          "Hello! I'm your AI assistant. I can help answer questions about various topics and remember our conversation context. What would you like to know?",
      },
    ]);
  };

  const switchToChat = async (chatId) => {
    setCurrentChatId(chatId);
    await loadChatMessages(chatId);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", message: input };
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId,
          message: currentInput,
          chatId: currentChatId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.details ||
            errorData.error ||
            `Server error: ${response.status}`
        );
      }

      const data = await response.json();

      const botMessage = { role: "bot", message: data.reply };
      setMessages((prev) => [...prev, botMessage]);

      if (data.chatId && !currentChatId) {
        setCurrentChatId(data.chatId);
      }

      await loadChatSessions();
      setConnectionError(null);
    } catch (err) {
      console.error("Chat error:", err);
      let errorMessage = "Sorry, I encountered an error. Please try again.";

      if (err.message.includes("fetch")) {
        errorMessage =
          "Cannot connect to the server. Make sure your backend is running on " +
          BACKEND_URL;
        setConnectionError("Backend server not accessible");
      } else if (err.message.includes("API Key")) {
        errorMessage =
          "API configuration error. Please check your Gemini API key.";
      } else {
        errorMessage = `Error: ${err.message}`;
      }

      const errorMsg = {
        role: "bot",
        message: `⚠️ ${errorMessage}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    "What's the weather like?",
    "How do I learn programming?",
    "Tell me a fun fact",
    "What's a healthy recipe?",
    "Explain AI in simple terms",
  ];

  const handleQuickQuestion = (question) => {
    setInput(question);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto flex gap-4 h-[90vh]">
        {/* Sidebar */}
        <div className="w-80 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600">
            <h2 className="text-white font-bold flex items-center gap-2">
              <History className="w-5 h-5" />
              Chat History
            </h2>
            {connectionError && (
              <div className="text-red-200 text-xs mt-1">
                ⚠️ Connection issue
              </div>
            )}
          </div>

          <div className="p-4">
            <button
              onClick={startNewChat}
              className="w-full flex items-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              {chatSessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => switchToChat(session.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      currentChatId === session.id
                        ? "bg-blue-100 text-blue-700"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    <div className="truncate font-medium">{session.title}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {new Date(session.updated_at).toLocaleDateString()}
                    </div>
                  </button>
                  <button
                    onClick={() => deleteChatSession(session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}
              {chatSessions.length === 0 && !connectionError && (
                <div className="text-center text-gray-500 text-sm py-4">
                  No chat history yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat */}
        <div className="flex-1 bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">AI Assistant</h1>
                <p className="text-blue-100 text-sm">
                  Powered by Google Gemini • Context-Aware
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          {connectionError && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">
                    <strong>Connection Error:</strong> {connectionError}
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    Make sure your backend server is running on {BACKEND_URL}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      m.role === "user" ? "bg-blue-600" : "bg-gray-200"
                    }`}
                  >
                    {m.role === "user" ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      m.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {m.message}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 1 && (
            <div className="px-6 py-2">
              <p className="text-sm text-gray-500 mb-3">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(question)}
                    className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-6 bg-gray-50 border-t">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Press Enter to send • Shift+Enter for new line • Chat history
              provides context
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
