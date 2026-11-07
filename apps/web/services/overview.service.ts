import { transactionsService } from '@/services/contracts/transactions.service';
import { disputesService } from '@/services/contracts/disputes.service';
import type {OverviewSummaryData} from '@/features/overview/types';
export async function getOverviewSummary(): Promise<OverviewSummaryData> {
  const [transactions, cases] = await Promise.all([transactionsService.list(), disputesService.list()]);
  return { monthlySpendCents: transactions.items.filter(t => t.paymentStatus === 'PAID').reduce((sum,t) => sum+t.amountMinor,0), currency: 'USD', activeSubscriptions: 0, pendingApprovals: cases.items.filter(c=>c.stage==='AWAITING_CONSENT').length, openCases: cases.items.filter(c=>!['RESOLVED','CLOSED_NO_AGREEMENT'].includes(c.stage)).length };
}
