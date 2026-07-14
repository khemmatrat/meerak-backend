// 🗺️ Real-time Location Tracking Service
import { db } from './firebase';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, orderBy, limit, Unsubscribe, updateDoc } from 'firebase/firestore';

export interface ProviderLocation {
  provider_id: string;
  job_id: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  accuracy: number;
  timestamp: string;
  status: 'moving' | 'stopped' | 'arrived';
}

export const LocationService = {
  /**
   * บันทึกตำแหน่งปัจจุบันของ Provider ลง Firebase
   */
  updateProviderLocation: async (
    providerId: string,
    jobId: string,
    position: GeolocationPosition
  ): Promise<void> => {
    try {
      const locationData: ProviderLocation = {
        provider_id: providerId,
        job_id: jobId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: position.coords.heading || 0,
        speed: position.coords.speed || 0,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString(),
        status: position.coords.speed > 1 ? 'moving' : 'stopped'
      };

      // บันทึกลง collection provider_locations
      await setDoc(
        doc(db, 'provider_locations', `${providerId}_${jobId}`),
        locationData
      );

      console.log('✅ Provider location updated:', locationData);
    } catch (error) {
      console.error('❌ Failed to update provider location:', error);
      throw error;
    }
  },

  /**
   * ติดตามตำแหน่งของ Provider แบบ real-time
   */
  subscribeToProviderLocation: (
    providerId: string,
    jobId: string,
    callback: (location: ProviderLocation | null) => void
  ): Unsubscribe => {
    console.log('🔔 Subscribing to provider location:', providerId, jobId);

    const docRef = doc(db, 'provider_locations', `${providerId}_${jobId}`);

    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as ProviderLocation;
          console.log('📍 Provider location updated:', data);
          callback(data);
        } else {
          console.log('⚠️ No location data found');
          callback(null);
        }
      },
      (error) => {
        console.error('❌ Error subscribing to provider location:', error);
      }
    );
  },

  /**
   * เริ่มติดตามตำแหน่งของ Provider (เรียกใช้ฝั่ง Provider)
   */
  startTracking: (
    providerId: string,
    jobId: string,
    onError?: (error: GeolocationPositionError) => void
  ): number | null => {
    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported');
      return null;
    }

    console.log('🚀 Starting location tracking for provider:', providerId);

    // ใช้ watchPosition เพื่อติดตามตำแหน่งแบบ real-time
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        LocationService.updateProviderLocation(providerId, jobId, position)
          .catch((error) => console.error('Failed to update location:', error));
      },
      (error) => {
        console.error('❌ Geolocation error:', error);
        if (onError) onError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return watchId;
  },

  /**
   * หยุดติดตามตำแหน่ง
   */
  stopTracking: (watchId: number): void => {
    if (navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      console.log('🛑 Location tracking stopped');
    }
  },

  /**
   * คำนวณระยะทางระหว่าง 2 จุด (Haversine formula)
   */
  calculateDistance: (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * คำนวณเวลาโดยประมาณ (ETA)
   */
  calculateETA: (
    distanceKm: number,
    avgSpeedKmh: number = 40
  ): string => {
    const hours = distanceKm / avgSpeedKmh;
    const minutes = Math.round(hours * 60);
    
    if (minutes < 60) {
      return `${minutes} นาที`;
    } else {
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hrs} ชม. ${mins} นาที`;
    }
  },

  /**
   * อัปเดตสถานะ Provider (arrived, moving, etc.)
   */
  updateProviderStatus: async (
    providerId: string,
    jobId: string,
    status: 'moving' | 'stopped' | 'arrived'
  ): Promise<void> => {
    try {
      const docId = `${providerId}_${jobId}`;
      const locationRef = doc(db, 'provider_locations', docId);
      
      // Try to get current location data
      const locationSnap = await getDoc(locationRef);
      
      if (locationSnap.exists()) {
        await updateDoc(locationRef, {
          status,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Provider status updated to:', status);
      } else {
        console.warn('⚠️ Location document does not exist, creating with status:', status);
        // Create new document if doesn't exist
        await setDoc(locationRef, {
          provider_id: providerId,
          job_id: jobId,
          status,
          timestamp: new Date().toISOString(),
          lat: 0,
          lng: 0,
          heading: 0,
          speed: 0,
          accuracy: 0
        });
      }
    } catch (error) {
      console.error('❌ Failed to update provider status:', error);
      throw error;
    }
  }
};

export default LocationService;
