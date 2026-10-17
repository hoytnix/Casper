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

let mockTokenRecords: TokenCostRecord[] = [];

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
