import { useState } from "react";
import { chatDemoAssistant } from "@/lib/server/fns";
import { Button, Input } from "./ui";
import { DEFAULT_CLINIC } from "@/lib/demo-assistant";

const QUICK = ["Book an Appointment", "Opening Hours", "Services", "Location", "Contact Us"];

export function AppointmentAssistant() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    {
      role: "assistant",
      content: `Hi — I’m the clinic’s AI assistant for ${DEFAULT_CLINIC.name}. How can I help?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [quick, setQuick] = useState(QUICK);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const reply = await chatDemoAssistant({ data: { message: trimmed, history: next } });
      setMessages([...next, { role: "assistant", content: reply.text }]);
      setQuick(reply.quickReplies.length ? reply.quickReplies : QUICK);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "I had trouble answering. You can still call the front desk." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-[min(640px,80dvh)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <p className="font-display text-lg">{DEFAULT_CLINIC.name}</p>
        <p className="text-sm text-muted">AI Appointment Assistant — demo. No medical advice.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-[18px] rounded-br-md bg-accent px-3.5 py-2.5 text-sm text-accent-fg"
                  : "max-w-[80%] rounded-[18px] rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm text-fg"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending ? <p className="text-xs text-muted">Assistant is typing…</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="h-9 rounded-full border border-border px-3 text-xs text-muted hover:text-fg"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about hours, location, or request an appointment"
          aria-label="Message"
        />
        <Button type="submit" disabled={pending || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
