
import React, { useState } from 'react';
import { Shield, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Legal: React.FC = () => {
  const [tab, setTab] = useState<'terms' | 'privacy'>('terms');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/settings" className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-bold text-lg text-gray-900">Legal & Compliance</h1>
          <div className="w-10"></div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex space-x-2 mb-6 bg-white p-1 rounded-xl border border-gray-200">
          <button 
            onClick={() => setTab('terms')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'terms' ? 'bg-slate-800 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Terms of Service
          </button>
          <button 
            onClick={() => setTab('privacy')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'privacy' ? 'bg-slate-800 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Privacy Policy
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 prose prose-slate max-w-none">
          {tab === 'terms' ? (
            <div>
              <h2 className="flex items-center text-2xl font-bold text-slate-900 mb-6">
                <FileText className="mr-3 text-emerald-600" /> Terms of Service
              </h2>
              <p className="text-sm text-gray-500 mb-4">Last Updated: November 24, 2025</p>
              
              <h3>1. Introduction</h3>
              <p>Welcome to Meerak. By accessing our platform, you agree to these Terms of Service.</p>

              <h3>2. User Responsibilities</h3>
              <p>Users must provide accurate information and conduct themselves professionally. Harassment or illegal activities will result in immediate bans.</p>

              <h3>3. Payments & Fees</h3>
              <p>Platform fees are deducted from provider earnings based on their tier level. Refunds are handled via the Dispute Resolution Center.</p>

              <h3>4. Liability</h3>
              <p>Meerak acts as an intermediary. We are not liable for the actions of individual providers or users, though we facilitate dispute resolution.</p>
            </div>
          ) : (
            <div>
              <h2 className="flex items-center text-2xl font-bold text-slate-900 mb-6">
                <Shield className="mr-3 text-blue-600" /> Privacy Policy
              </h2>
              <p className="text-sm text-gray-500 mb-4">Last Updated: November 24, 2025</p>

              <h3>1. Data Collection</h3>
              <p>We collect information you provide directly (name, phone, KYC docs) and usage data (location, transaction history) to improve our service.</p>

              <h3>2. Data Usage</h3>
              <p>Your data is used to match jobs, process payments, and verify identity. We do not sell your personal data to third parties.</p>

              <h3>3. Security</h3>
              <p>We use industry-standard encryption for data transmission and storage. Payment details are processed via secure gateways.</p>

              <h3>4. Your Rights</h3>
              <p>You can request data deletion or export your data at any time via Settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
