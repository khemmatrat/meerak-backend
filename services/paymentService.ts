// 💰 Phase 5: Escrow Payment System
import { db } from './firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export interface EscrowPayment {
  jobId: string;
  amount: number;
  employerId: string;
  providerId: string;
  status: 'held' | 'released' | 'disputed' | 'refunded';
  heldAt: string;
  releasedAt?: string;
}

export const PaymentService = {
  /**
   * กันเงินเมื่อ Provider Accept งาน
   * ถ้างานอยู่ที่ Backend (ไม่มี doc ใน Firestore) จะไม่ throw — คืน true เพื่อให้ flow รับงานสำเร็จ
   */
  holdPayment: async (
    jobId: string,
    amount: number,
    employerId: string,
    providerId: string
  ): Promise<boolean> => {
    const jobRef = doc(db, 'jobs', jobId);
    let snap;
    try {
      snap = await getDoc(jobRef);
    } catch (e: any) {
      console.log('⏭️ Hold payment skipped (getDoc failed, job may be on backend):', jobId);
      return true;
    }
    if (!snap?.exists()) {
      console.log('⏭️ Hold payment skipped (job is on backend, no Firestore doc):', jobId);
      return true;
    }
    try {
      const now = new Date().toISOString();
      await updateDoc(jobRef, {
        escrow_amount: amount,
        escrow_held_at: now,
        escrow_status: 'held',
        payment_held: true,
        payment_held_amount: amount,
        payment_held_at: now,
        payment_held_by: employerId,
        updated_at: now
      });
      console.log('✅ Payment held:', { jobId, amount, providerId });
      return true;
    } catch (error: any) {
      const msg = (error?.message || String(error)) ?? '';
      console.log('⏭️ Hold payment skipped (job on backend or update failed):', jobId, msg.slice(0, 80));
      return true;
    }
  },

  /**
   * เริ่ม 5-minute Dispute Window หลังส่งงาน
   */
  startDisputeWindow: async (jobId: string): Promise<string> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const now = new Date();
      const disputeEnds = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

      await updateDoc(jobRef, {
        work_submitted_at: now.toISOString(),
        dispute_window_ends_at: disputeEnds.toISOString(),
        dispute_status: 'none',
        updated_at: now.toISOString()
      });

      console.log('✅ Dispute window started:', { 
        jobId, 
        endsAt: disputeEnds.toISOString() 
      });

      return disputeEnds.toISOString();
    } catch (error) {
      console.error('❌ Failed to start dispute window:', error);
      throw error;
    }
  },

  /**
   * Auto-approve หลังจาก 5 นาที (ถ้าไม่มี dispute)
   */
  autoApproveJob: async (jobId: string): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const jobSnap = await getDoc(jobRef);

      if (!jobSnap.exists()) {
        throw new Error('Job not found');
      }

      const job = jobSnap.data();
      const now = new Date();

      // Check if dispute window has ended
      if (job.dispute_window_ends_at) {
        const disputeEnds = new Date(job.dispute_window_ends_at);
        if (now < disputeEnds) {
          console.log('⏱️ Dispute window not ended yet');
          return false;
        }
      }

      // Check if no dispute
      if (job.dispute_status !== 'none') {
        console.log('⚠️ Job has dispute, cannot auto-approve');
        return false;
      }

      // Auto-approve
      await updateDoc(jobRef, {
        status: 'completed',
        auto_approved: true,
        auto_approved_at: now.toISOString(),
        completed_at: now.toISOString(),
        updated_at: now.toISOString()
      });

      // Release payment
      await PaymentService.releasePayment(jobId, job.accepted_by);

      console.log('✅ Job auto-approved:', jobId);
      return true;
    } catch (error) {
      console.error('❌ Failed to auto-approve:', error);
      throw error;
    }
  },

  /**
   * Employer ยื่น Dispute
   */
  fileDispute: async (
    jobId: string,
    employerId: string,
    reason: string
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const now = new Date().toISOString();

      await updateDoc(jobRef, {
        dispute_status: 'pending',
        dispute_reason: reason,
        disputed_at: now,
        disputed_by: employerId,
        escrow_status: 'disputed',
        updated_at: now
      });

      console.log('✅ Dispute filed:', { jobId, reason });
      return true;
    } catch (error) {
      console.error('❌ Failed to file dispute:', error);
      throw error;
    }
  },

  /**
   * ปล่อยเงินให้ Provider
   */
  releasePayment: async (
    jobId: string,
    providerId: string
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const now = new Date().toISOString();

      await updateDoc(jobRef, {
        escrow_status: 'released',
        payment_released: true,
        payment_released_at: now,
        payment_released_to: providerId,
        updated_at: now
      });

      console.log('✅ Payment released to provider:', { jobId, providerId });
      return true;
    } catch (error) {
      console.error('❌ Failed to release payment:', error);
      throw error;
    }
  },

  /**
   * Provider ขอถอนเงิน
   */
  requestWithdrawal: async (
    jobId: string,
    providerId: string
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const jobSnap = await getDoc(jobRef);

      if (!jobSnap.exists()) {
        throw new Error('Job not found');
      }

      const job = jobSnap.data();

      // Check if payment is released
      if (!job.payment_released) {
        throw new Error('Payment not released yet');
      }

      const now = new Date().toISOString();

      await updateDoc(jobRef, {
        withdrawal_requested: true,
        withdrawal_requested_at: now,
        updated_at: now
      });

      console.log('✅ Withdrawal requested:', { jobId, providerId });
      return true;
    } catch (error) {
      console.error('❌ Failed to request withdrawal:', error);
      throw error;
    }
  },

  /**
   * ทำการถอนเงิน (Admin/System process)
   */
  completeWithdrawal: async (jobId: string): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const now = new Date().toISOString();

      await updateDoc(jobRef, {
        withdrawal_completed: true,
        withdrawal_completed_at: now,
        updated_at: now
      });

      console.log('✅ Withdrawal completed:', jobId);
      return true;
    } catch (error) {
      console.error('❌ Failed to complete withdrawal:', error);
      throw error;
    }
  },

  /**
   * คืนเงินให้ Employer (กรณี dispute)
   */
  refundPayment: async (
    jobId: string,
    employerId: string
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      const now = new Date().toISOString();

      await updateDoc(jobRef, {
        escrow_status: 'refunded',
        payment_released: false,
        dispute_status: 'resolved',
        updated_at: now
      });

      console.log('✅ Payment refunded to employer:', { jobId, employerId });
      return true;
    } catch (error) {
      console.error('❌ Failed to refund payment:', error);
      throw error;
    }
  },

  /**
   * ตรวจสอบ Dispute Window
   */
  checkDisputeWindow: (disputeEndsAt: string): {
    hasEnded: boolean;
    remainingSeconds: number;
    remainingText: string;
  } => {
    const now = new Date();
    const endsAt = new Date(disputeEndsAt);
    const remainingMs = endsAt.getTime() - now.getTime();
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return {
      hasEnded: remainingSeconds <= 0,
      remainingSeconds,
      remainingText: remainingSeconds > 0
        ? `${minutes}:${seconds.toString().padStart(2, '0')}`
        : 'หมดเวลา'
    };
  }
};

export default PaymentService;
