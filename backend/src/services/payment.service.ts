// backend/src/services/payment.service.ts
import { pool } from "..";

function getCommissionRate(completedCount: number): number {
  if (completedCount > 150) return 0.08;
  if (completedCount > 110) return 0.1;
  if (completedCount > 80) return 0.12;
  if (completedCount > 50) return 0.15;
  if (completedCount > 15) return 0.18;
  return 0.22;
}

export const PaymentService = {
  async processPayment(
    userId: string,
    jobId: string,
    method: string,
    discount?: number,
  ) {
    // mock response
    return {
      transactionId: `txn_${Date.now()}`,
      paymentUrl: `https://payment-gateway/mock/${jobId}`,
    };
  },

  async holdPayment(jobId: string, amount: number) {
    return true;
  },

  async releasePayment(jobId: string) {
    return true;
  },

  async refundPayment(jobId: string, userId: string, reason?: string) {
    return true;
  },

  async getPaymentStatus(jobId: string) {
    return {
      jobId,
      status: "paid",
      amount: 1000,
    };
  },

  async generateReceipt(jobId: string) {
    return `https://cdn.meerak.app/receipts/${jobId}.pdf`;
  },
};
export async function securePayService(params: {
  userId: string;
  jobId: string;
  method: "wallet" | "gateway";
}) {
  const { userId, jobId, method } = params;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock job
    const jobRes = await client.query(
      `SELECT * FROM jobs WHERE id = $1 FOR UPDATE`,
      [jobId],
    );

    if (jobRes.rowCount === 0) {
      throw new Error("Job not found");
    }

    const job = jobRes.rows[0];

    if (job.status === "completed") {
      throw new Error("Job already paid");
    }

    if (job.created_by !== userId) {
      throw new Error("Not your job");
    }

    if (!job.accepted_by) {
      throw new Error("Job has no provider");
    }

    // 2. Lock users
    const providerRes = await client.query(
      `SELECT * FROM users WHERE id = $1 FOR UPDATE`,
      [job.accepted_by],
    );

    const employerRes = await client.query(
      `SELECT * FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );

    if (providerRes.rowCount === 0 || employerRes.rowCount === 0) {
      throw new Error("User not found");
    }

    const provider = providerRes.rows[0];
    const employer = employerRes.rows[0];

    // 3. Wallet check
    if (method === "wallet" && employer.wallet_balance < job.price) {
      throw new Error("Insufficient wallet balance");
    }

    // 4. Calculate commission
    const feeRate = getCommissionRate(provider.completed_jobs_count || 0);
    const feeAmount = Number(job.price) * feeRate;
    const providerReceive = Number(job.price) - feeAmount;

    // 5. Deduct employer wallet
    if (method === "wallet") {
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1 
         WHERE id = $2`,
        [job.price, employer.id],
      );
    }

    // 6. Credit provider
    await client.query(
      `UPDATE users 
       SET wallet_balance = wallet_balance + $1,
           completed_jobs_count = completed_jobs_count + 1
       WHERE id = $2`,
      [providerReceive, provider.id],
    );

    // 7. Update job
    await client.query(
      `UPDATE jobs 
       SET status = 'completed',
           payment_status = 'paid',
           updated_at = NOW()
       WHERE id = $1`,
      [jobId],
    );

    // 8. Transaction record
    await client.query(
      `INSERT INTO transactions
       (user_id, type, amount, status, related_job_id, description, created_at)
       VALUES ($1, 'payment', $2, 'completed', $3, $4, NOW())`,
      [userId, job.price, jobId, `Payment for job ${job.title}`],
    );

    // 9. Company ledger
    await client.query(
      `INSERT INTO company_ledger
       (type, amount, description, created_at)
       VALUES ('revenue', $1, $2, NOW())`,
      [feeAmount, `Commission from job ${jobId}`],
    );

    await client.query("COMMIT");

    return {
      success: true,
      message: "Payment processed successfully",
      jobId,
      amount: job.price,
      providerReceive,
      platformFee: feeAmount,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
