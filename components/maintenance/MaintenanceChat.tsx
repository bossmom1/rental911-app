'use client';

import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import type { ChatSenderRole, MaintenanceChat } from '@/types/database';
import { Button } from '@/components/ui/Button';

const roleStyle: Record<string, string> = {
  tenant: 'bg-light-blue/40 text-navy',
  landlord: 'bg-navy text-white',
  admin: 'bg-gold text-navy',
  system: 'bg-gray-100 text-ink italic',
};

export function MaintenanceChat({
  requestId,
  currentUserId,
  currentRole,
  initialMessages,
  readOnly = false,
}: {
  requestId: string;
  currentUserId: string;
  currentRole: ChatSenderRole;
  initialMessages: MaintenanceChat[];
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState<MaintenanceChat[]>(initialMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Live updates for all participants (falls back gracefully if realtime is off).
  useEffect(() => {
    const channel = supabase
      .channel(`maint-chat-${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'maintenance_chat',
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const row = payload.new as MaintenanceChat;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, supabase]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from('maintenance_chat')
      .insert({
        request_id: requestId,
        sender_id: currentUserId,
        sender_role: currentRole,
        message: body,
      })
      .select()
      .single();
    setSending(false);
    if (error) {
      alert(`Could not send message: ${error.message}`);
      return;
    }
    if (data) {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data]
      );
    }
    setText('');
  }

  return (
    <div className="flex flex-col rounded-xl border border-light-blue/60 bg-white">
      <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-ink/60">
            No messages yet. Start the conversation below.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  roleStyle[m.sender_role ?? 'system'] ?? 'bg-gray-100'
                }`}
              >
                <p className="font-display text-base font-bold capitalize opacity-90">
                  {m.sender_role}
                </p>
                <p className="whitespace-pre-wrap">{m.message}</p>
                <p className="mt-1 text-base opacity-70">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!readOnly && (
        <form onSubmit={send} className="flex gap-2 border-t border-light-blue/60 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-light-blue px-3 py-2.5 outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
          />
          <Button type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </form>
      )}
    </div>
  );
}
