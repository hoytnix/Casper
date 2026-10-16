import { NextRequest, NextResponse } from 'next/server';
import { TokenCostRecord, TokenCostSummary } from '@/types';
import { z } from 'zod';
import { calculateTokenCostSummary } from '@/lib/finance-calculations';

const createTokenRecordSchema = z.object({
  repoName: z.string().trim().min(1, 'Repository name is required'),
  modelName: z.string().trim().min(1, 'Model name is required'),
  inputTokens: z.coerce.number().nonnegative('Input tokens must be >= 0'),
  outputTokens: z.coerce.number().nonnegative('Output tokens must be >= 0'),
  totalCostUsd: z.coerce.number().nonnegative('Total cost must be >= 0'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted YYYY-MM-DD'),
  notes: z.string().optional(),
});

// Seed data simulating realistic Gemini prompt compilation and agentic exploration token costs over time
let mockTokenRecords: TokenCostRecord[] = [
  { id: 'tok-1', repoName: 'facebook/react', modelName: 'gemini-4-argon', inputTokens: 52400, outputTokens: 8900, totalCostUsd: 0.2850, date: '2026-05-01', notes: 'Initial Agentic exploration & compilation' },
  { id: 'tok-2', repoName: 'vercel/next.js', modelName: 'gemini-2.5-pro', inputTokens: 142000, outputTokens: 18500, totalCostUsd: 1.1450, date: '2026-05-03', notes: 'Server Actions & App Router optimization prompt' },
  { id: 'tok-3', repoName: 'tailwindlabs/tailwindcss', modelName: 'gemini-3.8-flash', inputTokens: 18500, outputTokens: 3200, totalCostUsd: 0.0430, date: '2026-05-05', notes: 'Quick styling prompt generation' },
  { id: 'tok-4', repoName: 'shadcn/ui', modelName: 'gemini-3.6-flash', inputTokens: 35000, outputTokens: 7100, totalCostUsd: 0.0980, date: '2026-05-08', notes: 'Component system refactor choreography' },
  { id: 'tok-5', repoName: 'vercel/next.js', modelName: 'gemini-4-argon', inputTokens: 98000, outputTokens: 14200, totalCostUsd: 0.5420, date: '2026-05-12', notes: 'Multi-step agentic graph verification' },
  { id: 'tok-6', repoName: 'facebook/react', modelName: 'gemini-3.5-flash-lite', inputTokens: 15000, outputTokens: 2500, totalCostUsd: 0.0220, date: '2026-05-15', notes: 'Quick Q&A codebase question (BTW mode)' },
  { id: 'tok-7', repoName: 'vercel/next.js', modelName: 'gemini-2.5-pro', inputTokens: 165000, outputTokens: 21000, totalCostUsd: 1.3400, date: '2026-05-18', notes: 'Full deep architecture prompt compilation' },
  { id: 'tok-8', repoName: 'supabase/supabase', modelName: 'gemini-4-argon', inputTokens: 74000, outputTokens: 11500, totalCostUsd: 0.4120, date: '2026-05-22', notes: 'Database schema & RLS policy generation' },
  { id: 'tok-9', repoName: 'shadcn/ui', modelName: 'gemini-3.8-flash', inputTokens: 29000, outputTokens: 5400, totalCostUsd: 0.0680, date: '2026-05-25', notes: 'Idea mode feature ideation (77 ideas RICE)' },
  { id: 'tok-10', repoName: 'vercel/next.js', modelName: 'gemini-4-argon', inputTokens: 112000, outputTokens: 16800, totalCostUsd: 0.6240, date: '2026-05-28', notes: 'Final production build & verification prompt' },
];

export async function GET() {
  try {
    const summary = calculateTokenCostSummary(mockTokenRecords);
    return NextResponse.json({
      transactions: mockTokenRecords, // For backwards compatibility with any fetcher expecting transactions
      tokenRecords: mockTokenRecords,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch token cost records' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Support either direct token cost payload or legacy transaction payload
    const payload = {
      repoName: body.repoName || body.title || 'Custom/Manual Prompt',
      modelName: body.modelName || body.category || 'gemini-4-argon',
      inputTokens: body.inputTokens !== undefined ? body.inputTokens : Math.round((body.amount || 10) * 1000),
      outputTokens: body.outputTokens !== undefined ? body.outputTokens : Math.round((body.amount || 10) * 200),
      totalCostUsd: body.totalCostUsd !== undefined ? body.totalCostUsd : (body.amount || 0.1),
      date: body.date || new Date().toISOString().split('T')[0],
      notes: body.notes || body.title,
    };

    const parsed = createTokenRecordSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { repoName, modelName, inputTokens, outputTokens, totalCostUsd, date, notes } = parsed.data;

    const newRecord: TokenCostRecord = {
      id: `tok-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      repoName,
      modelName,
      inputTokens,
      outputTokens,
      totalCostUsd,
      date,
      notes,
      title: repoName,
      amount: totalCostUsd,
      category: modelName,
      type: 'expense',
    };

    mockTokenRecords.unshift(newRecord);
    const summary = calculateTokenCostSummary(mockTokenRecords);

    return NextResponse.json({
      success: true,
      transaction: newRecord,
      tokenRecord: newRecord,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add token cost record' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing token record id' }, { status: 400 });
    }

    mockTokenRecords = mockTokenRecords.filter((r) => r.id !== id);
    const summary = calculateTokenCostSummary(mockTokenRecords);

    return NextResponse.json({
      success: true,
      deletedId: id,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete token record' },
      { status: 500 }
    );
  }
}
