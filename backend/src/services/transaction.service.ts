// backend/src/services/transaction.service.ts
export const TransactionService = {
  async getUserTransactions(
    userId: string,
    limit: number,
    offset: number
  ) {
    return {
      userId,
      limit,
      offset,
      total: 1,
      transactions: [
        {
          id: `txn_${Date.now()}`,
          amount: 1000,
          status: 'completed',
          created_at: new Date().toISOString()
        }
      ]
    };
  }
};
