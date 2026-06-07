import { useState, useEffect, useRef, useCallback } from "react";
import { useOptionalNotes } from "../../context/NotesContext";
import { Button, IconButton } from "../ui";
import {
  XIcon,
  SendIcon,
  SpinnerIcon,
  AiChatIcon,
  RefreshCwIcon,
} from "../icons";
import {
  sendChatMessage,
  generateMessageId,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
} from "../../services/chatbox";
import type { ChatMessage } from "../../services/chatbox";
import { cn } from "../../lib/utils";

// Simple markdown-to-React converter for basic formatting
function parseMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (index: number) => {
    if (listItems.length > 0) {
      const ListTag = listType === "ol" ? "ol" : "ul";
      elements.push(
        <ListTag
          key={`list-${index}`}
          className={
            listType === "ol"
              ? "list-decimal list-inside space-y-0.5 my-1"
              : "list-disc list-inside space-y-0.5 my-1"
          }
        >
          {listItems.map((item, i) => (
            <li key={i} className="text-sm">
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ListTag>,
      );
      listItems = [];
      listType = null;
    }
  };

  lines.forEach((line, index) => {
    // Code blocks
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        const codeText = codeBlockContent.join("\n");
        elements.push(
          <div key={`code-${index}`} className="relative my-1">
            <pre className="bg-bg-secondary rounded px-2 py-1 my-1 overflow-x-auto">
              <code className="text-xs font-mono">{codeText}</code>
            </pre>
          </div>,
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        flushList(index);
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    // Unordered list items
    if (line.match(/^\s*[-*]\s+/)) {
      if (listType !== "ul") {
        flushList(index);
        listType = "ul";
      }
      listItems.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }

    // Ordered list items
    if (line.match(/^\s*\d+\.\s+/)) {
      if (listType !== "ol") {
        flushList(index);
        listType = "ol";
      }
      listItems.push(line.replace(/^\s*\d+\.\s+/, ""));
      return;
    }

    // Headers - render as bold text
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      flushList(index);
      const headerText = headerMatch[2];
      elements.push(
        <p
          key={`header-${index}`}
          className="text-sm my-1 font-semibold"
        >
          {parseInlineMarkdown(headerText)}
        </p>,
      );
      return;
    }

    // Horizontal rule
    if (line.trim() === "---" || line.trim() === "***") {
      flushList(index);
      elements.push(
        <hr
          key={`hr-${index}`}
          className="border-border my-2"
        />,
      );
      return;
    }

    // Regular line
    flushList(index);
    if (line.trim()) {
      elements.push(
        <p key={`line-${index}`} className="text-sm my-1">
          {parseInlineMarkdown(line)}
        </p>,
      );
    } else if (elements.length > 0) {
      elements.push(<div key={`space-${index}`} className="h-1" />);
    }
  });

  flushList(lines.length);

  return elements;
}

function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns = [
    {
      regex: /`([^`]+)`/g,
      render: (match: string) => (
        <code
          key={key++}
          className="bg-bg-secondary rounded px-1 py-0.5 font-mono text-xs"
        >
          {match}
        </code>
      ),
    },
    {
      regex: /(\*\*|__)(.+?)\1/g,
      render: (match: string) => (
        <strong key={key++} className="font-semibold">
          {match}
        </strong>
      ),
    },
    {
      regex: /(?<!\*)\*(?!\*)(.+?)\*(?!\*)|(?<!_)_(?!_)(.+?)_(?!_)/g,
      render: (match: string) => (
        <em key={key++} className="italic">
          {match}
        </em>
      ),
    },
  ];

  patterns.forEach(({ regex, render }) => {
    const newParts: React.ReactNode[] = [];
    const currentParts = parts.length > 0 ? parts : [remaining];

    currentParts.forEach((part) => {
      if (typeof part !== "string") {
        newParts.push(part);
        return;
      }

      let lastIndex = 0;
      const matches = Array.from(part.matchAll(regex));

      matches.forEach((match) => {
        if (match.index! > lastIndex) {
          newParts.push(part.slice(lastIndex, match.index));
        }
        const content = match[2] || match[1];
        newParts.push(render(content));
        lastIndex = match.index! + match[0].length;
      });

      if (lastIndex < part.length) {
        newParts.push(part.slice(lastIndex));
      }
    });

    parts.splice(0, parts.length, ...newParts);
  });

  return parts.length > 0 ? parts : remaining;
}

interface AiChatboxProps {
  isOpen: boolean;
  onClose: () => void;
}

// Global stores for cross-note state management
const loadingByNoteId = new Map<string, boolean>();
const messagesByNoteId = new Map<string, ChatMessage[]>();
const errorByNoteId = new Map<string, string | null>();

export function AiChatbox({ isOpen, onClose }: AiChatboxProps) {
  const notesCtx = useOptionalNotes();
  const currentNote = notesCtx?.currentNote;
  const currentNoteId = currentNote?.id ?? null;

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [, forceUpdate] = useState(0);

  // Get state for current note
  const noteId = currentNoteId;
  const isLoading = noteId ? loadingByNoteId.get(noteId) ?? false : false;
  const messages = noteId ? messagesByNoteId.get(noteId) ?? [] : [];
  const error = noteId ? errorByNoteId.get(noteId) ?? null : null;

  // Force re-render when global state changes
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 100);
    return () => clearInterval(interval);
  }, []);

  // Load messages when current note changes
  useEffect(() => {
    if (!noteId) return;

    async function loadMessages() {
      try {
        const history = await getChatHistory();
        const savedMessages = history[noteId as string] || [];
        // Only set if not already set (prevents overwriting pending messages)
        if (!messagesByNoteId.has(noteId as string)) {
          messagesByNoteId.set(noteId as string, savedMessages);
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    }

    loadMessages();
  }, [noteId]);

  // Save messages when they change
  useEffect(() => {
    if (!noteId || messages.length === 0) return;

    async function persistMessages() {
      try {
        const history = await getChatHistory();
        await saveChatHistory({
          ...history,
          [noteId as string]: messages,
        });
      } catch (err) {
        console.error("Failed to save messages:", err);
      }
    }

    persistMessages();
  }, [messages, noteId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chatbox opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset button handler
  const handleReset = useCallback(async () => {
    if (!noteId) return;

    try {
      await clearChatHistory(noteId as string);
      messagesByNoteId.delete(noteId as string);
      loadingByNoteId.delete(noteId as string);
      errorByNoteId.delete(noteId as string);
      forceUpdate((n) => n + 1);
    } catch (err) {
      console.error("Failed to reset chat:", err);
    }
  }, [noteId]);

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || !currentNote) return;

    const targetNoteId = currentNote.id;

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: "user",
      content: trimmedInput,
      timestamp: Date.now(),
    };

    // Update global state
    loadingByNoteId.set(targetNoteId, true);
    errorByNoteId.set(targetNoteId, null);
    messagesByNoteId.set(targetNoteId, [...(messagesByNoteId.get(targetNoteId) || []), userMessage]);
    setInput("");
    forceUpdate((n) => n + 1);

    try {
      const currentMessages = messagesByNoteId.get(targetNoteId) || [];
      const result = await sendChatMessage(
        currentMessages,
        currentNote.content,
        currentNote.title,
      );

      if (result.success && result.message) {
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: result.message,
          timestamp: Date.now(),
        };
        messagesByNoteId.set(targetNoteId, [...(messagesByNoteId.get(targetNoteId) || []), assistantMessage]);
      } else {
        errorByNoteId.set(targetNoteId, result.error || "Failed to get response");
      }
    } catch (err) {
      errorByNoteId.set(targetNoteId, err instanceof Error ? err.message : "An error occurred");
    } finally {
      loadingByNoteId.set(targetNoteId, false);
      forceUpdate((n) => n + 1);
    }
  }, [input, isLoading, currentNote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-bg border-l border-border shadow-2xl z-50 flex flex-col animate-slide-in-from-right">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <AiChatIcon className="w-5 h-5 stroke-[1.5] text-text-muted" />
          <span className="font-medium text-sm">Chat with Note</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={handleReset}
            disabled={messages.length === 0 && isLoading}
            title="Reset conversation"
          >
            <RefreshCwIcon className="w-4 h-4 stroke-[1.5]" />
          </IconButton>
          <IconButton onClick={onClose} aria-label="Close chat">
            <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
          </IconButton>
        </div>
      </div>

      {/* Note context indicator */}
      {currentNote && (
        <div className="px-4 py-2 bg-bg-secondary border-b border-border text-xs text-text-muted shrink-0">
          Chatting about: <span className="font-medium">{currentNote.title}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-8">
            <AiChatIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Ask questions about this note.</p>
            <p className="text-xs mt-1">The AI will only see this note's content.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "rounded-lg p-3 text-sm",
              message.role === "user"
                ? "bg-accent text-bg ml-8"
                : "bg-bg-muted mr-4",
            )}
          >
            <div className="whitespace-pre-wrap break-words">
              {message.role === "assistant"
                ? parseMarkdown(message.content)
                : message.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="bg-bg-muted rounded-lg p-3 mr-4">
            <div className="flex items-center gap-2 text-text-muted">
              <SpinnerIcon className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mr-4">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this note..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm bg-bg-secondary border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="self-end"
          >
            {isLoading ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SendIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}