
import React, { useState } from 'react';
import { Shield, Phone, MapPin, AlertTriangle, X, Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

export const SafetyWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();
  const { notify } = useNotification();
  const [sendingSOS, setSendingSOS] = useState(false);

  const handleSOS = () => {
      setSendingSOS(true);
      // Simulate API call to backend
      setTimeout(() => {
          setSendingSOS(false);
          notify(t('safety.sending_sos'), 'error');
          setTimeout(() => {
              alert('SOS Alert Sent to Emergency Contacts and Authorities!');
          }, 500);
      }, 1500);
  };

  const handleShareLocation = () => {
      if (navigator.geolocation) {
          notify('Fetching location...', 'info');
          navigator.geolocation.getCurrentPosition(() => {
              notify('Live Location Shared with Trusted Contacts', 'success');
          });
      }
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
        {isOpen && (
            <div className="mb-4 bg-white rounded-2xl shadow-xl border border-red-100 overflow-hidden animate-in slide-in-from-bottom-10 w-64">
                <div className="bg-red-500 text-white p-3 flex justify-between items-center">
                    <span className="font-bold text-sm flex items-center"><Shield size={16} className="mr-2" /> {t('safety.title')}</span>
                    <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white"><X size={16}/></button>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-xs text-gray-500 mb-2">{t('safety.help_desc')}</p>
                    
                    <button 
                        onClick={handleSOS}
                        disabled={sendingSOS}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center justify-center animate-pulse shadow-md shadow-red-200"
                    >
                        {sendingSOS ? t('payment.processing') : <><AlertTriangle size={18} className="mr-2" /> {t('safety.panic')}</>}
                    </button>

                    <button 
                        onClick={handleShareLocation}
                        className="w-full py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg flex items-center justify-center hover:bg-gray-50"
                    >
                        <MapPin size={18} className="mr-2 text-blue-500" /> {t('safety.share_loc')}
                    </button>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <a href="tel:191" className="py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg flex flex-col items-center justify-center hover:bg-gray-200">
                            <Phone size={14} className="mb-1" /> 191 (Police)
                        </a>
                        <a href="tel:1669" className="py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg flex flex-col items-center justify-center hover:bg-gray-200">
                             <Phone size={14} className="mb-1" /> 1669 (Medic)
                        </a>
                    </div>
                </div>
            </div>
        )}

        <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`p-3 rounded-full shadow-lg transition-transform active:scale-90 ${isOpen ? 'bg-gray-600 text-white rotate-45' : 'bg-white text-red-500 border-2 border-red-100 hover:bg-red-50'}`}
        >
            {isOpen ? <Plus size={24} /> : <Shield size={28} fill="currentColor" className="text-red-100 stroke-red-500" />}
        </button>
    </div>
  );
};
