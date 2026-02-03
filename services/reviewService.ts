// ⭐ Phase 6: Rating & Reviews System
import { db } from './firebase';
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
   * ส่งรีวิว (Mandatory หลังงานเสร็จ)
   */
  submitReview: async (review: Omit<Review, 'id' | 'created_at'>): Promise<string> => {
    try {
      const reviewRef = doc(collection(db, 'reviews'));
      const reviewData: Review = {
        ...review,
        id: reviewRef.id,
        created_at: new Date().toISOString(),
        is_verified_job: true
      };

      await setDoc(reviewRef, reviewData);
      
      // Update job: mark as reviewed
      const jobRef = doc(db, 'jobs', review.job_id);
      await updateDoc(jobRef, {
        has_reviewed: true,
        reviewed_at: new Date().toISOString()
      });

      // Update user rating
      await ReviewService.updateUserRating(review.reviewee_id, review.rating);

      console.log('✅ Review submitted:', reviewRef.id);
      return reviewRef.id;
    } catch (error) {
      console.error('❌ Failed to submit review:', error);
      throw error;
    }
  },

  /**
   * ส่งทิป (Optional)
   */
  sendTip: async (
    jobId: string,
    fromUserId: string,
    toUserId: string,
    amount: number
  ): Promise<boolean> => {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      await updateDoc(jobRef, {
        tips_amount: amount,
        tipped_by: fromUserId,
        tipped_to: toUserId,
        tipped_at: new Date().toISOString()
      });

      console.log('✅ Tip sent:', { jobId, amount });
      return true;
    } catch (error) {
      console.error('❌ Failed to send tip:', error);
      throw error;
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
   * ตรวจสอบว่า User รีวิว Job นี้แล้วหรือยัง
   */
  hasReviewed: async (jobId: string, reviewerId: string): Promise<boolean> => {
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
