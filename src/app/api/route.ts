// src/app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! });
const supa  = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,
);

/* shape of one row coming back from match_weekly_reports() */
interface MatchRow {
  employee_id: string;
  week_ending: string;
  answers_json: Record<string, unknown>;
  similarity: number;
}

export async function POST(req: NextRequest) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) {
    return NextResponse.json({ error: 'No question provided' }, { status: 400 });
  }

  /* 1. embed question */
  const qEmbedding = (
    await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    })
  ).data[0].embedding;

  /* 2. call the RPC (rows is still any[]) */
  const { data, error } = await supa.rpc(
    'match_weekly_reports',
    { query_embedding: qEmbedding, match_count: 5 },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as MatchRow[];        // rows is now typed

  /* 3. build context (note the explicit param type) */
  const context = rows
    .map((r: MatchRow) =>
      `Employee ${r.employee_id} (${r.week_ending}):\n` +
      JSON.stringify(r.answers_json),
    )
    .join('\n---\n');

  /* 4. ask GPT-4o */
  const chat = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'You are a concise operations advisor. Cite as (ID@date).',
      },
      { role: 'user', content: `${question}\n\nContext:\n${context}` },
    ],
  });

  const answer = (chat.choices[0].message.content ?? '').trim();

  return NextResponse.json({
    answer,
    sources: rows.map((r: MatchRow) => `${r.employee_id}@${r.week_ending}`),
  });
}
