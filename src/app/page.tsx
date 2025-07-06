'use client';

import { useState } from 'react';

interface ChatTurn {
  q: string;
  answer: string;
  sources: string[];
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      const data = (await res.json()) as {
        answer?: string;
        sources?: string[];
        error?: string;
      };

      setLog((prev) => [
        ...prev,
        {
          q,
          answer: data.answer ?? data.error ?? 'No response',
          sources: data.sources ?? [],
        },
      ]);
    } catch (err) {
      console.error(err);
      setLog((prev) => [
        ...prev,
        { q, answer: 'Network error.', sources: [] },
      ]);
    } finally {
      setQuery('');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">Team&nbsp;Assistant&nbsp;MVP</h1>

      <textarea
        className="w-full h-24 border p-2 rounded"
        placeholder="Ask a question…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <button
        onClick={ask}
        disabled={loading}
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Thinking…' : 'Ask'}
      </button>

      <section className="mt-8 space-y-6">
        {log.map(({ q, answer, sources }, i) => (
          <div key={i} className="border rounded p-4">
            <p className="font-semibold">You: {q}</p>
            <p className="mt-2 whitespace-pre-line">{answer}</p>
            {!!sources.length && (
              <p className="text-sm text-gray-500 mt-1">
                Sources: {sources.join(', ')}
              </p>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
