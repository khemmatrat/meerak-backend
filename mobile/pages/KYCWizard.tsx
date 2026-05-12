/**
 * Phase 2: KYC Wizard - Step-by-Step Verification
 * 
 * Multi-step KYC process with driver license & vehicle registration
 * for fraud prevention and identity verification
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  User, 
  CreditCard, 
  Camera, 
  Car, 
  FileText, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft,
  AlertCircle,
  Upload,
  Trash2,
  X,
  Shield,
  Truck,
  Bike,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { validateThaiID } from '../utils/encryption';
import { uploadDocumentToSecure, isBlobUrl, DOCUMENT_UPLOAD_SIMPLE_RETRY_MESSAGE, revokeBlobUrl } from '../services/secureDocumentUploadService';
import axios from 'axios';
import { MockApi } from '../services/mockApi';

/** ให้ผู้ใช้อ่านเข้าใจเมื่อ POST /kyc/submit / เครือข่ายล้ม (ไม่ต้องอ้าง CORS พร็อกซีในหน้าจอ) */
const KYC_SUBMIT_RETRY_MESSAGE =
  'ไม่สามารถส่งข้อมูลในครั้งนี้ได้ — ลองใหม่ในอินเทอร์เน็ตที่นิ่งกว่านี้ถ้ายังอยู่ หรือรอแล้วกดส่งอีกครั้ง';

function transientKycSubmitFailure(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true;
  const s = err.response.status;
  return s === 429 || s >= 500;
}

function friendlyKycSubmitErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) return KYC_SUBMIT_RETRY_MESSAGE;
  const s = err.response?.status;
  if (s === 413) {
    return 'ขนาดไฟล์รวมใหญ่เกินที่ระบบรับไหวในคราวเดียว — กรุณาเลือกรูปที่เล็กลงในแต่ละขั้นตอน แล้วกดส่งใหม่';
  }
  if (s === 401 || s === 403) {
    return 'เซสชันหมดอายุหรือสิทธิ์ไม่ตรง — กรุณาเข้าสู่ระบบใหม่แล้วส่ง KYC อีกครั้ง';
  }
  const raw = err.response?.data as { error?: string; message?: string } | undefined;
  if (raw && typeof raw === 'object') {
    const m = typeof raw.error === 'string' && raw.error.trim() ? raw.error : typeof raw.message === 'string' ? raw.message : '';
    const t = m.trim();
    if (t.length > 0 && t.length < 420) return t.slice(0, 420);
  }
  const axMsg = typeof err.message === 'string' ? err.message.trim() : '';
  if (
    axMsg &&
    axMsg.length < 400 &&
    !/ECONN|^ERR_/i.test(axMsg) &&
    !/axios/i.test(axMsg.toLowerCase())
  ) {
    return axMsg;
  }
  return KYC_SUBMIT_RETRY_MESSAGE;
}

interface KYCFormData {
  // Personal Info
  national_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  address: string;
  
  // Documents
  id_card_front_url?: string;
  id_card_back_url?: string;
  selfie_url?: string;
  
  // Driver License (Optional)
  has_driver_license: boolean;
  driver_license?: {
    license_number: string;
    license_type: string;
    license_class: string[];
    issue_date: string;
    expiry_date: string;
    license_photo_url?: string;
  };
  
  // Vehicle (Optional)
  has_vehicle: boolean;
  vehicles?: Array<{
    license_plate: string;
    vehicle_type: 'car' | 'motorcycle' | 'truck' | 'tricycle';
    vehicle_brand: string;
    vehicle_model: string;
    vehicle_year: number;
    vehicle_color: string;
    vehicle_province: string;
    registration_book_photo_url?: string;
    registration_expiry_date: string;
    owner_name: string;
    is_owner: boolean;
    relationship_to_owner?: string;
  }>;
}

type PersonalDraftFields = Pick<
  KYCFormData,
  'national_id' | 'first_name' | 'last_name' | 'date_of_birth' | 'address'
>;

function personalDraftStorageKey(userId: string): string {
  return `aqond_kyc_wizard_personal_v1_${userId}`;
}

