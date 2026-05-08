import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, X, Bot, User, Minimize2, Maximize2, Sparkles } from "lucide-react";
import { HfInference } from "@huggingface/inference";

const Chatbot = ({ issData, newsData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I am your SpaceScope Intelligence Assistant. I can help you analyze ISS telemetry and the latest space intelligence. What would you like to know?",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Initialize HfInference client
  const client = new HfInference(import.meta.env.VITE_HF_TOKEN);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const generateResponse = async (userMessage) => {
    setIsLoading(true);
    try {
      const systemPrompt = `You are the SpaceScope AI, a specialized mission control assistant. 
      Your knowledge is STRICTLY LIMITED to the following live data:
      ISS: Lat ${issData.lat}, Lng ${issData.lng}, Speed ${issData.speed} km/h, Location ${issData.nearestPlace}.
      NEWS: ${newsData.slice(0, 3).map(a => a.title).join(" | ")}.
      RULES: ONLY answer based on this data. Be concise and professional.`;

      const chatCompletion = await client.chatCompletion({
        model: "Qwen/Qwen2.5-72B-Instruct", // Using a stable model name since Qwen3 is not out yet
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        max_tokens: 500,
      });

      const aiText = chatCompletion.choices[0].message.content || 
                     "Mission control is experiencing a temporary signal delay.";
      
      setMessages(prev => [...prev, { role: "assistant", content: aiText }]);
    } catch (error) {
      console.error("AI Error:", error);
      const errorMessage = !import.meta.env.VITE_HF_TOKEN 
        ? "Uplink Error: VITE_HF_TOKEN missing." 
        : `Uplink Error: ${error.message}`;
      setMessages(prev => [...prev, { role: "assistant", content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    generateResponse(userMessage);
  };

  return (
    <div className="fixed bottom-8 right-8 z-[1000] flex flex-col items-end gap-4">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? "80px" : "500px",
              width: "380px"
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="glass-panel overflow-hidden rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sky-500/20 p-2">
                  <Sparkles size={18} className="text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">SpaceScope AI</h3>
                  <p className="text-[10px] text-slate-400">Mission Assistant Online</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
                >
                  {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-white/50 dark:bg-slate-900/50"
                >
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          msg.role === "user" 
                            ? "bg-sky-500 text-white" 
                            : "bg-slate-800 text-sky-400"
                        }`}>
                          {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
                        </div>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-sky-500 text-white shadow-lg shadow-sky-200 dark:shadow-none"
                            : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 shadow-sm"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-3 items-center bg-white dark:bg-slate-800 rounded-2xl px-4 py-2.5 border border-slate-100 dark:border-slate-700">
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0.2s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <form 
                  onSubmit={handleSubmit}
                  className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800"
                >
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask mission control..."
                      className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="absolute right-2 p-2 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 dark:bg-sky-500 text-white shadow-[0_15px_40px_rgba(0,0,0,0.3)] dark:shadow-[0_15px_40px_rgba(14,165,233,0.3)] transition-all hover:bg-slate-900 dark:hover:bg-sky-600 group relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
      </motion.button>
    </div>
  );
};

export default Chatbot;
