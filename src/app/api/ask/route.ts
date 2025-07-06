// src/app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });

const supa = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,
);

/* row shape returned by match_weekly_reports() */
interface MatchRow {
  employee_id: string;
  week_ending: string;
  answers_json: Record<string, unknown>;
  similarity: number;
}

export async function POST(req: NextRequest) {
  /* ── 0. parse body ─────────────────────────────────────────────── */
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) {
    return NextResponse.json({ error: 'No question provided' }, { status: 400 });
  }

  /* ── 1. embed question ─────────────────────────────────────────── */
  const qEmbedding = (
    await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    })
  ).data[0].embedding;

  /* ── 2. top-5 similar weekly reports ───────────────────────────── */
  const { data, error } = await supa.rpc(
    'match_weekly_reports',
    { query_embedding: qEmbedding, match_count: 5 },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as MatchRow[];

  /* ── 3. fetch names for those employee IDs ─────────────────────── */
  const ids = [...new Set(rows.map(r => r.employee_id))];
  const { data: nameRows } = await supa
    .from('employees')
    .select('id, full_name')
    .in('id', ids);

  const nameMap = Object.fromEntries(
    (nameRows ?? []).map(n => [n.id, n.full_name || n.id]),
  );

  /* ── 4. build GPT context using names ──────────────────────────── */
  const context = rows
    .map(
      (r) =>
        `${nameMap[r.employee_id]} (${r.week_ending}):\n` +
        JSON.stringify(r.answers_json),
    )
    .join('\n---\n');

  /* ── 5. ask GPT-4o ─────────────────────────────────────────────── */
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content:
          'You are a concise operations advisor. Cite sources like (Name@date).',
      },
      { role: 'user', content: `${question}\n\nContext:\n${context}` },
    ],
  });

  const answer = (chat.choices[0].message.content ?? '').trim();

  /* ── 6. respond ───────────────────────────────────────────────── */
  return NextResponse.json({
    answer,
    sources: rows.map(
      (r) => `${nameMap[r.employee_id]}@${r.week_ending}`,
    ),
  });
}
