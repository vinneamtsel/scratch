import { invoke } from "@tauri-apps/api/core";

// Chat message for persistence
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatboxResult {
  success: boolean;
  message?: string;
  error?: string;
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Send a message to OpenRouter and get a response
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  noteContent: string,
  noteTitle: string,
): Promise<ChatboxResult> {
  try {
    // Get API key and model from settings
    const settings = await invoke("get_settings");
    const apiKey = (settings as any).chatbox?.openRouterApiKey;
    const model = (settings as any).chatbox?.model;

    if (!apiKey) {
      return {
        success: false,
        error: "OpenRouter API key not configured. Please go to Settings → Integrations → Chatbox to configure.",
      };
    }

    if (!model) {
      return {
        success: false,
        error: "No AI model selected. Please go to Settings → Integrations → Chatbox to select a model.",
      };
    }

    // Build the system prompt with note context
    const systemPrompt = `You are a helpful AI assistant embedded in a note-taking app. The user is currently editing a note titled "${noteTitle}".

The note's current content is:
${noteContent}

Your role:
- Answer questions about the note content
- Help brainstorm, summarize, or expand on ideas in the note
- Suggest improvements or corrections
- Assist with writing tasks related to the note

Be concise and focused. If a question is outside the scope of the note, politely redirect to questions about the note.`;

    // Convert messages to OpenRouter format
    const openRouterMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://www.ericli.io/scratch",
        "X-Title": "Scratch Note-Taking App",
      },
      body: JSON.stringify({
        model: model,
        messages: openRouterMessages,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error?.message || `API request failed (${response.status})`;

      // Handle specific error cases
      if (response.status === 401) {
        return {
          success: false,
          error: "Invalid API key. Please check your OpenRouter API key in Settings.",
        };
      }
      if (response.status === 429) {
        return {
          success: false,
          error: "Rate limit exceeded. Please wait a moment and try again.",
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      return {
        success: false,
        error: "No response from AI. Please try again.",
      };
    }

    const assistantMessage = data.choices[0]?.message?.content;

    if (!assistantMessage) {
      return {
        success: false,
        error: "Empty response from AI. Please try again.",
      };
    }

    return {
      success: true,
      message: assistantMessage,
    };
  } catch (err) {
    console.error("Chatbox error:", err);

    // Handle network errors
    if (err instanceof TypeError && err.message.includes("fetch")) {
      return {
        success: false,
        error: "Network error. Please check your internet connection.",
      };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Generate a unique ID for chat messages
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Chat history functions for separate file storage
export async function getChatHistory(): Promise<Record<string, ChatMessage[]>> {
  const notesFolder = await invoke<string>("get_notes_folder");
  return invoke("get_chat_history", { expectedFolder: notesFolder ?? "" });
}

export async function saveChatHistory(
  history: Record<string, ChatMessage[]>,
): Promise<void> {
  const notesFolder = await invoke<string>("get_notes_folder");
  return invoke("save_chat_history", { expectedFolder: notesFolder ?? "", history });
}

export async function clearChatHistory(noteId?: string): Promise<void> {
  const notesFolder = await invoke<string>("get_notes_folder");
  return invoke("clear_chat_history", { expectedFolder: notesFolder ?? "", noteId });
}