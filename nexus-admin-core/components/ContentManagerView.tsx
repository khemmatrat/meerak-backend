import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, ExternalLink, Power, Calendar, Grid, X, Tag } from 'lucide-react';
import { getBanners, createBanner, updateBanner, deleteBanner } from '../services/adminApi';
import { getAdminToken } from '../services/adminApi';
import { AppBanner } from '../types';

const initialFormState = {
  title: '',
  imageUrl: '',
  actionUrl: '',
  order: 1,
  startDate: '',
  endDate: '',
  isActive: true,
  promoCode: '',
  discountMaxBaht: '' as number | '',
  discountDescription: '',
};

export const ContentManagerView: React.FC = () => {
  const [banners, setBanners] = useState<AppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AppBanner | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      setError('กรุณา Login เพื่อโหลด/บันทึกแบนเนอร์');
      setLoading(false);
      return;
    }
    getBanners()
      .then((res) => { setBanners(res.banners || []); setError(null); })
      .catch((e: any) => { setError(e?.message || 'โหลดแบนเนอร์ไม่สำเร็จ'); setBanners([]); })
      .finally(() => setLoading(false));
  }, []);

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
      actionUrl: banner.actionUrl || '',
      order: banner.order,
      startDate: banner.startDate || '',
      endDate: banner.endDate || '',
      isActive: banner.isActive,
      promoCode: banner.promoCode || '',
      discountMaxBaht: banner.discountMaxBaht ?? '',
      discountDescription: banner.discountDescription || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบแบนเนอร์นี้? (ไม่สามารถกู้คืนได้)')) return;
    if (!getAdminToken()) return;
    try {
      await deleteBanner(id);
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } catch (e: any) {
      setError(e?.message || 'ลบไม่สำเร็จ');
    }
  };

  const toggleStatus = async (banner: AppBanner) => {
    if (!getAdminToken()) return;
    try {
      await updateBanner(banner.id, { isActive: !banner.isActive });
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: !b.isActive } : b)));
    } catch (e: any) {
      setError(e?.message || 'อัปเดตไม่สำเร็จ');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!getAdminToken()) return;
    setSaving(true);
    try {
      const payload = {
        title: formData.title,
        imageUrl: formData.imageUrl,
        actionUrl: formData.actionUrl || undefined,
        order: formData.order,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        isActive: formData.isActive,
        promoCode: formData.promoCode.trim() || undefined,
        discountMaxBaht: formData.discountMaxBaht === '' ? undefined : Number(formData.discountMaxBaht),
        discountDescription: formData.discountDescription.trim() || undefined,
      };
      if (editingBanner) {
        const res = await updateBanner(editingBanner.id, payload);
        setBanners((prev) => prev.map((b) => (b.id === editingBanner.id ? { ...b, ...res.banner } : b)));
      } else {
        const res = await createBanner(payload);
        setBanners((prev) => [res.banner as AppBanner, ...prev]);
      }
      setIsModalOpen(false);
      setFormData(initialFormState);
      setEditingBanner(null);
    } catch (err: any) {
      setError(err?.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Grid size={20} className="text-indigo-600" />
            จัดการแบนเนอร์ (Banner Management)
          </h2>
          <p className="text-slate-500 text-sm">โพสแบนเนอร์ไปหน้า Home + ตั้งโค้ดส่วนลด (วงเงินจำกัด) สำหรับผู้กดรับ</p>
          {error && <p className="text-rose-600 text-sm mt-1">{error}</p>}
        </div>
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-indigo-200"
        >
          <Plus size={18} /> เพิ่มแบนเนอร์ใหม่
        </button>
      </div>

      {loading && banners.length === 0 && (
        <div className="text-slate-500 py-8 text-center">กำลังโหลดแบนเนอร์...</div>
      )}
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
                  type="button"
                  onClick={() => toggleStatus(banner)}
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
                 {banner.promoCode && (
                   <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-2 rounded">
                      <Tag size={12} />
                      <span>โค้ด {banner.promoCode} • สูงสุด ฿{banner.discountMaxBaht ?? 0}</span>
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
                <input type="text" value={formData.actionUrl} onChange={e => setFormData({...formData, actionUrl: e.target.value})} placeholder="app://promotion/1 หรือ /jobs" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"/>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase">โค้ดส่วนลด (ถ้ามี)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">รหัสโค้ด</label>
                    <input type="text" value={formData.promoCode} onChange={e => setFormData({...formData, promoCode: e.target.value.toUpperCase()})} placeholder="SUMMER50" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono"/>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">วงเงินส่วนลดสูงสุด (บาท)</label>
                    <input type="number" min={0} value={formData.discountMaxBaht} onChange={e => setFormData({...formData, discountMaxBaht: e.target.value === '' ? '' : Number(e.target.value)})} placeholder="100" className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">คำอธิบายโค้ด (แสดงที่หน้า Home)</label>
                  <input type="text" value={formData.discountDescription} onChange={e => setFormData({...formData, discountDescription: e.target.value})} placeholder="ส่วนลดเมื่อจ้างงาน สูงสุด 100 บาท" className="w-full border rounded-lg px-3 py-2 text-sm outline-none"/>
                </div>
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
              <button type="submit" disabled={saving} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
