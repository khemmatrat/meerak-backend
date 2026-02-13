import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  serverTimestamp, 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// --- Type Definitions ---
interface InputData {
  name: string;
  idNumber: string;
  dob: string;
}

interface FilesState {
  id_front: File | null;
  id_back: File | null;
  selfie: File | null;
}

type KycStatus = 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'FAILED';


// --- Global Variables and Constants (MANDATORY for Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'kyc-app-default';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
// API_ENDPOINT จะต้องชี้ไปที่ Firebase HTTPS Cloud Function ที่ชื่อว่า kycApi
const API_ENDPOINT = '/api/kycApi'; 

// Initialize Firebase services
let app: any, auth: any, db: any, storage: any;
let authReady: boolean = false;

if (Object.keys(firebaseConfig).length > 0) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (e) {
    console.error("Error initializing Firebase:", e);
  }
}

// Custom hook for exponential backoff (retry logic)
const useExponentialBackoff = () => {
  const MAX_RETRIES = 5;
  const initialDelay = 1000; // 1 second

  const fetchWithRetry = useCallback(async (url: string, options: RequestInit) => {
    let delay = initialDelay;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          // Attempt to read error message if available
          const errorBody = await response.json().catch(() => ({ error: 'Unknown server error' }));
          throw new Error(`HTTP error! status: ${response.status} - ${errorBody.error || response.statusText}`);
        }
        return response;
      } catch (error) {
        if (i < MAX_RETRIES - 1) {
          console.warn(`Request failed. Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          console.error("All retries failed.", error);
          throw error;
        }
      }
    }
    // Should not reach here, but TypeScript needs a return path
    throw new Error("Maximum retry attempts exceeded.");
  }, [initialDelay, MAX_RETRIES]);
  return fetchWithRetry;
};


// Function to simulate file upload to Storage and get a download URL
const simulateFileUpload = async (file: File, userId: string, fileName: string) => {
  if (!storage) {
    console.error("Firebase Storage not initialized.");
    return { storagePath: `mock/${userId}/${fileName}`, downloadURL: `https://mock.storage/${userId}/${fileName}` };
  }
  
  // Real implementation: Upload file to Storage
  const storagePath = `artifacts/${appId}/users/${userId}/kyc_docs/${fileName}_${Date.now()}`;
  const storageRef = ref(storage, storagePath);
  
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  
  return { storagePath, downloadURL };
};

// Main React Component
const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>('PENDING'); // PENDING, PROCESSING, VERIFIED, FAILED
  const [message, setMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [files, setFiles] = useState<FilesState>({
    id_front: null,
    id_back: null,
    selfie: null,
  });
  const [inputData, setInputData] = useState<InputData>({
    name: 'สมชาย รักชาติ',
    idNumber: '1100100000000',
    dob: '1985-01-01',
  });
  
  const fetchWithRetry = useExponentialBackoff();
  
  // 1. Authentication and Firestore Listener
  useEffect(() => {
    if (!auth || !db) return;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        authReady = true;
        
        // Setup Real-time Listener for KYC status
        const kycDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/kyc_data`, 'status');
        
        onSnapshot(kycDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setKycStatus(data.status as KycStatus || 'PENDING');
            setMessage(data.message || '');
            setIsLoading(data.status === 'PROCESSING');
          } else {
            // Initialize document if it doesn't exist
            setDoc(kycDocRef, { status: 'PENDING', message: 'กรุณาเริ่มต้นการยืนยันตัวตน', createdAt: serverTimestamp() }, { merge: true });
            setKycStatus('PENDING');
          }
        });

      } else {
        // Sign in anonymously if no token is available
        try {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
        } catch (error) {
            console.error("Firebase Auth Error:", error);
            setUserId('anonymous_error');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, fileType: keyof FilesState) => {
    if (e.target.files && e.target.files.length > 0) {
        setFiles(prev => ({ ...prev, [fileType]: e.target.files[0] }));
    }
  };

  // 2. Main KYC Submission Logic (Calls Secure Backend)
  const handleSubmitKYC = async () => {
    // Check for initialization and required files
    if (!userId || !authReady || isLoading) return;
    if (!files.id_front || !files.selfie) {
      setMessage('กรุณาอัปโหลดรูปภาพบัตรประชาชนและรูปเซลฟี่ให้ครบถ้วน');
      return;
    }

    setIsLoading(true);
    setMessage('กำลังประมวลผล... (อัปโหลดไฟล์และเรียกใช้ Cloud Function)');
    
    const kycDocRef = doc(db, `artifacts/${appId}/users/${userId}/kyc_data`, 'status');

    try {
      // Step A: Update Firestore status to PROCESSING (Real-time update)
      await setDoc(kycDocRef, {
        status: 'PROCESSING',
        message: 'กำลังตรวจสอบข้อมูลกับ AI Vision (OCR & Liveness)...',
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // Step B: Upload files to Firebase Storage (Real-world secure path)
      const idFrontUpload = await simulateFileUpload(files.id_front, userId, 'id_front');
      const selfieUpload = await simulateFileUpload(files.selfie, userId, 'selfie');
      
      const payload = {
        userId: userId,
        inputData: inputData, // Data from user input
        // IMPORTANT: We only send the Storage Path to the Backend for security
        uploadedFiles: {
          id_front: idFrontUpload.storagePath, 
          selfie: selfieUpload.storagePath,
          id_back: files.id_back ? (await simulateFileUpload(files.id_back, userId, 'id_back')).storagePath : null,
        }
      };

      // Step C: Call the Secure Cloud Function (Backend)
      const response = await fetchWithRetry(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass Auth Token for Security Rules and User Identification on the Backend
          'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`, 
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      
      if (result.success) {
        // The Cloud Function handles the final Firestore update
        setMessage('การยืนยันตัวตนเสร็จสมบูรณ์! โปรดรอสถานะอัปเดต...');
      } else {
        // If the API call succeeded but the logic failed (e.g., face mismatch)
        setIsLoading(false);
        setMessage(`การยืนยันล้มเหลว: ${result.error || 'โปรดลองอีกครั้ง'}`);
        await setDoc(kycDocRef, { status: 'FAILED', message: `การยืนยันล้มเหลว: ${result.error || 'โปรดลองอีกครั้ง'}`, updatedAt: serverTimestamp() }, { merge: true });
      }

    } catch (error: any) {
      console.error('KYC Submission Error:', error);
      setIsLoading(false);
      // Display the error message from the throw
      const errorMessage = error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      setMessage(errorMessage);
      await setDoc(kycDocRef, { status: 'FAILED', message: `ข้อผิดพลาดของระบบ: ${errorMessage}`, updatedAt: serverTimestamp() }, { merge: true });
    }
  };
  
  const statusColor = {
    'PENDING': 'bg-gray-100 text-gray-700 border-gray-300',
    'PROCESSING': 'bg-blue-100 text-blue-700 border-blue-400 animate-pulse',
    'VERIFIED': 'bg-green-100 text-green-700 border-green-500',
    'FAILED': 'bg-red-100 text-red-700 border-red-500',
  }[kycStatus];

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <p className="text-xl text-gray-600">กำลังเชื่อมต่อ Firebase...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8 font-[Inter]">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-xl p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-2">
          KYC Verification (Secure Implementation)
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          <span className="font-semibold">User ID:</span> {userId} (Used for Storage & Firestore Path)
        </p>

        {/* Status Card */}
        <div className={`p-4 mb-6 rounded-lg border-l-4 ${statusColor}`}>
          <h3 className="font-bold text-lg mb-1">สถานะ KYC ปัจจุบัน: {kycStatus}</h3>
          <p className="text-sm">{message}</p>
        </div>

        <form className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-700">1. ข้อมูลพื้นฐาน</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">ชื่อ-นามสกุล (กรอก)</label>
              <input
                type="text"
                name="name"
                value={inputData.name}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">เลขบัตรประชาชน (กรอก)</label>
              <input
                type="text"
                name="idNumber"
                value={inputData.idNumber}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">วันเดือนปีเกิด (กรอก)</label>
              <input
                type="date"
                name="dob"
                value={inputData.dob}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                disabled={isLoading}
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-gray-700 pt-4 border-t">2. อัปโหลดเอกสาร</h2>
          
          <div className="space-y-4">
            {/* ID Card Front */}
            <div>
              <label className="block text-sm font-medium text-gray-700 required">รูปบัตรประชาชนด้านหน้า (OCR)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'id_front')}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={isLoading}
                required
              />
              {files.id_front && <p className="text-xs text-green-600 mt-1">✓ อัปโหลดไฟล์: {files.id_front.name}</p>}
            </div>

            {/* Selfie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 required">รูปเซลฟี่/ใบหน้า (Liveness & Face Match)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'selfie')}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={isLoading}
                required
              />
              {files.selfie && <p className="text-xs text-green-600 mt-1">✓ อัปโหลดไฟล์: {files.selfie.name}</p>}
            </div>

            {/* Optional: ID Card Back */}
            <div>
              <label className="block text-sm font-medium text-gray-700">รูปบัตรประชาชนด้านหลัง (OCR, ไม่บังคับ)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'id_back')}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={isLoading}
              />
              {files.id_back && <p className="text-xs text-green-600 mt-1">✓ อัปโหลดไฟล์: {files.id_back.name}</p>}
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleSubmitKYC}
            disabled={isLoading || kycStatus === 'VERIFIED' || !files.id_front || !files.selfie}
            className={`w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg shadow-lg transition duration-150 ease-in-out 
              ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'}
            `}
          >
            {isLoading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'ยืนยัน KYC'
            )}
          </button>
          
          <p className="text-xs text-gray-400 mt-4 text-center">
            * Backend Logic (Cloud Function) จำลองการเรียกใช้ iApp API
          </p>
        </form>
      </div>
    </div>
  );
};

export default App;