function loadPersonalDraft(userId: string): PersonalDraftFields | null {
  try {
    const raw = localStorage.getItem(personalDraftStorageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersonalDraftFields>;
    if (!p || typeof p !== 'object') return null;
    return {
      national_id: typeof p.national_id === 'string' ? p.national_id : '',
      first_name: typeof p.first_name === 'string' ? p.first_name : '',
      last_name: typeof p.last_name === 'string' ? p.last_name : '',
      date_of_birth: typeof p.date_of_birth === 'string' ? p.date_of_birth : '',
      address: typeof p.address === 'string' ? p.address : '',
    };
  } catch {
    return null;
  }
}

function savePersonalDraft(userId: string, data: PersonalDraftFields): void {
  localStorage.setItem(personalDraftStorageKey(userId), JSON.stringify(data));
}

function clearPersonalDraft(userId: string): void {
  localStorage.removeItem(personalDraftStorageKey(userId));
}

/** สถานะจาก GET /kyc/status — แสดงทันทีเมื่อเข้า /kyc ไม่ต้องแวะ Profile */
interface KycWizardServerGate {
  loading: boolean;
  fetchError: boolean;
  kycStatus: string;
  kycRejectionReason: string | null;
  kycAdminInstruction: string | null;
  kycResubmissionDeadline: string | null;
  kycRequiredSteps: string[];
}

const emptyKycWizardGate = (): Omit<KycWizardServerGate, 'loading' | 'fetchError'> => ({
  kycStatus: '',
  kycRejectionReason: null,
  kycAdminInstruction: null,
  kycResubmissionDeadline: null,
  kycRequiredSteps: [],
});

const KYCWizard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deeplinkReason = searchParams.get('reason');
  const userId = user?.id ?? null;
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('personal');
  const [formData, setFormData] = useState<KYCFormData>({
    national_id: '',
    first_name: '',
    last_name: '',
    date_of_birth: '',
    address: '',
    has_driver_license: false,
    has_vehicle: false,
    vehicles: []
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  /** ข้อความข้อผิดพลาดหลังส่ง KYC แสดงในหน้าแทน alert อย่างเดียว */
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  /** จดจำข้อมูลส่วนตัว (เฉพาะเครื่องนี้ — localStorage) */
  const [rememberPersonal, setRememberPersonal] = useState(false);
  /** เก็บไฟล์ต้นฉบับสำหรับ POST /api/kyc/submit (backend รับ multipart ไม่รับแค่ URL) */
  const kycFileByFieldRef = useRef<Partial<Record<string, File>>>({});

  const [kycServerGate, setKycServerGate] = useState<KycWizardServerGate>({
    loading: true,
    fetchError: false,
    ...emptyKycWizardGate(),
  });

  const loadKycServerStatus = useCallback(async () => {
    const uid =
      user?.id ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem('meerak_user_id') : null);
    if (!uid) {
      setKycServerGate({ loading: false, fetchError: false, ...emptyKycWizardGate() });
      return;
    }
    setKycServerGate((prev) => ({ ...prev, loading: true, fetchError: false }));
    try {
      const st = await MockApi.checkKYCStatus();
      setKycServerGate({
        loading: false,
        fetchError: false,
        kycStatus: String(st?.kycStatus || ''),
        kycRejectionReason: st?.kycRejectionReason ?? null,
        kycAdminInstruction: st?.kycAdminInstruction ?? null,
        kycResubmissionDeadline: st?.kycResubmissionDeadline ?? null,
        kycRequiredSteps: Array.isArray(st?.kycRequiredSteps)
          ? st.kycRequiredSteps.map((x: unknown) => String(x))
          : [],
      });
    } catch {
      setKycServerGate({ loading: false, fetchError: true, ...emptyKycWizardGate() });
    }
  }, [user?.id]);

  useEffect(() => {
    void loadKycServerStatus();
  }, [loadKycServerStatus]);

  useEffect(() => {
    if (deeplinkReason) void loadKycServerStatus();
  }, [deeplinkReason, loadKycServerStatus]);

  useEffect(() => {
    let t: number;
    const bump = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(t);
      t = window.setTimeout(() => void loadKycServerStatus(), 850);
    };
    document.addEventListener('visibilitychange', bump);
    window.addEventListener('focus', bump);
    return () => {
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('focus', bump);
      window.clearTimeout(t);
    };
  }, [loadKycServerStatus]);

  useEffect(() => {
    if (!userId) return;
    const draft = loadPersonalDraft(userId);
    if (!draft) return;
    setFormData((prev) => ({
      ...prev,
      national_id: draft.national_id || prev.national_id,
      first_name: draft.first_name || prev.first_name,
      last_name: draft.last_name || prev.last_name,
      date_of_birth: draft.date_of_birth || prev.date_of_birth,
      address: draft.address || prev.address,
    }));
    setRememberPersonal(true);
  }, [userId]);

  useEffect(() => {
    if (!userId || !rememberPersonal) return;
    savePersonalDraft(userId, {
      national_id: formData.national_id,
      first_name: formData.first_name,
      last_name: formData.last_name,
      date_of_birth: formData.date_of_birth,
      address: formData.address,
    });
  }, [
    userId,
    rememberPersonal,
    formData.national_id,
    formData.first_name,
    formData.last_name,
    formData.date_of_birth,
    formData.address,
  ]);

  const persistRememberPreference = useCallback(
    (nextRemember: boolean) => {
      setRememberPersonal(nextRemember);
      if (!userId) return;
      if (nextRemember) {
        savePersonalDraft(userId, {
          national_id: formData.national_id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          date_of_birth: formData.date_of_birth,
          address: formData.address,
        });
      } else {
        clearPersonalDraft(userId);
      }
    },
    [userId, formData.national_id, formData.first_name, formData.last_name, formData.date_of_birth, formData.address],
  );
  
  const steps: Array<{ id: WizardStep; label: string; icon: React.ReactNode }> = [
    { id: 'personal', label: 'ข้อมูลส่วนตัว', icon: <User size={20} /> },
    { id: 'id-card', label: 'บัตรประชาชน', icon: <CreditCard size={20} /> },
    { id: 'selfie', label: 'ถ่ายรูปใบหน้า', icon: <Camera size={20} /> },
    { id: 'driver-license', label: 'ใบขับขี่ (ถ้ามี)', icon: <FileText size={20} /> },
    { id: 'vehicle', label: 'ทะเบียนรถ (ถ้ามี)', icon: <Car size={20} /> },
    { id: 'review', label: 'ตรวจสอบ', icon: <CheckCircle size={20} /> }
  ];
  
  const getCurrentStepIndex = () => steps.findIndex(s => s.id === currentStep);
  
  const handleClearUpload = useCallback((field: string) => {
    delete kycFileByFieldRef.current[field];
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      if (field.startsWith('vehicle_photo_')) delete next[field];
      return next;
    });

    if (field === 'driver_license_photo') {
      setFormData((prev) => {
        const u = prev.driver_license?.license_photo_url;
        if (typeof u === 'string' && u.startsWith('blob:')) revokeBlobUrl(u);
        if (!prev.driver_license) return prev;
        return {
          ...prev,
          driver_license: { ...prev.driver_license, license_photo_url: undefined },
        };
      });
      return;
    }

    if (field.startsWith('vehicle_photo_')) {
      const index = parseInt(field.split('_')[2], 10);
      if (!Number.isFinite(index)) return;
      setFormData((prev) => {
        const vehicles = [...(prev.vehicles || [])];
        const row = vehicles[index];
        if (row) {
          const u = row.registration_book_photo_url;
          if (typeof u === 'string' && u.startsWith('blob:')) revokeBlobUrl(u);
          vehicles[index] = { ...row, registration_book_photo_url: undefined };
        }
        return { ...prev, vehicles };
      });
      return;
    }

    if (field === 'id_card_front_url' || field === 'id_card_back_url' || field === 'selfie_url') {
      setFormData((prev) => {
        const u = prev[field];
        if (typeof u === 'string' && u.startsWith('blob:')) revokeBlobUrl(u);
        return { ...prev, [field]: undefined };
      });
    }
  }, []);

  const handleRemoveVehicleAt = useCallback(
    (index: number) => {
      handleClearUpload(`vehicle_photo_${index}`);
      setFormData((prev) => ({
        ...prev,
        vehicles: prev.vehicles?.filter((_, i) => i !== index) ?? [],
      }));
    },
    [handleClearUpload],
  );

  // Handle image upload
  const handleImageUpload = async (file: File, field: string) => {
    setUploadingImage(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    kycFileByFieldRef.current[field] = file;
    try {
      const { url } = await uploadDocumentToSecure(file, `kyc_${field}`, { allowBlobFallback: true });
      if (!url) {
        delete kycFileByFieldRef.current[field];
        throw new Error(DOCUMENT_UPLOAD_SIMPLE_RETRY_MESSAGE);
      }

      const applyUrl = (nextUrl: string) => {
        if (field === 'driver_license_photo') {
          setFormData((prev) => {
            const old = prev.driver_license?.license_photo_url;
            if (typeof old === 'string' && old.startsWith('blob:') && old !== nextUrl) revokeBlobUrl(old);
            return {
              ...prev,
              driver_license: {
                ...prev.driver_license!,
                license_photo_url: nextUrl,
              },
            };
          });
        } else if (field.startsWith('vehicle_photo_')) {
          const index = parseInt(field.split('_')[2], 10);
          setFormData((prev) => {
            const newVehicles = [...(prev.vehicles || [])];
            const row = newVehicles[index];
            if (row) {
              const old = row.registration_book_photo_url;
              if (typeof old === 'string' && old.startsWith('blob:') && old !== nextUrl) revokeBlobUrl(old);
              newVehicles[index] = { ...row, registration_book_photo_url: nextUrl };
            }
            return { ...prev, vehicles: newVehicles };
          });
        } else if (field === 'id_card_front_url' || field === 'id_card_back_url' || field === 'selfie_url') {
          setFormData((prev) => {
            const old = prev[field];
            if (typeof old === 'string' && old.startsWith('blob:') && old !== nextUrl) revokeBlobUrl(old);
            return { ...prev, [field]: nextUrl };
          });
        }
      };

      applyUrl(url);
      console.log(`✅ Image ready: ${field} → ${isBlobUrl(url) ? 'local preview' : url}`);
    } catch (error) {
      console.error('Image upload failed:', error);
      delete kycFileByFieldRef.current[field];
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : DOCUMENT_UPLOAD_SIMPLE_RETRY_MESSAGE;
      setErrors((prev) => ({ ...prev, [field]: message }));
    } finally {
      setUploadingImage(false);
    }
  };
  
  // Validate current step
  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    switch (currentStep) {
      case 'personal':
        if (!formData.first_name) newErrors.first_name = 'กรุณากรอกชื่อจริง';
        if (!formData.last_name) newErrors.last_name = 'กรุณากรอกนามสกุล';
        if (!formData.national_id) {
          newErrors.national_id = 'กรุณากรอกเลขบัตรประชาชน';
        } else if (!validateThaiID(formData.national_id)) {
          newErrors.national_id = 'เลขบัตรประชาชนไม่ถูกต้อง';
        }
        if (!formData.date_of_birth) newErrors.date_of_birth = 'กรุณาเลือกวันเกิด';
        if (!formData.address) newErrors.address = 'กรุณากรอกที่อยู่';
        break;
        
      case 'id-card':
        if (!formData.id_card_front_url) newErrors.id_card_front_url = 'กรุณาอัปโหลดรูปบัตรประชาชนด้านหน้า';
        if (!formData.id_card_back_url) newErrors.id_card_back_url = 'กรุณาอัปโหลดรูปบัตรประชาชนด้านหลัง';
        break;
        
      case 'selfie':
        if (!formData.selfie_url) newErrors.selfie_url = 'กรุณาถ่ายรูปใบหน้า';
        break;
        
      case 'driver-license':
        if (formData.has_driver_license && formData.driver_license) {
          if (!formData.driver_license.license_number) {
            newErrors.license_number = 'กรุณากรอกเลขใบขับขี่';
          }
          if (!formData.driver_license.expiry_date) {
            newErrors.expiry_date = 'กรุณาเลือกวันหมดอายุ';
          }
          if (!formData.driver_license.license_photo_url) {
            newErrors.license_photo = 'กรุณาอัปโหลดรูปใบขับขี่';
          }
        }
        break;
        
      case 'vehicle':
        if (formData.has_vehicle && (!formData.vehicles || formData.vehicles.length === 0)) {
          newErrors.vehicles = 'กรุณาเพิ่มข้อมูลรถอย่างน้อย 1 คัน';
        }
        break;

      case 'review': {
        if (!formData.id_card_front_url) newErrors.id_card_front_url = 'กรุณาอัปโหลดรูปบัตรประชาชนด้านหน้า';
        if (!formData.id_card_back_url) newErrors.id_card_back_url = 'กรุณาอัปโหลดรูปบัตรประชาชนด้านหลัง';
        if (!formData.selfie_url) newErrors.selfie_url = 'กรุณาถ่ายรูปใบหน้า';
        /** ต้องมีไฟล์ต้นฉบับสำหรับ POST /kyc/submit — ยกเว้นกรณีมี URL จากเซิร์ฟเวอร์จริง (รีเฟรชหน้าแล้ว ref หาย) */
        const missingRef =
          !kycFileByFieldRef.current['id_card_front_url'] ||
          !kycFileByFieldRef.current['id_card_back_url'] ||
          !kycFileByFieldRef.current['selfie_url'];
        const looksLikeServerUrl = (u?: string) =>
          typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'));
        if (
          missingRef &&
          !(
            looksLikeServerUrl(formData.id_card_front_url) &&
            looksLikeServerUrl(formData.id_card_back_url) &&
            looksLikeServerUrl(formData.selfie_url)
          )
        ) {
          newErrors._kyc_files =
            'ไฟล์รูปต้นฉบับยังไม่ครบสำหรับส่งตรวจ — กรุณาอัปโหลดบัตรด้านหน้า/ด้านหลัง และรูปเซลฟี่ใหม่อีกครั้ง';
        }
        break;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Navigate to next step
  const handleNext = () => {
    if (!validateStep()) return;
    
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };
  
  // Navigate to previous step
  const handleBack = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id);
    }
  };
  
  // Submit KYC
  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitBanner(null);
    setSubmitSuccessMessage(null);

    const uid =
      user?.id ??
      (typeof localStorage !== 'undefined' ? localStorage.getItem('meerak_user_id') : null);
    if (!uid) {
      setSubmitBanner('ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    const idFront = kycFileByFieldRef.current['id_card_front_url'];
    const idBack = kycFileByFieldRef.current['id_card_back_url'];
    const selfie = kycFileByFieldRef.current['selfie_url'];
    if (!idFront || !idBack || !selfie) {
      const hasServerPreview =
        /^https?:\/\//.test(String(formData.id_card_front_url || '')) &&
        /^https?:\/\//.test(String(formData.id_card_back_url || '')) &&
        /^https?:\/\//.test(String(formData.selfie_url || ''));
      setSubmitBanner(
        hasServerPreview
          ? 'กรุณากลับไปขั้นตอน “บัตรประชาชน” และ “ถ่ายรูปใบหน้า” แล้วเลือกรูปจากเครื่องอีกครั้ง (หากรีเฟรชหน้า อาจต้องอัปโหลดใหม่เพื่อส่งตรวจ)'
          : 'ไม่พบไฟล์รูปในหน่วยความจำสำหรับส่ง KYC — กรุณาเลือกรูปบัตรด้านหน้า / ด้านหลัง และรูปเซลฟี่ใหม่',
      );
      return;
    }

    setLoading(true);
    try {
      const dlFront =
        formData.has_driver_license && formData.driver_license?.license_photo_url
          ? kycFileByFieldRef.current['driver_license_photo']
          : undefined;

      const vehiclesJson =
        formData.has_vehicle &&
        Array.isArray(formData.vehicles) &&
        formData.vehicles.length > 0
          ? JSON.stringify(formData.vehicles)
          : undefined;

      const submitPayload = {
        userId: uid,
        fullName: `${formData.first_name} ${formData.last_name}`.trim(),
        birthDate: formData.date_of_birth,
        idCardNumber: formData.national_id,
        address: formData.address?.trim() || undefined,
        vehiclesJson,
        idCardFront: idFront,
        idCardBack: idBack,
        selfiePhoto: selfie,
        drivingLicenseFront: dlFront ?? null,
        drivingLicenseBack: null,
      };

      let result;
      try {
        result = await MockApi.submitEnhancedKYC(submitPayload);
      } catch (err) {
        if (transientKycSubmitFailure(err)) {
          await new Promise((r) => setTimeout(r, 2000));
          result = await MockApi.submitEnhancedKYC(submitPayload);
        } else throw err;
      }

      if (result.success) {
        clearPersonalDraft(uid);
        kycFileByFieldRef.current = {};
        setSubmitBanner(null);
        setSubmitSuccessMessage(result.message || 'ส่งข้อมูล KYC สำเร็จ — รอการตรวจสอบจากเจ้าหน้าที่');
        void loadKycServerStatus();
      } else {
        const raw = typeof result?.error === 'string' && result.error.trim() ? result.error : result?.message;
        setSubmitBanner(
          typeof raw === 'string' && raw.trim().length && raw.trim().length < 500
            ? String(raw).trim()
            : KYC_SUBMIT_RETRY_MESSAGE,
        );
      }
    } catch (error: unknown) {
      console.error('KYC submission error:', error);
      setSubmitBanner(friendlyKycSubmitErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  
  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'personal':
        return (
          <StepPersonalInfo
            formData={formData}
            setFormData={setFormData}
            errors={errors}
            rememberPersonal={rememberPersonal}
            onRememberPersonalChange={persistRememberPreference}
          />
        );
      case 'id-card':
        return (
          <StepIDCard
            formData={formData}
            onUpload={handleImageUpload}
            onClearUpload={handleClearUpload}
            uploading={uploadingImage}
            errors={errors}
          />
        );
      case 'selfie':
        return (
          <StepSelfie
            formData={formData}
            onUpload={handleImageUpload}
            onClearUpload={handleClearUpload}
            uploading={uploadingImage}
            errors={errors}
          />
        );
      case 'driver-license':
        return (
          <StepDriverLicense
            formData={formData}
            setFormData={setFormData}
            onUpload={handleImageUpload}
            onClearUpload={handleClearUpload}
            uploading={uploadingImage}
            errors={errors}
          />
        );
      case 'vehicle':
        return (
          <StepVehicle
            formData={formData}
            setFormData={setFormData}
            onUpload={handleImageUpload}
            onClearUpload={handleClearUpload}
            onRemoveVehicleAt={handleRemoveVehicleAt}
            uploading={uploadingImage}
            errors={errors}
          />
        );
      case 'review':
        return <StepReview formData={formData} />;
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ยืนยันตัวตน (KYC)
          </h1>
          <p className="text-gray-600">
            กรอกข้อมูลเพื่อยืนยันตัวตนและเพิ่มวงเงินการใช้งาน
          </p>
        </div>

        {kycServerGate.loading && (
          <div
            className="mb-6 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-900 flex items-center gap-3 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent shrink-0" />
            กำลังโหลดสถานะการยืนยันตัวตนจากระบบ…
          </div>
        )}

        {!kycServerGate.loading && kycServerGate.fetchError && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <span className="flex items-center gap-2 min-w-0">
              <AlertCircle size={18} className="shrink-0 text-amber-600" />
              ไม่สามารถโหลดสถานะล่าสุดได้ — ลองรีเฟรชหรือตรวจสอบการเชื่อมต่อ
            </span>
            <button
              type="button"
              onClick={() => void loadKycServerStatus()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 shrink-0"
            >
              <RefreshCw size={14} /> โหลดใหม่
            </button>
          </div>
        )}

        {!kycServerGate.loading &&
          !kycServerGate.fetchError &&
          (kycServerGate.kycStatus === 'rejected' ||
            kycServerGate.kycStatus === 'resubmission_required') && (
            <div
              id="kyc-admin-reason"
              className={`mb-6 rounded-2xl border-2 p-5 shadow-md scroll-mt-24 ${
                kycServerGate.kycStatus === 'resubmission_required'
                  ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/90'
                  : 'border-rose-300 bg-gradient-to-br from-rose-50 to-red-50/80'
              }`}
              role="alert"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 text-left">
                  <AlertCircle
                    className={
                      kycServerGate.kycStatus === 'resubmission_required'
                        ? 'text-amber-600'
                        : 'text-rose-600'
                    }
                    size={26}
                  />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {kycServerGate.kycStatus === 'resubmission_required'
                        ? 'ทีมงานขอเอกสารเพิ่ม / กรุณายืนยันตัวตนใหม่'
                        : 'การยืนยันตัวตนไม่ผ่านการตรวจ'}
                    </h2>
                    <p className="text-xs text-gray-600 mt-0.5">
                      ข้อความด้านล่างจากเจ้าหน้าที่ — กรุณาอ่านแล้วดำเนินการตามขั้นตอนใน Wizard
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadKycServerStatus()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
                >
                  <RefreshCw size={14} /> รีเฟรชสถานะ
                </button>
              </div>

              {(kycServerGate.kycAdminInstruction || kycServerGate.kycRejectionReason) && (
                <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed bg-white/60 rounded-xl px-4 py-3 border border-white/80">
                  {kycServerGate.kycStatus === 'resubmission_required'
                    ? kycServerGate.kycAdminInstruction || kycServerGate.kycRejectionReason
                    : kycServerGate.kycRejectionReason || kycServerGate.kycAdminInstruction}
                </p>
              )}

              {kycServerGate.kycRequiredSteps.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">รายการที่ต้องดำเนินการ</p>
                  <ul className="list-disc list-inside text-sm text-gray-800 space-y-0.5">
                    {kycServerGate.kycRequiredSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {kycServerGate.kycResubmissionDeadline && (
                <p className="text-xs text-gray-600 mt-3 font-medium">
                  กำหนดส่ง:{' '}
                  {new Date(kycServerGate.kycResubmissionDeadline).toLocaleString('th-TH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              )}

              <div className="mt-4 rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2.5 text-xs text-gray-800 leading-relaxed">
                <p className="font-semibold text-gray-900 mb-1">ผลต่อการใช้งานแอป</p>
                {kycServerGate.kycStatus === 'resubmission_required' ? (
                  <p>
                    จนกว่าจะส่งเอกสารใหม่และได้รับอนุมัติ ฟีเจอร์ที่ต้องยืนยันตัวตน (เช่น ถอนเงิน หรือรับงานบางประเภท)
                    อาจถูกจำกัดตามนโยบายของแพลตฟอร์ม
                  </p>
                ) : (
                  <p>
                    สถานะปฏิเสธถาวร — ฟีเจอร์ถอนเงินและงานที่ต้องยืนยันตัวตนมักไม่พร้อมใช้งานจนกว่าจะมีการติดต่อ/แก้ไขกับทีมงาน
                  </p>
                )}
              </div>
            </div>
          )}

        {!kycServerGate.loading && !kycServerGate.fetchError && kycServerGate.kycStatus === 'pending_review' && (
          <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 flex items-start gap-2 shadow-sm">
            <Shield size={18} className="shrink-0 text-sky-600 mt-0.5" />
            <div>
              <p className="font-semibold">คำขอของคุณอยู่ระหว่างการตรวจสอบ</p>
              <p className="text-sky-900/90 mt-1">
                หากทีมงานต้องการเอกสารเพิ่ม สถานะจะอัปเดตที่นี่ — ไม่ต้องส่งซ้ำจนกว่าจะได้รับแจ้ง
              </p>
            </div>
          </div>
        )}

        {submitSuccessMessage && (
          <div
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            role="status"
          >
            <span className="flex items-start gap-2 min-w-0">
              <CheckCircle size={20} className="shrink-0 text-emerald-600 mt-0.5" />
              <span className="min-w-0">{submitSuccessMessage}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => document.getElementById('kyc-admin-reason')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
                disabled={
                  !(
                    kycServerGate.kycStatus === 'rejected' ||
                    kycServerGate.kycStatus === 'resubmission_required'
                  )
                }
              >
                ดูเหตุผล / คำแนะนำจากเจ้าหน้าที่
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                ไปโปรไฟล์
              </button>
            </div>
          </div>
        )}

        {submitBanner && (
          <div
            className="mb-6 rounded-xl border border-rose-200 bg-rose-50/95 px-4 py-3 text-sm text-rose-950 shadow-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            role="alert"
          >
            <span className="flex items-start gap-2 min-w-0">
              <AlertCircle size={20} className="shrink-0 text-rose-600 mt-0.5" />
              <span className="whitespace-pre-wrap min-w-0">{submitBanner}</span>
            </span>
            {(kycServerGate.kycStatus === 'rejected' ||
              kycServerGate.kycStatus === 'resubmission_required') && (
              <button
                type="button"
                onClick={() => document.getElementById('kyc-admin-reason')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-xs font-semibold text-rose-800 underline-offset-2 hover:underline shrink-0"
              >
                ดูเหตุผลจากเจ้าหน้าที่
              </button>
            )}
          </div>
        )}
        
        {/* Progress Steps */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className={`flex flex-col items-center flex-1 ${index < steps.length - 1 ? 'relative' : ''}`}>
                  {/* Step Circle */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      getCurrentStepIndex() === index
                        ? 'bg-blue-500 border-blue-500 text-white scale-110'
                        : getCurrentStepIndex() > index
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                  >
                    {getCurrentStepIndex() > index ? (
                      <CheckCircle size={24} />
                    ) : (
                      step.icon
                    )}
                  </div>
                  
                  {/* Step Label */}
                  <span className={`text-xs mt-2 text-center ${
                    getCurrentStepIndex() === index ? 'text-blue-600 font-semibold' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                  
                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div
                      className={`absolute top-6 left-1/2 w-full h-0.5 ${
                        getCurrentStepIndex() > index ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      style={{ transform: 'translateX(50%)' }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          {renderStepContent()}
          {errors._kyc_files && (
            <p className="mt-4 text-sm text-red-600 font-medium">{errors._kyc_files}</p>
          )}
        </div>
        
        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <button
            onClick={handleBack}
            disabled={getCurrentStepIndex() === 0}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <ChevronLeft size={20} className="mr-2" />
            ย้อนกลับ
          </button>
          
          {currentStep === 'review' ? (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg disabled:opacity-50 flex items-center font-semibold"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                  กำลังส่งข้อมูล...
                </>
              ) : (
                <>
                  <CheckCircle size={20} className="mr-2" />
                  ส่งข้อมูล KYC
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg flex items-center font-semibold"
            >
              ถัดไป
              <ChevronRight size={20} className="ml-2" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Component for Step 1: Personal Info
const StepPersonalInfo: React.FC<{
  formData: KYCFormData;
  setFormData: React.Dispatch<React.SetStateAction<KYCFormData>>;
  errors: Record<string, string>;
  rememberPersonal: boolean;
  onRememberPersonalChange: (remember: boolean) => void;
}> = ({ formData, setFormData, errors, rememberPersonal, onRememberPersonalChange }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ข้อมูลส่วนตัว
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ชื่อจริง */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ชื่อจริง <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.first_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="สมชาย"
          />
          {errors.first_name && (
            <p className="mt-1 text-sm text-red-500">{errors.first_name}</p>
          )}
        </div>
        
        {/* นามสกุล */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            นามสกุล <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.last_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="ใจดี"
          />
          {errors.last_name && (
            <p className="mt-1 text-sm text-red-500">{errors.last_name}</p>
          )}
        </div>
        
        {/* เลขบัตรประชาชน */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            เลขบัตรประชาชน <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.national_id}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 13);
              setFormData(prev => ({ ...prev, national_id: value }));
            }}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.national_id ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="1234567890123"
            maxLength={13}
          />
          {errors.national_id && (
            <p className="mt-1 text-sm text-red-500">{errors.national_id}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">13 หลัก</p>
        </div>
        
        {/* วันเกิด */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            วันเกิด <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.date_of_birth ? 'border-red-500' : 'border-gray-300'
            }`}
            max={new Date().toISOString().split('T')[0]}
          />
          {errors.date_of_birth && (
            <p className="mt-1 text-sm text-red-500">{errors.date_of_birth}</p>
          )}
        </div>
      </div>
      
      {/* ที่อยู่ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ที่อยู่ <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.address}
          onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            errors.address ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110"
          rows={3}
        />
        {errors.address && (
          <p className="mt-1 text-sm text-red-500">{errors.address}</p>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
        <input
          type="checkbox"
          checked={rememberPersonal}
          onChange={(e) => onRememberPersonalChange(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-800">
          <span className="font-medium">จดจำข้อมูลในขั้นตอนนี้</span>
          <span className="block text-xs text-gray-500 mt-1">
            เก็บชื่อ เลขบัตร วันเกิด และที่อยู่ไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น เพื่อกรอกซ้ำในครั้งถัดไป (ไม่ส่งไปเซิร์ฟเวอร์จนกว่าคุณจะส่ง KYC)
          </span>
        </span>
      </label>
      
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
        <AlertCircle className="text-blue-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-blue-800">
          <p className="font-medium">ข้อมูลจะถูกเข้ารหัสก่อนบันทึก</p>
          <p className="text-blue-700 mt-1">
            ข้อมูลส่วนตัวทั้งหมดจะถูกเข้ารหัสด้วย AES-256-GCM ก่อนบันทึกลงฐานข้อมูล
          </p>
        </div>
      </div>
    </div>
  );
};

// Component for Step 2: ID Card Upload
const StepIDCard: React.FC<{
  formData: KYCFormData;
  onUpload: (file: File, field: string) => void;
  onClearUpload: (field: string) => void;
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, onUpload, onClearUpload, uploading, errors }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        อัปโหลดบัตรประชาชน
      </h2>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 space-y-3">
        <h3 className="font-semibold text-emerald-950 text-sm">วิธีอัปโหลดให้ผ่านง่ายๆ</h3>
        <ol className="text-sm text-emerald-900 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>วางบัตรบนพื้นหลังเรียบ สีอ่อน (เช่น กระดาษขาว โต๊ะเรียบ) ลดเงาและแสงสะท้อน</li>
          <li>ถ่ายให้เห็น<strong>บัตรเต็มใบ</strong> ขอบบัตรไม่ถูกตัด ไม่มุมเอียงจนเกินไป</li>
          <li>ใช้แสงสว่างพอดี ไม่มืดหรือสว่างจ้า — ตัวอักษรและรูปบนบัตรต้อง<strong>อ่านชัด ไม่เบลอ</strong></li>
          <li>ใช้รูป<strong>ต้นฉบับจากกล้องหรือแกลเลอรี</strong> ไม่ใช้รูปที่ครอปจนเหลือแค่ส่วนข้อความ หรือรูปถ่ายจากจอมอนิเตอร์</li>
          <li>อัปโหลด<strong>ด้านหน้าและด้านหลังแยกกัน</strong> ตามช่องที่ระบบ</li>
        </ol>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-emerald-200 bg-white/80 p-3 flex gap-2">
            <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-xs font-semibold text-gray-900">ตัวอย่างที่ดี</p>
              <p className="text-xs text-gray-600 mt-1 leading-snug">
                บัตรวางราบ กล้องอยู่ด้านบน มองลงมา — เห็นขอบบัตรครบ ตัวหนังสือคม
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex gap-2">
            <X className="text-amber-700 shrink-0 mt-0.5" size={18} strokeWidth={2.5} />
            <div>
              <p className="text-xs font-semibold text-gray-900">ควรเลี่ยง</p>
              <p className="text-xs text-gray-600 mt-1 leading-snug">
                แสงสะท้อนใส่บัตร มืดเกินไป เบลอ บัตรขาดมุม หรือถ่ายทอดจากรูปบนจอ
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ImageUploadBox
          label="ด้านหน้า"
          imageUrl={formData.id_card_front_url}
          onUpload={(file) => onUpload(file, 'id_card_front_url')}
          onRemove={() => onClearUpload('id_card_front_url')}
          uploading={uploading}
          error={errors.id_card_front_url}
        />

        <ImageUploadBox
          label="ด้านหลัง"
          imageUrl={formData.id_card_back_url}
          onUpload={(file) => onUpload(file, 'id_card_back_url')}
          onRemove={() => onClearUpload('id_card_back_url')}
          uploading={uploading}
          error={errors.id_card_back_url}
        />
      </div>

      <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-4">
        <h3 className="font-medium text-amber-950 text-sm mb-2">หมายเหตุ</h3>
        <p className="text-sm text-amber-900 leading-relaxed">
          หากเห็นข้อความให้อัปโหลดใหม่ ให้เลือกรูปจากเครื่องอีกครั้ง — ถ้าส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จช่วงสั้นๆ แอปยังเก็บรูปเป็นตัวอย่างบนเครื่องให้ เพื่อไม่ให้ติดค้าง และคุณยัง<strong>เลือกรูปใหม่หรือกดปุ่มลบแล้วอัปโหลดซ้ำ</strong>ได้
        </p>
      </div>
    </div>
  );
};

// Component for Step 3: Selfie
const StepSelfie: React.FC<{
  formData: KYCFormData;
  onUpload: (file: File, field: string) => void;
  onClearUpload: (field: string) => void;
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, onUpload, onClearUpload, uploading, errors }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ถ่ายรูปใบหน้า
      </h2>
      
      <div className="max-w-md mx-auto">
        <ImageUploadBox
          label="รูปถ่ายใบหน้า"
          imageUrl={formData.selfie_url}
          onUpload={(file) => onUpload(file, 'selfie_url')}
          onRemove={() => onClearUpload('selfie_url')}
          uploading={uploading}
          error={errors.selfie_url}
          aspectRatio="square"
        />
      </div>
      
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">คำแนะนำ:</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>ถ่ายภาพใบหน้าตรง มองกล้อง</li>
          <li>อยู่ในที่มีแสงสว่างเพียงพอ</li>
          <li>ถอดหมวก แว่นตา หน้ากาก</li>
          <li>ใบหน้าต้องชัดเจน ไม่มืดหรือเบลอ</li>
        </ul>
      </div>
    </div>
  );
};

// Component for Step 4: Driver License (Optional)
const StepDriverLicense: React.FC<{
  formData: KYCFormData;
  setFormData: React.Dispatch<React.SetStateAction<KYCFormData>>;
  onUpload: (file: File, field: string) => void;
  onClearUpload: (field: string) => void;
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, setFormData, onUpload, onClearUpload, uploading, errors }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ใบขับขี่ (ถ้ามี)
      </h2>
      
      {/* Has Driver License Toggle */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="has_driver_license"
          checked={formData.has_driver_license}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              has_driver_license: e.target.checked,
              driver_license: e.target.checked ? {
                license_number: '',
                license_type: 'ถาวร',
                license_class: [],
                issue_date: '',
                expiry_date: ''
              } : undefined
            }));
          }}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="has_driver_license" className="ml-2 text-sm font-medium text-gray-700">
          ฉันมีใบขับขี่
        </label>
      </div>
      
      {formData.has_driver_license && (
        <div className="space-y-6 mt-6">
          {/* License Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เลขใบขับขี่ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.driver_license?.license_number || ''}
              onChange={(e) => {
                setFormData(prev => ({
                  ...prev,
                  driver_license: {
                    ...prev.driver_license!,
                    license_number: e.target.value
                  }
                }));
              }}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.license_number ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="12345678"
            />
            {errors.license_number && (
              <p className="mt-1 text-sm text-red-500">{errors.license_number}</p>
            )}
          </div>
          
          {/* License Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทใบขับขี่
            </label>
            <select
              value={formData.driver_license?.license_type || 'ถาวร'}
              onChange={(e) => {
                setFormData(prev => ({
                  ...prev,
                  driver_license: {
                    ...prev.driver_license!,
                    license_type: e.target.value
                  }
                }));
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="ชั่วคราว">ชั่วคราว (2 ปี)</option>
              <option value="ถาวร">ถาวร (5 ปี)</option>
              <option value="สากล">สากล (International)</option>
            </select>
          </div>
          
          {/* Expiry Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              วันหมดอายุ <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.driver_license?.expiry_date || ''}
              onChange={(e) => {
                setFormData(prev => ({
                  ...prev,
                  driver_license: {
                    ...prev.driver_license!,
                    expiry_date: e.target.value
                  }
                }));
              }}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.expiry_date ? 'border-red-500' : 'border-gray-300'
              }`}
              min={new Date().toISOString().split('T')[0]}
            />
            {errors.expiry_date && (
              <p className="mt-1 text-sm text-red-500">{errors.expiry_date}</p>
            )}
          </div>
          
          {/* License Photo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              รูปใบขับขี่ <span className="text-red-500">*</span>
            </label>
            <ImageUploadBox
              label="อัปโหลดรูปใบขับขี่"
              imageUrl={formData.driver_license?.license_photo_url}
              onUpload={(file) => onUpload(file, 'driver_license_photo')}
              onRemove={() => onClearUpload('driver_license_photo')}
              uploading={uploading}
              error={errors.license_photo}
            />
          </div>
        </div>
      )}
      
      {!formData.has_driver_license && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <FileText size={48} className="text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">ไม่มีใบขับขี่? ข้ามขั้นตอนนี้ได้</p>
          <p className="text-sm text-gray-500 mt-1">
            (สามารถเพิ่มได้ภายหลังในหน้าโปรไฟล์)
          </p>
        </div>
      )}
    </div>
  );
};

// Component for Step 5: Vehicle Registration (Optional)
const StepVehicle: React.FC<{
  formData: KYCFormData;
  setFormData: React.Dispatch<React.SetStateAction<KYCFormData>>;
  onUpload: (file: File, field: string) => void;
  onClearUpload: (field: string) => void;
  onRemoveVehicleAt: (index: number) => void;
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, setFormData, onUpload, onClearUpload, onRemoveVehicleAt, uploading, errors }) => {
  const addVehicle = () => {
    setFormData(prev => ({
      ...prev,
      vehicles: [
        ...(prev.vehicles || []),
        {
          license_plate: '',
          vehicle_type: 'car',
          vehicle_brand: '',
          vehicle_model: '',
          vehicle_year: new Date().getFullYear(),
          vehicle_color: '',
          vehicle_province: 'กรุงเทพมหานคร',
          registration_expiry_date: '',
          owner_name: '',
          is_owner: true
        }
      ]
    }));
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ทะเบียนรถ (ถ้ามี)
      </h2>
      
      {/* Has Vehicle Toggle */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="has_vehicle"
          checked={formData.has_vehicle}
          onChange={(e) => {
            setFormData(prev => ({
              ...prev,
              has_vehicle: e.target.checked,
              vehicles: e.target.checked ? prev.vehicles : []
            }));
            if (e.target.checked && (!formData.vehicles || formData.vehicles.length === 0)) {
              addVehicle();
            }
          }}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="has_vehicle" className="ml-2 text-sm font-medium text-gray-700">
          ฉันมีรถยนต์/รถจักรยานยนต์
        </label>
      </div>
      
      {formData.has_vehicle && (
        <div className="space-y-6 mt-6">
          {formData.vehicles?.map((vehicle, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  รถคันที่ {index + 1}
                </h3>
                {formData.vehicles!.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveVehicleAt(index)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    ลบ
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* License Plate */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ทะเบียนรถ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={vehicle.license_plate}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].license_plate = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="กก 1234 กรุงเทพมหานคร"
                  />
                </div>
                
                {/* Vehicle Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ประเภทรถ
                  </label>
                  <select
                    value={vehicle.vehicle_type}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_type = e.target.value as any;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="car">รถยนต์</option>
                    <option value="motorcycle">รถจักรยานยนต์</option>
                    <option value="truck">รถกระบะ/รถบรรทุก</option>
                    <option value="tricycle">สามล้อ / ตุ๊กตุ๊ก</option>
                  </select>
                </div>
                
                {/* Brand & Model */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ยี่ห้อ
                  </label>
                  <input
                    type="text"
                    value={vehicle.vehicle_brand}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_brand = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Toyota"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    รุ่น
                  </label>
                  <input
                    type="text"
                    value={vehicle.vehicle_model}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_model = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Camry"
                  />
                </div>
              </div>
              
              {/* Additional Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ปีจดทะเบียน
                  </label>
                  <input
                    type="number"
                    value={vehicle.vehicle_year}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_year = parseInt(e.target.value);
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={1980}
                    max={new Date().getFullYear() + 1}
                  />
                </div>
                
                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    สี
                  </label>
                  <input
                    type="text"
                    value={vehicle.vehicle_color}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_color = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Silver"
                  />
                </div>
                
                {/* Province */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    จังหวัดจดทะเบียน
                  </label>
                  <input
                    type="text"
                    value={vehicle.vehicle_province}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].vehicle_province = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="กรุงเทพมหานคร"
                  />
                </div>
                
                {/* Registration Expiry */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    วันหมดอายุ พ.ร.บ.
                  </label>
                  <input
                    type="date"
                    value={vehicle.registration_expiry_date}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].registration_expiry_date = e.target.value;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              
              {/* Registration Book Photo */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รูปเล่มทะเบียนรถ <span className="text-red-500">*</span>
                </label>
                <ImageUploadBox
                  label="อัปโหลดรูปเล่มทะเบียนรถ"
                  imageUrl={vehicle.registration_book_photo_url}
                  onUpload={(file) => onUpload(file, `vehicle_photo_${index}`)}
                  onRemove={() => onClearUpload(`vehicle_photo_${index}`)}
                  uploading={uploading}
                  error={errors[`vehicle_photo_${index}`]}
                />
              </div>
              
              {/* Is Owner */}
              <div className="mt-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`is_owner_${index}`}
                    checked={vehicle.is_owner}
                    onChange={(e) => {
                      const newVehicles = [...formData.vehicles!];
                      newVehicles[index].is_owner = e.target.checked;
                      setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`is_owner_${index}`} className="ml-2 text-sm text-gray-700">
                    ฉันเป็นเจ้าของรถคันนี้
                  </label>
                </div>
                
                {/* Owner Name (if not owner) */}
                {!vehicle.is_owner && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ชื่อเจ้าของรถ
                    </label>
                    <input
                      type="text"
                      value={vehicle.owner_name}
                      onChange={(e) => {
                        const newVehicles = [...formData.vehicles!];
                        newVehicles[index].owner_name = e.target.value;
                        setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="สมชาย ใจดี"
                    />
                    
                    <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
                      ความสัมพันธ์กับเจ้าของ
                    </label>
                    <select
                      value={vehicle.relationship_to_owner || ''}
                      onChange={(e) => {
                        const newVehicles = [...formData.vehicles!];
                        newVehicles[index].relationship_to_owner = e.target.value;
                        setFormData(prev => ({ ...prev, vehicles: newVehicles }));
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">เลือกความสัมพันธ์</option>
                      <option value="father">บิดา</option>
                      <option value="mother">มารดา</option>
                      <option value="spouse">คู่สมรส</option>
                      <option value="sibling">พี่น้อง</option>
                      <option value="friend">เพื่อน</option>
                      <option value="employer">นายจ้าง</option>
                      <option value="other">อื่นๆ</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          <button
            onClick={addVehicle}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center"
          >
            <Car size={20} className="mr-2" />
            เพิ่มรถอีกคัน
          </button>
        </div>
      )}
      
      {!formData.has_vehicle && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <Car size={48} className="text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">ไม่มีรถยนต์? ข้ามขั้นตอนนี้ได้</p>
          <p className="text-sm text-gray-500 mt-1">
            (สามารถเพิ่มได้ภายหลังในหน้าโปรไฟล์)
          </p>
        </div>
      )}
      
      {/* Why We Need This */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="font-medium text-amber-900 mb-2 flex items-center">
          <Shield size={20} className="mr-2" />
          ทำไมต้องลงทะเบียนรถ?
        </h3>
        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
          <li>ป้องกันการสวมสิทธิ์ขับรถผู้อื่น</li>
          <li>ป้องกันการใช้รถในทางที่ผิดกฎหมาย</li>
          <li>เพิ่มความน่าเชื่อถือให้กับผู้ให้บริการ</li>
          <li>ตรวจสอบได้ว่ารถถูกต้องตามกฎหมาย</li>
        </ul>
      </div>
    </div>
  );
};

// Component for Step 6: Review
const StepReview: React.FC<{
  formData: KYCFormData;
}> = ({ formData }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        ตรวจสอบข้อมูล
      </h2>
      
      {/* Personal Info */}
      <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลส่วนตัว</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">ชื่อ-นามสกุล:</span>
            <p className="font-medium">{formData.first_name} {formData.last_name}</p>
          </div>
          <div>
            <span className="text-gray-600">เลขบัตรประชาชน:</span>
            <p className="font-medium">{formData.national_id}</p>
          </div>
          <div>
            <span className="text-gray-600">วันเกิด:</span>
            <p className="font-medium">{formData.date_of_birth}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600">ที่อยู่:</span>
            <p className="font-medium">{formData.address}</p>
          </div>
        </div>
      </div>
      
      {/* Documents */}
      <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">เอกสาร</h3>
        <div className="grid grid-cols-3 gap-4">
          {formData.id_card_front_url && (
            <div>
              <p className="text-sm text-gray-600 mb-2">บัตรประชาชน (หน้า)</p>
              <img src={formData.id_card_front_url} alt="ID Front" className="w-full h-24 object-cover rounded-lg border" />
            </div>
          )}
          {formData.id_card_back_url && (
            <div>
              <p className="text-sm text-gray-600 mb-2">บัตรประชาชน (หลัง)</p>
              <img src={formData.id_card_back_url} alt="ID Back" className="w-full h-24 object-cover rounded-lg border" />
            </div>
          )}
          {formData.selfie_url && (
            <div>
              <p className="text-sm text-gray-600 mb-2">รูปถ่ายใบหน้า</p>
              <img src={formData.selfie_url} alt="Selfie" className="w-full h-24 object-cover rounded-lg border" />
            </div>
          )}
        </div>
      </div>
      
      {/* Driver License */}
      {formData.has_driver_license && formData.driver_license && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">ใบขับขี่</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">เลขใบขับขี่:</span>
              <p className="font-medium">{formData.driver_license.license_number}</p>
            </div>
            <div>
              <span className="text-gray-600">ประเภท:</span>
              <p className="font-medium">{formData.driver_license.license_type}</p>
            </div>
            <div>
              <span className="text-gray-600">วันหมดอายุ:</span>
              <p className="font-medium">{formData.driver_license.expiry_date}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Vehicles */}
      {formData.has_vehicle && formData.vehicles && formData.vehicles.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">รถยนต์</h3>
          {formData.vehicles.map((vehicle, index) => (
            <div key={index} className="mb-6 last:mb-0 pb-4 border-b border-gray-300 last:border-0">
              <p className="font-medium text-gray-900 mb-3 flex items-center">
                <Car size={18} className="mr-2 text-blue-600" />
                รถคันที่ {index + 1}
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">ทะเบียน:</span>
                  <p className="font-medium">{vehicle.license_plate}</p>
                </div>
                <div>
                  <span className="text-gray-600">ประเภท:</span>
                  <p className="font-medium">
                    {vehicle.vehicle_type === 'car' ? 'รถยนต์' : 
                     vehicle.vehicle_type === 'motorcycle' ? 'มอเตอร์ไซค์' : 
                     vehicle.vehicle_type === 'tricycle' ? 'สามล้อ/ตุ๊กตุ๊ก' : 'รถกระบะ'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">ยี่ห้อ/รุ่น:</span>
                  <p className="font-medium">{vehicle.vehicle_brand} {vehicle.vehicle_model}</p>
                </div>
                <div>
                  <span className="text-gray-600">ปี/สี:</span>
                  <p className="font-medium">{vehicle.vehicle_year} / {vehicle.vehicle_color}</p>
                </div>
                <div>
                  <span className="text-gray-600">จังหวัด:</span>
                  <p className="font-medium">{vehicle.vehicle_province}</p>
                </div>
                <div>
                  <span className="text-gray-600">เจ้าของ:</span>
                  <p className="font-medium">
                    {vehicle.is_owner ? '✅ ฉันเอง' : `${vehicle.owner_name} (${vehicle.relationship_to_owner})`}
                  </p>
                </div>
                {vehicle.registration_book_photo_url && (
                  <div className="col-span-2">
                    <span className="text-gray-600">เล่มทะเบียนรถ:</span>
                    <img 
                      src={vehicle.registration_book_photo_url} 
                      alt="Registration Book" 
                      className="mt-2 w-32 h-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Confirmation */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
        <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-green-800">
          <p className="font-medium">พร้อมส่งข้อมูลแล้ว</p>
          <p className="text-green-700 mt-1">
            ข้อมูลทั้งหมดจะถูกเข้ารหัสและส่งไปยังเจ้าหน้าที่เพื่อตรวจสอบ
          </p>
        </div>
      </div>
    </div>
  );
};

// Reusable Image Upload Box Component
const ImageUploadBox: React.FC<{
  label: string;
  imageUrl?: string;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  uploading: boolean;
  error?: string;
  aspectRatio?: 'card' | 'square';
}> = ({ label, imageUrl, onUpload, onRemove, uploading, error, aspectRatio = 'card' }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!imageUrl && fileInputRef.current) fileInputRef.current.value = '';
  }, [imageUrl]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div
        onClick={() => {
          if (!uploading) fileInputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (!uploading && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        className={`relative border-2 border-dashed rounded-lg transition-all ${
          uploading ? 'cursor-wait opacity-80' : 'cursor-pointer'
        } ${
          error ? 'border-red-500' : imageUrl ? 'border-green-500' : 'border-gray-300 hover:border-blue-500'
        } ${aspectRatio === 'square' ? 'aspect-square' : 'aspect-video'}`}
      >
        {imageUrl && !uploading && typeof onRemove === 'function' ? (
          <button
            type="button"
            title="ลบรูปที่แนบ"
            className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg bg-red-600 text-white px-2.5 py-1.5 text-xs font-semibold shadow-md hover:bg-red-700 active:scale-[0.98]"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 size={14} strokeWidth={2.5} className="shrink-0" />
            ลบรูป
          </button>
        ) : null}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover rounded-lg pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
                <span className="text-sm">กำลังอัปโหลด...</span>
              </>
            ) : (
              <>
                <Upload size={32} className="mb-2" />
                <span className="text-sm">คลิกเพื่ออัปโหลด</span>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
          }}
          className="hidden"
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export { KYCWizard };
export default KYCWizard;
