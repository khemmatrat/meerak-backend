// ⭐ Phase 6: Rating & Reviews System
import { db } from './firebase';
import { api } from './api';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  increment,
  Timestamp 
} from 'firebase/firestore';
import { Review, UserRating } from '../types';

export const ReviewService = {
  /**
   * ส่งรีวิว (Mandatory หลังงานเสร็จ) — บันทึกลง PostgreSQL เป็นหลัก + Firestore สำหรับ backward compatibility
   */
  submitReview: async (review: Omit<Review, 'id' | 'created_at'>): Promise<string> => {
    try {
      // 1. บันทึกลง Backend (PostgreSQL) เป็นหลัก — รองรับ average_rating, review_count
      const { data } = await api.post<{ success?: boolean; review_id?: string; error?: string }>('/reviews', {
        job_id: review.job_id,
        reviewee_id: review.reviewee_id,
        rating_overall: review.rating,
        rating_quality: review.rating,
        rating_punctuality: review.rating,
        rating_attitude: review.rating,
        rating_cleanliness: review.rating,
        rating_communication: review.rating,
        tags: review.tags || [],
        comment: review.comment || '',
      });
      if (data?.error) throw new Error(data.error);
      const pgReviewId = (data as any)?.review_id || '';

      // 2. บันทึก Firestore สำหรับ backward compatibility
      const reviewRef = doc(collection(db, 'reviews'));
      const reviewData: Review = {
        ...review,
        id: reviewRef.id,
        created_at: new Date().toISOString(),
        is_verified_job: true
      };
      await setDoc(reviewRef, reviewData);

      const jobRef = doc(db, 'jobs', review.job_id);
      await updateDoc(jobRef, {
        has_reviewed: true,
        reviewed_at: new Date().toISOString()
      }).catch(() => {});

      await ReviewService.updateUserRating(review.reviewee_id, review.rating).catch(() => {});

      console.log('✅ Review submitted (PostgreSQL + Firestore):', pgReviewId || reviewRef.id);
      return pgReviewId || reviewRef.id;
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'ส่งรีวิวไม่สำเร็จ';
      console.error('❌ Failed to submit review:', error);
      throw new Error(msg);
    }
  },

  /**
   * ส่งทิป (Optional) — โอนเงินจริงจาก Wallet ผ่าน Backend API
   * รองรับทั้งบัญชี Demo (Apple Review) และบัญชีทั่วไป
   */
  sendTip: async (
    jobId: string,
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Promise<{ success: true; employer_wallet_balance?: number; employer_wallet_pending?: number }> => {
    try {
      const { data } = await api.post<{
        success?: boolean;
        error?: string;
        employer_wallet_balance?: number;
        employer_wallet_pending?: number;
      }>('/payments/tip', {
        job_id: jobId,
        to_user_id: toUserId,
        amount,
      });
      if (data?.error) throw new Error(data.error);
      console.log('✅ Tip sent (real wallet):', { jobId, amount });
      return {
        success: true,
        employer_wallet_balance: data?.employer_wallet_balance,
        employer_wallet_pending: data?.employer_wallet_pending,
      };
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'ส่งทิปไม่สำเร็จ';
      console.error('❌ Failed to send tip:', error);
      throw new Error(msg);
    }
  },

  /**
   * อัปเดทคะแนนเฉลี่ยของ User
   */
  updateUserRating: async (userId: string, newRating: number): Promise<void> => {
    try {
      const ratingRef = doc(db, 'user_ratings', userId);
      const ratingSnap = await getDoc(ratingRef);

      if (ratingSnap.exists()) {
        // Update existing rating
        const currentData = ratingSnap.data() as UserRating;
        const totalReviews = currentData.total_reviews + 1;
        const newAverage = 
          (currentData.average_rating * currentData.total_reviews + newRating) / totalReviews;

        // Update star breakdown
        const breakdown = { ...currentData.rating_breakdown };
        if (newRating === 5) breakdown.five_star++;
        else if (newRating === 4) breakdown.four_star++;
        else if (newRating === 3) breakdown.three_star++;
        else if (newRating === 2) breakdown.two_star++;
        else if (newRating === 1) breakdown.one_star++;

        await updateDoc(ratingRef, {
          average_rating: parseFloat(newAverage.toFixed(2)),
          total_reviews: totalReviews,
          rating_breakdown: breakdown,
          updated_at: new Date().toISOString()
        });
      } else {
        // Create new rating
        const newRatingData: UserRating = {
          user_id: userId,
          user_type: 'provider', // TODO: Get from user data
          average_rating: newRating,
          total_reviews: 1,
          total_jobs_completed: 1,
          rating_breakdown: {
            five_star: newRating === 5 ? 1 : 0,
            four_star: newRating === 4 ? 1 : 0,
            three_star: newRating === 3 ? 1 : 0,
            two_star: newRating === 2 ? 1 : 0,
            one_star: newRating === 1 ? 1 : 0
          },
          recent_reviews: [],
          updated_at: new Date().toISOString()
        };

        await setDoc(ratingRef, newRatingData);
      }

      console.log('✅ User rating updated:', userId);
    } catch (error) {
      console.error('❌ Failed to update user rating:', error);
      throw error;
    }
  },

  /**
   * ดึงข้อมูลคะแนนของ User
   */
  getUserRating: async (userId: string): Promise<UserRating | null> => {
    try {
      const ratingRef = doc(db, 'user_ratings', userId);
      const ratingSnap = await getDoc(ratingRef);

      if (ratingSnap.exists()) {
        return ratingSnap.data() as UserRating;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to get user rating:', error);
      return null;
    }
  },

  /**
   * ดึงรีวิวของ User (สำหรับแสดงในโปรไฟล์)
   */
  getUserReviews: async (
    userId: string, 
    limitCount: number = 10
  ): Promise<Review[]> => {
    try {
      const reviewsRef = collection(db, 'reviews');
      const q = query(
        reviewsRef,
        where('reviewee_id', '==', userId),
        orderBy('created_at', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Review);
    } catch (error) {
      console.error('❌ Failed to get user reviews:', error);
      return [];
    }
  },

  /**
   * ตรวจสอบว่า User รีวิว Job นี้แล้วหรือยัง — ใช้ Backend (PostgreSQL) เป็นหลัก
   */
  hasReviewed: async (jobId: string, reviewerId: string): Promise<boolean> => {
    try {
      const { data } = await api.get<{ has_reviewed?: boolean }>(`/jobs/${jobId}/reviews/me`);
      return !!data?.has_reviewed;
    } catch (e) {
      try {
        const reviewsRef = collection(db, 'reviews');
        const q = query(
          reviewsRef,
          where('job_id', '==', jobId),
          where('reviewer_id', '==', reviewerId),
          limit(1)
        );
        const snapshot = await getDocs(q);
        return !snapshot.empty;
      } catch (error) {
        console.error('❌ Failed to check review status:', error);
        return false;
      }
    }
  },

  /**
   * ดึงรายการ job_id ที่ผู้ใช้ (นายจ้าง) รีวิวแล้ว — batch จาก PostgreSQL
   * คืน null เมื่อ API ล้มเหลว (ให้ UI ใช้ has_reviewed จากลิสต์ + localStorage แทน)
   */
  fetchEmployerReviewedJobIds: async (
    jobIds: string[]
  ): Promise<string[] | null> => {
    const unique = [...new Set(jobIds.map(String))].filter(Boolean).slice(0, 80);
    if (!unique.length) return [];
    try {
      const { data } = await api.get<{ reviewed_job_ids?: string[] }>(
        "/jobs/reviews/me-batch",
        { params: { job_ids: unique.join(",") } }
      );
      return Array.isArray(data?.reviewed_job_ids)
        ? data.reviewed_job_ids.map(String)
        : [];
    } catch (e) {
      console.warn("fetchEmployerReviewedJobIds:", e);
      return null;
    }
  },

  /**
   * คำนวณคะแนนเฉลี่ยจากรีวิว
   */
  calculateAverageRating: (reviews: Review[]): number => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return parseFloat((sum / reviews.length).toFixed(1));
  },

  /**
   * ดึง Top Tags จากรีวิว
   */
  getTopTags: (reviews: Review[], topN: number = 3): string[] => {
    const tagCounts: Record<string, number> = {};
    
    reviews.forEach(review => {
      review.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([tag]) => tag);
  }
};

export default ReviewService;
