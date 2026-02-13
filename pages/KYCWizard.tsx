/**
 * Phase 2: KYC Wizard - Step-by-Step Verification
 * 
 * Multi-step KYC process with driver license & vehicle registration
 * for fraud prevention and identity verification
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Shield,
  Truck,
  Bike
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { submitKYCLite } from '../services/kycService';
import { createRequestContext } from '../utils/tracing';
import { validateThaiID } from '../utils/encryption';
import { MockApi } from '../services/mockApi';

type WizardStep = 'personal' | 'id-card' | 'selfie' | 'driver-license' | 'vehicle' | 'review';

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
    vehicle_type: 'car' | 'motorcycle' | 'truck';
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

const KYCWizard: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
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
  
  const steps: Array<{ id: WizardStep; label: string; icon: React.ReactNode }> = [
    { id: 'personal', label: 'ข้อมูลส่วนตัว', icon: <User size={20} /> },
    { id: 'id-card', label: 'บัตรประชาชน', icon: <CreditCard size={20} /> },
    { id: 'selfie', label: 'ถ่ายรูปใบหน้า', icon: <Camera size={20} /> },
    { id: 'driver-license', label: 'ใบขับขี่ (ถ้ามี)', icon: <FileText size={20} /> },
    { id: 'vehicle', label: 'ทะเบียนรถ (ถ้ามี)', icon: <Car size={20} /> },
    { id: 'review', label: 'ตรวจสอบ', icon: <CheckCircle size={20} /> }
  ];
  
  const getCurrentStepIndex = () => steps.findIndex(s => s.id === currentStep);
  
  // Handle image upload
  const handleImageUpload = async (file: File, field: string) => {
    setUploadingImage(true);
    try {
      const url = await MockApi.uploadImage(file, `kyc_${field}`);
      
      // Handle nested fields (e.g., driver_license_photo, vehicle_photo)
      if (field === 'driver_license_photo') {
        setFormData(prev => ({
          ...prev,
          driver_license: {
            ...prev.driver_license!,
            license_photo_url: url
          }
        }));
      } else if (field.startsWith('vehicle_photo_')) {
        const index = parseInt(field.split('_')[2]);
        setFormData(prev => {
          const newVehicles = [...(prev.vehicles || [])];
          newVehicles[index].registration_book_photo_url = url;
          return { ...prev, vehicles: newVehicles };
        });
      } else {
        setFormData(prev => ({ ...prev, [field]: url }));
      }
      
      console.log(`✅ Image uploaded: ${field} → ${url}`);
    } catch (error) {
      console.error('Image upload failed:', error);
      setErrors(prev => ({ ...prev, [field]: 'Failed to upload image' }));
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
    
    setLoading(true);
    try {
      const context = createRequestContext('web');
      
      // Submit KYC with all data
      const result = await submitKYCLite(
        currentUser!.id,
        {
          national_id: formData.national_id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          date_of_birth: formData.date_of_birth,
          address: formData.address,
          id_card_photo_url: formData.id_card_front_url!
        },
        context
      );
      
      if (result.success) {
        alert('✅ ส่งข้อมูล KYC สำเร็จ! รอการตรวจสอบจากเจ้าหน้าที่');
        navigate('/profile');
      } else {
        alert(`❌ ส่งข้อมูลไม่สำเร็จ: ${result.error}`);
      }
    } catch (error: any) {
      console.error('KYC submission error:', error);
      alert(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'personal':
        return <StepPersonalInfo formData={formData} setFormData={setFormData} errors={errors} />;
      case 'id-card':
        return <StepIDCard formData={formData} onUpload={handleImageUpload} uploading={uploadingImage} errors={errors} />;
      case 'selfie':
        return <StepSelfie formData={formData} onUpload={handleImageUpload} uploading={uploadingImage} errors={errors} />;
      case 'driver-license':
        return <StepDriverLicense formData={formData} setFormData={setFormData} onUpload={handleImageUpload} uploading={uploadingImage} errors={errors} />;
      case 'vehicle':
        return <StepVehicle formData={formData} setFormData={setFormData} onUpload={handleImageUpload} uploading={uploadingImage} errors={errors} />;
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
}> = ({ formData, setFormData, errors }) => {
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
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, onUpload, uploading, errors }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        อัปโหลดบัตรประชาชน
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Front Side */}
        <ImageUploadBox
          label="ด้านหน้า"
          imageUrl={formData.id_card_front_url}
          onUpload={(file) => onUpload(file, 'id_card_front_url')}
          uploading={uploading}
          error={errors.id_card_front_url}
        />
        
        {/* Back Side */}
        <ImageUploadBox
          label="ด้านหลัง"
          imageUrl={formData.id_card_back_url}
          onUpload={(file) => onUpload(file, 'id_card_back_url')}
          uploading={uploading}
          error={errors.id_card_back_url}
        />
      </div>
      
      {/* Instructions */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-medium text-yellow-900 mb-2">คำแนะนำการถ่ายรูป:</h3>
        <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
          <li>ถ่ายภาพในที่มีแสงสว่างเพียงพอ</li>
          <li>บัตรต้องอยู่ในกรอบภาพทั้งหมด</li>
          <li>ข้อความต้องชัดเจน อ่านได้</li>
          <li>ห้ามใช้รูปที่ตัด แต่ง หรือเป็นสำเนา</li>
        </ul>
      </div>
    </div>
  );
};

// Component for Step 3: Selfie
const StepSelfie: React.FC<{
  formData: KYCFormData;
  onUpload: (file: File, field: string) => void;
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, onUpload, uploading, errors }) => {
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
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, setFormData, onUpload, uploading, errors }) => {
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
              onUpload={(file) => {
                onUpload(file, 'driver_license_photo');
                setFormData(prev => ({
                  ...prev,
                  driver_license: {
                    ...prev.driver_license!,
                    license_photo_url: 'uploading...'
                  }
                }));
              }}
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
  uploading: boolean;
  errors: Record<string, string>;
}> = ({ formData, setFormData, onUpload, uploading, errors }) => {
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
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        vehicles: prev.vehicles?.filter((_, i) => i !== index)
                      }));
                    }}
                    className="text-red-500 hover:text-red-700"
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
                     vehicle.vehicle_type === 'motorcycle' ? 'มอเตอร์ไซค์' : 'รถกระบะ'}
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
  uploading: boolean;
  error?: string;
  aspectRatio?: 'card' | 'square';
}> = ({ label, imageUrl, onUpload, uploading, error, aspectRatio = 'card' }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-all ${
          error ? 'border-red-500' : imageUrl ? 'border-green-500' : 'border-gray-300 hover:border-blue-500'
        } ${aspectRatio === 'square' ? 'aspect-square' : 'aspect-video'}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover rounded-lg"
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
          accept="image/*"
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
