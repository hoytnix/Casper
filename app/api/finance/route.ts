import { NextRequest, NextResponse } from 'next/server';
import { Transaction, SpendingSummary } from '@/types';
import { z } from 'zod';

const createTransactionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category: z.string().trim().min(1, 'Category is required'),
  type: z.enum(['expense', 'income']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted YYYY-MM-DD'),
  notes: z.string().optional(),
});

// Seed data simulating realistic cloud, software, infrastructure and revenue cash flow
let mockTransactions: Transaction[] = [
  { id: 'tx-1', title: 'Cloud Hosting (AWS)', amount: 145.50, category: 'Infrastructure', type: 'expense', date: '2026-05-01', notes: 'Production cluster ECS & RDS' },
  { id: 'tx-2', title: 'Client Enterprise Retainer', amount: 4800.00, category: 'Revenue', type: 'income', date: '2026-05-03', notes: 'Monthly Next.js architectural retainer' },
  { id: 'tx-3', title: 'Vercel Pro Team', amount: 60.00, category: 'Software', type: 'expense', date: '2026-05-05', notes: 'Hosting edge functions & analytics' },
  { id: 'tx-4', title: 'OpenAI & Anthropic API', amount: 210.40, category: 'Infrastructure', type: 'expense', date: '2026-05-08', notes: 'Inference token usage' },
  { id: 'tx-5', title: 'Figma Organization', amount: 45.00, category: 'Software', type: 'expense', date: '2026-05-11', notes: 'Design workspace' },
  { id: 'tx-6', title: 'GitHub Enterprise Suite', amount: 84.00, category: 'Software', type: 'expense', date: '2026-05-14', notes: 'Team seats & CI/CD minutes' },
  { id: 'tx-7', title: 'Contract UI Designer', amount: 1250.00, category: 'Personnel', type: 'expense', date: '2026-05-18', notes: 'Dashboard component library sprint' },
  { id: 'tx-8', title: 'Consulting Advisory Services', amount: 3200.00, category: 'Revenue', type: 'income', date: '2026-05-20', notes: 'Performance optimization workshop' },
  { id: 'tx-9', title: 'Supabase Database Scale', amount: 75.00, category: 'Infrastructure', type: 'expense', date: '2026-05-22', notes: 'PostgreSQL compute add-ons' },
  { id: 'tx-10', title: 'Hardware Security Keys', amount: 120.00, category: 'Hardware', type: 'expense', date: '2026-05-25', notes: 'YubiKeys for engineering team' },
  { id: 'tx-11', title: 'Domain Registrations (Cloudflare)', amount: 36.00, category: 'Infrastructure', type: 'expense', date: '2026-05-28', notes: 'Domain annual renewals' },
];

function buildSummary(txList: Transaction[]): SpendingSummary {
  const totalSpent = txList
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncome = txList
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const byCategory: Record<string, number> = {};
  txList
    .filter((t) => t.type === 'expense')
    .forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

  // Aggregate daily expenses and incomes for chronological trend graph
  const dailyMap: Record<string, { expense: number; income: number }> = {};
  txList.forEach((t) => {
    if (!dailyMap[t.date]) {
      dailyMap[t.date] = { expense: 0, income: 0 };
    }
    if (t.type === 'expense') {
      dailyMap[t.date].expense += t.amount;
    } else {
      dailyMap[t.date].income += t.amount;
    }
  });

  const sortedDates = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));
  const historicalTrend = sortedDates.map((date) => ({
    date,
    amount: dailyMap[date].expense,
    expenseAmount: dailyMap[date].expense,
    incomeAmount: dailyMap[date].income,
  }));

  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    netBalance: Math.round((totalIncome - totalSpent) * 100) / 100,
    byCategory,
    historicalTrend,
  };
}

export async function GET() {
  try {
    const summary = buildSummary(mockTransactions);
    return NextResponse.json({
      transactions: mockTransactions,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch financial data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { title, amount, category, type, date, notes } = parsed.data;

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      amount,
      category,
      type,
      date,
      notes,
    };

    // Prepend new transaction
    mockTransactions.unshift(newTx);

    const summary = buildSummary(mockTransactions);

    return NextResponse.json({
      success: true,
      transaction: newTx,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add transaction' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
    }

    mockTransactions = mockTransactions.filter((t) => t.id !== id);
    const summary = buildSummary(mockTransactions);

    return NextResponse.json({
      success: true,
      deletedId: id,
      summary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
