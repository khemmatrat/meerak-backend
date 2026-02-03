
import React, { useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, Edit2, ExternalLink, Power, Calendar, Eye, Grid, X, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { MOCK_BANNERS } from '../constants';
import { AppBanner } from '../types';

export const ContentManagerView: React.FC = () => {
  const [banners, setBanners] = useState<AppBanner[]>(MOCK_BANNERS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AppBanner | null>(null);

  // Form State
  const initialFormState = {
    title: '',
    imageUrl: '',
    actionUrl: '',
    order: 1,
    startDate: '',
    endDate: '',
    isActive: true
  };
  const [formData, setFormData] = useState(initialFormState);

  // Handlers
  const handleAddNew = () => {
    setEditingBanner(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEdit = (banner: AppBanner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      imageUrl: banner.imageUrl,
      actionUrl: banner.actionUrl,
      order: banner.order,
      startDate: banner.startDate,
      endDate: banner.endDate,
      isActive: banner.isActive
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('ยืนยันการลบแบนเนอร์นี้? (ไม่สามารถกู้คืนได้)')) {
      setBanners(banners.filter(b => b.id !== id));
    }
  };

  const toggleStatus = (id: string) => {
    setBanners(banners.map(b => 
      b.id === id ? { ...b, isActive: !b.isActive } : b
    ));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBanner) {
      setBanners(banners.map(b => 
        b.id === editingBanner.id ? { ...b, ...formData } : b
      ));
    } else {
      const newBanner: AppBanner = {
        id: `B${Date.now()}`,
        ...formData,
        clicks: 0
      };
      setBanners([...banners, newBanner]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Grid size={20} className="text-indigo-600" />
            จัดการแบนเนอร์ (Banner Management)
          </h2>
          <p className="text-slate-500 text-sm">จัดการภาพสไลด์หน้าแรกและแคมเปญต่างๆ</p>
        </div>
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-indigo-200"
        >
          <Plus size={18} /> เพิ่มแบนเนอร์ใหม่
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banners.map((banner) => (
          <div key={banner.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all group hover:shadow-lg ${banner.isActive ? 'border-slate-200' : 'border-slate-200 opacity-75'}`}>
            <div className="relative h-48 bg-slate-100">
              <img 
                src={banner.imageUrl} 
                alt={banner.title} 
                className={`w-full h-full object-cover transition-all ${!banner.isActive && 'grayscale'}`}
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Invalid+Image'; }}
              />
              <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                ORDER: {banner.order}
              </div>
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                 <button 
                    onClick={() => handleEdit(banner)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg text-slate-800 text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                 >
                    <Edit2 size={14} /> แก้ไข
                 </button>
                 <button 
                    onClick={() => handleDelete(banner.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors"
                 >
                    <Trash2 size={14} /> ลบ
                 </button>
              </div>
            </div>
            
            <div className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                   <h3 className="font-bold text-slate-800 text-sm leading-tight truncate pr-2">{banner.title}</h3>
                   <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      banner.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                   }`}>
                      {banner.isActive ? 'ACTIVE' : 'INACTIVE'}
                   </span>
                </div>
                <button 
                  onClick={() => toggleStatus(banner.id)}
                  className={`p-1.5 rounded-full transition-colors ${banner.isActive ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                >
                  <Power size={16} />
                </button>
              </div>
              
              <div className="space-y-2">
                 <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded">
                    <Calendar size={12} />
                    <span>{banner.startDate || 'No start date'} - {banner.endDate || 'No end date'}</span>
                 </div>
                 {banner.actionUrl && (
                   <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                      <ExternalLink size={12} />
                      <span className="truncate">{banner.actionUrl}</span>
                   </div>
                 )}
              </div>
            </div>
          </div>
        ))}

        <button 
          onClick={handleAddNew}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all min-h-[300px]"
        >
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Plus size={24} />
          </div>
          <span className="font-bold">เพิ่มแบนเนอร์ใหม่</span>
        </button>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">
                {editingBanner ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์ใหม่'}
              </h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ชื่อแบนเนอร์</label>
                <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Image URL</label>
                <input type="url" required value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1">วันเริ่ม</label>
                   <input type="date" required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-1">วันสิ้นสุด</label>
                   <input type="date" required value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Action / Deep Link</label>
                <input type="text" value={formData.actionUrl} onChange={e => setFormData({...formData, actionUrl: e.target.value})} placeholder="app://promotion/1" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"/>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ลำดับ (Order)</label>
                    <input type="number" value={formData.order} onChange={e => setFormData({...formData, order: parseInt(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                 </div>
                 <div className="flex items-center gap-2 mt-5">
                    <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 accent-indigo-600"/>
                    <label htmlFor="isActive" className="text-sm font-bold text-slate-700">เปิดใช้งานทันที</label>
                 </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">บันทึกข้อมูล</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
