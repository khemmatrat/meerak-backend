
import React, { useState } from 'react';
import { Code, Database, Smartphone, Server, CreditCard, Copy, Check, ArrowRight, Layers, Briefcase, Lock, MessageSquare, HelpCircle, Monitor, Wallet, Landmark, QrCode, Share2, Wifi, CheckCircle, LayoutDashboard } from 'lucide-react';

export const IntegrationHelpView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'connect' | 'architecture' | 'mobile-schema' | 'finance' | 'core-security'>('connect');
  const [copied, setCopied] = useState('');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Code size={20} className="text-indigo-600" />
          System Integration Guide (Developer Portal)
        </h2>
        <p className="text-slate-500 text-sm">คู่มือการเชื่อมต่อระบบ Mobile App เข้ากับ Admin Dashboard นี้</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('connect')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'connect' ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Wifi size={16} /> 1. วิธีเชื่อมต่อ (Pairing)
        </button>
        <button 
          onClick={() => setActiveTab('architecture')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'architecture' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          2. โครงสร้างระบบ (Architecture)
        </button>
        <button 
          onClick={() => setActiveTab('mobile-schema')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mobile-schema' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          3. ข้อมูล Users & Config
        </button>
        <button 
          onClick={() => setActiveTab('finance')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'finance' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          4. การเงิน (Owner Flow)
        </button>
        <button 
          onClick={() => setActiveTab('core-security')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'core-security' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          5. ความปลอดภัย (Security)
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">

          {activeTab === 'connect' && (
             <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6">
                   <h3 className="text-xl font-bold text-emerald-800 mb-2 flex items-center gap-2">
                     <Share2 size={24} />
                     เชื่อมต่อ Mobile App เข้ากับ Dashboard นี้
                   </h3>
                   <p className="text-emerald-700 text-sm leading-relaxed mb-4">
                     เพื่อให้ Mobile App ของคุณทำงานร่วมกับ Dashboard นี้ได้ <strong>ไม่ต้องเขียนโค้ดเชื่อมกันโดยตรง</strong> 
                     เพียงแค่ใช้ <strong>"กุญแจชุดเดียวกัน" (Firebase Configuration)</strong> ใส่ลงในทั้ง 2 ฝั่ง ข้อมูลจะวิ่งหากันอัตโนมัติผ่าน Cloud ครับ
                   </p>
                   
                   <div className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm">
                      <h4 className="font-bold text-slate-700 mb-2 flex justify-between items-center">
                        Firebase Config (กุญแจเชื่อมต่อ)
                        <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">นำค่านี้ไปใส่ใน Mobile App Code</span>
                      </h4>
                      <div className="relative bg-slate-900 rounded-lg p-4 overflow-hidden group">
                        <button 
                          onClick={() => handleCopy(firebaseConfigTemplate)}
                          className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                        >
                          {copied === firebaseConfigTemplate ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <pre className="font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre">
                          {firebaseConfigTemplate}
                        </pre>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <QrCode size={32} className="text-slate-600" />
                      </div>
                      <h4 className="font-bold text-slate-800">สำหรับทีม Dev Mobile</h4>
                      <p className="text-xs text-slate-500 mt-2 mb-4">
                        ส่งไฟล์ <code>google-services.json</code> (Android) หรือ <code>GoogleService-Info.plist</code> (iOS) ให้ทีม Mobile Dev
                      </p>
                      <button className="text-sm font-bold text-indigo-600 hover:underline">
                        ดาวน์โหลดไฟล์ Config
                      </button>
                   </div>

                   <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-emerald-500" />
                      </div>
                      <h4 className="font-bold text-slate-800">ตรวจสอบสถานะ</h4>
                      <p className="text-xs text-slate-500 mt-2 mb-4">
                        เมื่อ Mobile App ใส่ Key ถูกต้องแล้ว ข้อมูล User จะเด้งขึ้นมาในหน้า <strong>User Management</strong> ทันที
                      </p>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                        Ready to Sync
                      </span>
                   </div>
                </div>
             </div>
          )}
          
          {activeTab === 'architecture' && (
            <div className="space-y-8">
              {/* Concept Clarification Block */}
              <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                 <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                   <HelpCircle size={20} />
                   ไขข้อข้องใจ: Dashboard นี้คือ Backend หรือไม่?
                 </h3>
                 <div className="space-y-4 text-sm text-indigo-800">
                    <p>
                      หลายคนอาจสับสนว่า <strong>"Backend Server"</strong> กับ <strong>"Admin Dashboard"</strong> เกี่ยวข้องกันอย่างไร 
                      ขออธิบายด้วยแผนภาพ 3 ส่วนดังนี้ครับ:
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-100 text-center">
                          <div className="mx-auto bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center mb-2">
                            <Smartphone size={20} className="text-slate-600" />
                          </div>
                          <h4 className="font-bold text-slate-800">1. Mobile App</h4>
                          <p className="text-xs text-slate-500 mt-1">หน้าจอสำหรับลูกค้า (Frontend)</p>
                          <div className="mt-2 text-[10px] bg-slate-50 p-1 rounded text-slate-600">
                             "ขอข้อมูลจากตรงกลาง"
                          </div>
                       </div>

                       <div className="bg-white p-4 rounded-lg shadow-sm border-2 border-indigo-500 relative text-center">
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                            THE REAL BACKEND
                          </div>
                          <div className="mx-auto bg-indigo-100 w-10 h-10 rounded-full flex items-center justify-center mb-2">
                            <Database size={20} className="text-indigo-600" />
                          </div>
                          <h4 className="font-bold text-indigo-900">2. Central Server</h4>
                          <p className="text-xs text-indigo-600 mt-1">(Firebase / Cloud)</p>
                          <div className="mt-2 text-[10px] bg-indigo-50 p-1 rounded text-indigo-700 font-bold">
                             "เก็บข้อมูล & ประมวลผล"
                          </div>
                       </div>

                       <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-100 text-center relative">
                          <div className="absolute -top-2 -right-2">
                             <span className="relative flex h-3 w-3">
                               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                               <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                             </span>
                          </div>
                          <div className="mx-auto bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center mb-2">
                            <Monitor size={20} className="text-slate-600" />
                          </div>
                          <h4 className="font-bold text-slate-800">3. This Dashboard</h4>
                          <p className="text-xs text-slate-500 mt-1">หน้าจอสำหรับแอดมิน (Super Admin)</p>
                          <div className="mt-2 text-[10px] bg-slate-50 p-1 rounded text-slate-600">
                             "สั่งการตรงกลาง"
                          </div>
                       </div>
                    </div>

                    <div className="p-4 bg-white/60 rounded-lg mt-4 border border-indigo-100">
                       <ul className="list-disc list-inside space-y-2">
                          <li><strong>Backend จริงๆ (Server)</strong> คือก้อนตรงกลาง (เบอร์ 2) ซึ่งผู้ใช้ทั่วไปมองไม่เห็น</li>
                          <li><strong>แอปนี้ (เบอร์ 3)</strong> คือ "รีโมทคอนโทรล" หรือ "หน้ากาก" ที่เอาไว้ควบคุม Backend นั้น</li>
                          <li><strong>สรุป:</strong> แอปนี้ <u>ไม่ใช่</u> Backend Server โดยตรง แต่เป็น <strong>Super Admin Interface</strong> ที่เชื่อมต่อกับ Backend เดียวกันกับที่ Mobile App ใช้ครับ</li>
                       </ul>
                    </div>
                 </div>
              </div>

              <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-4">Technical Architecture Diagram</h3>
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center gap-4">
                     {/* Diagram Visualization */}
                     <div className="flex items-center gap-4 w-full justify-center">
                        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-center w-32">
                          <Smartphone className="mx-auto text-slate-600 mb-2" />
                          <p className="font-bold text-xs">Mobile App</p>
                          <p className="text-[10px] text-slate-400">(User Side)</p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <ArrowRight className="text-slate-400" />
                          <span className="text-[10px] font-mono text-slate-500">API / SDK</span>
                          <ArrowRight className="text-slate-400 rotate-180" />
                        </div>
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm text-center w-40">
                          <Database className="mx-auto text-indigo-600 mb-2" />
                          <p className="font-bold text-xs text-indigo-700">Firebase Cloud</p>
                          <p className="text-[10px] text-indigo-400">(Shared Database)</p>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <ArrowRight className="text-slate-400" />
                          <span className="text-[10px] font-mono text-slate-500">Admin SDK</span>
                          <ArrowRight className="text-slate-400 rotate-180" />
                        </div>
                        <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg shadow-sm text-center w-32 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-bl-lg"></div>
                          <Server className="mx-auto text-emerald-400 mb-2" />
                          <p className="font-bold text-xs text-white">Nexus Core</p>
                          <p className="text-[10px] text-slate-400">(This App)</p>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mobile-schema' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                     <Database size={18} className="text-indigo-600" />
                     Users Collection Schema
                   </h3>
                   <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Path: /users/{`{userId}`}</span>
                </div>
                <div className="relative bg-slate-900 rounded-lg p-4 overflow-hidden group">
                  <button 
                    onClick={() => handleCopy(userSchema)}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                  >
                    {copied === userSchema ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <pre className="font-mono text-xs text-emerald-400 overflow-x-auto">
                    {userSchema}
                  </pre>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                     <Layers size={18} className="text-purple-600" />
                     App Config Schema (Remote Config)
                   </h3>
                   <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Path: /system/config</span>
                </div>
                <div className="relative bg-slate-900 rounded-lg p-4 overflow-hidden group">
                  <button 
                    onClick={() => handleCopy(configSchema)}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                  >
                    {copied === configSchema ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <pre className="font-mono text-xs text-blue-300 overflow-x-auto">
                    {configSchema}
                  </pre>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  * Mobile App ต้อง Listen document นี้แบบ Realtime เพื่อรับค่า Maintenance Mode หรือ Force Update
                </p>
              </div>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
              
              {/* --- BOSS / OWNER SECTION --- */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white p-6 rounded-xl shadow-lg border border-indigo-700">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-indigo-500 rounded-full">
                    <Wallet size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">ส่วนของเจ้าของ (Owner Flow & Dual Withdrawal)</h3>
                    <p className="text-indigo-200 text-sm">"เงินกำไรอยู่ที่ไหน? ถอนเงินอย่างไร?"</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-sm leading-relaxed">
                    <strong>Dashboard นี้เปรียบเสมือน "ตู้เซฟดิจิทัล" หลักของบริษัทครับ</strong> 
                    แต่เราออกแบบมาให้มีความยืดหยุ่นสูง เจ้าของ (Boss) สามารถถอนเงินได้จาก <strong>2 ช่องทาง</strong> (Dual Gateway)
                  </p>
                  
                  {/* --- NEW SECTION: BOSS APP INTEGRATION --- */}
                  <div className="p-4 bg-indigo-800/50 border border-indigo-500/30 rounded-lg mt-2">
                     <h4 className="font-bold flex items-center gap-2 mb-2 text-indigo-100">
                       <LayoutDashboard size={16} /> การเชื่อมต่อกับ "Boss App" (External Dashboard)
                     </h4>
                     <p className="text-xs text-indigo-200 mb-2">
                       หากบอสมีแอป Dashboard ส่วนตัวสำหรับบริหารงานอยู่แล้ว สามารถเชื่อมต่อให้กดถอนเงินได้เช่นกัน
                       โดยไม่ต้องเข้ามาที่ Nexus Core นี้
                     </p>
                     <ul className="list-disc list-inside text-xs text-indigo-300 space-y-1">
                       <li>ทั้ง Nexus Core และ Boss App จะมองเห็น <strong>"ยอดเงินเดียวกัน"</strong> (Shared Database)</li>
                       <li>เมื่อถอนเงินจาก Boss App ยอดใน Nexus Core ก็จะลดลงตามจริงทันที (Real-time Sync)</li>
                       <li>ใช้ API Key ชุดเดียวกัน (Firebase Config) ในการเชื่อมต่อ</li>
                     </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 mt-4">
                    <div className="flex-1 bg-white/10 p-3 rounded-lg border border-white/10 text-center">
                      <span className="block text-xs text-indigo-300 mb-1">1. เงินเข้า</span>
                      <Smartphone className="mx-auto mb-1 opacity-70" size={20} />
                      <span className="text-xs">ลูกค้าจ่ายเงินในแอป</span>
                    </div>
                    <ArrowRight className="hidden sm:block mt-6 opacity-50" />
                    <div className="flex-1 bg-white/10 p-3 rounded-lg border border-white/10 text-center">
                       <span className="block text-xs text-indigo-300 mb-1">2. ระบบหัก %</span>
                       <Server className="mx-auto mb-1 opacity-70" size={20} />
                       <span className="text-xs">เก็บเข้า Platform Wallet</span>
                    </div>
                    <ArrowRight className="hidden sm:block mt-6 opacity-50" />
                    <div className="flex-1 bg-emerald-500/20 p-3 rounded-lg border border-emerald-500/50 text-center">
                       <span className="block text-xs text-emerald-300 mb-1">3. ถอนเงิน (Dual)</span>
                       <div className="flex justify-center gap-2 mb-1">
                          <Monitor className="text-emerald-400" size={16} />
                          <span className="text-xs text-white">/</span>
                          <Smartphone className="text-emerald-400" size={16} />
                       </div>
                       <span className="text-xs font-bold text-white">กดถอนได้ทั้ง 2 แอป</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* ----------------------------- */}

              <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-100 rounded-lg">
                 <div className="p-2 bg-amber-100 text-amber-600 rounded-full">
                   <CreditCard size={24} />
                 </div>
                 <div>
                   <h3 className="font-bold text-amber-900">Technical Payment Flow</h3>
                   <p className="text-sm text-amber-700">ระบบเบื้องหลังการตัดเงินบัตรเครดิต</p>
                 </div>
              </div>

              <div>
                 <ol className="list-decimal list-inside space-y-4 text-sm text-slate-600 bg-slate-50 p-6 rounded-xl">
                   <li className="pl-2">
                     <span className="font-bold text-slate-800">Mobile App</span> เรียก Cloud Function `createPaymentIntent` เพื่อขอ Token ตัดเงิน
                   </li>
                   <li className="pl-2">
                     <span className="font-bold text-slate-800">User</span> กรอกบัตรเครดิต/สแกน QR Code จ่ายเงินสำเร็จ
                   </li>
                   <li className="pl-2">
                     <span className="font-bold text-slate-800">Payment Gateway</span> ยิง Webhook กลับมาที่ Server
                   </li>
                   <li className="pl-2">
                     <span className="font-bold text-slate-800">Server</span> บันทึก Transaction ลง Firestore Collection `financial_transactions`
                   </li>
                   <li className="pl-2">
                     <span className="font-bold text-slate-800">Dashboard (Financial Audit)</span> จะเห็นรายการทันที และ AI จะคำนวณ Fraud Score ให้
                   </li>
                 </ol>
              </div>

              <div>
                 <h4 className="font-bold text-slate-800 mb-2">Webhook Payload Structure</h4>
                 <div className="bg-slate-900 rounded-lg p-4">
                   <pre className="font-mono text-xs text-amber-300 overflow-x-auto">
{`{
  "event": "charge.complete",
  "data": {
    "id": "ch_123456",
    "amount": 50000, // Satang/Cents
    "currency": "thb",
    "metadata": {
      "userId": "U001",
      "jobId": "JOB-551"
    }
  }
}`}
                   </pre>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'core-security' && (
            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                     <Briefcase size={18} className="text-indigo-600" />
                     Jobs & Hiring Schema
                   </h3>
                   <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Path: /jobs/{`{jobId}`}</span>
                </div>
                <p className="text-sm text-slate-500 mb-3">
                   โครงสร้างข้อมูลสำหรับระบบจ้างงาน (Job Posting & Matching) ที่ใช้ในหน้า Job Operations
                </p>
                <div className="relative bg-slate-900 rounded-lg p-4 overflow-hidden group">
                  <button 
                    onClick={() => handleCopy(jobSchema)}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                  >
                    {copied === jobSchema ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <pre className="font-mono text-xs text-cyan-300 overflow-x-auto">
                    {jobSchema}
                  </pre>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2">
                     <MessageSquare size={18} className="text-pink-600" />
                     Support & Chat Structure
                   </h3>
                   <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Path: /tickets/{`{ticketId}`}</span>
                </div>
                <div className="relative bg-slate-900 rounded-lg p-4 overflow-hidden group">
                  <button 
                    onClick={() => handleCopy(chatSchema)}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                  >
                    {copied === chatSchema ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <pre className="font-mono text-xs text-pink-300 overflow-x-auto">
                    {chatSchema}
                  </pre>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold flex items-center gap-2">
                     <Lock size={18} className="text-emerald-400" />
                     Firestore Security Rules (Critical)
                   </h3>
                   <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">firestore.rules</span>
                </div>
                <p className="text-sm text-slate-300 mb-4">
                   กฎความปลอดภัยที่ต้องนำไปวางใน Firebase Console เพื่อป้องกันไม่ให้ User แก้ไขข้อมูลของคนอื่น
                </p>
                <div className="relative bg-black/30 rounded-lg p-4 overflow-hidden group border border-slate-700">
                  <button 
                    onClick={() => handleCopy(securityRules)}
                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
                  >
                    {copied === securityRules ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <pre className="font-mono text-xs text-emerald-400 overflow-x-auto">
                    {securityRules}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Sidebar: Quick Actions */}
        <div className="space-y-6">
           <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg">
             <h3 className="font-bold mb-2">Ready to Connect?</h3>
             <p className="text-sm text-indigo-200 mb-4">
               นำ API Key จาก Firebase Console มาใส่ในไฟล์ <code>firebaseConfig.ts</code> เพื่อเริ่มใช้งานจริง
             </p>
             <button className="w-full py-2 bg-white text-indigo-900 rounded-lg font-bold text-sm hover:bg-indigo-50 transition-colors">
               Download Config Template
             </button>
           </div>

           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">Developer Resources</h3>
              <ul className="space-y-3 text-sm">
                 <li className="flex items-center gap-2 text-indigo-600 hover:underline cursor-pointer">
                   <Code size={16} /> Firebase SDK for React
                 </li>
                 <li className="flex items-center gap-2 text-indigo-600 hover:underline cursor-pointer">
                   <Smartphone size={16} /> Flutter/React Native Snippets
                 </li>
                 <li className="flex items-center gap-2 text-indigo-600 hover:underline cursor-pointer">
                   <Server size={16} /> Cloud Functions Templates
                 </li>
              </ul>
           </div>
        </div>

      </div>
    </div>
  );
};

// SCHEMAS CONSTANTS
const firebaseConfigTemplate = `// Copy this object to your Mobile App code
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:..."
};`;

const userSchema = `{
  "uid": "string (PK)",
  "username": "string",
  "email": "string",
  "role": "user",
  "walletBalance": number,
  "status": "online" | "offline" | "banned",
  "platform": "ios" | "android",
  "fcmToken": "string (for push notif)",
  "createdAt": "timestamp",
  "lastActive": "timestamp"
}`;

const configSchema = `{
  "minVersion": "1.2.0",
  "maintenanceMode": boolean,
  "welcomeMessage": "string",
  "features": {
    "enableChat": boolean,
    "enablePayment": boolean
  }
}`;

const jobSchema = `{
  "id": "string (PK)",
  "title": "string",
  "description": "string",
  "price": number,
  "employerId": "string (uid)",
  "workerId": "string (uid) | null",
  "status": "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  "location": {
    "lat": number,
    "lng": number,
    "address": "string"
  },
  "tags": ["string"],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}`;

const chatSchema = `// Collection: tickets (Support)
{
  "id": "string (PK)",
  "userId": "string",
  "subject": "string",
  "status": "OPEN" | "RESOLVED",
  "messages": [ // Sub-collection
    {
      "sender": "USER" | "ADMIN" | "BOT",
      "text": "string",
      "timestamp": "timestamp"
    }
  ]
}`;

const securityRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Jobs: Everyone can read OPEN jobs, only owner can edit
    match /jobs/{jobId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth.uid == resource.data.employerId 
                    || request.auth.uid == resource.data.workerId;
    }
    
    // Only Admin (Custom Claim) can read/write system config
    match /system/{docId} {
      allow read: if true; // Public read (for App Config)
      allow write: if request.auth.token.admin == true;
    }
  }
}`;
