
import React, { useState } from 'react';
import { UserCog, Plus, Shield, Key, Ban, CheckCircle, Search, Mail, X } from 'lucide-react';
import { MOCK_STAFF_LIST } from '../constants';
import { StaffProfile, AdminRole } from '../types';

export const StaffManagementView: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffProfile[]>(MOCK_STAFF_LIST);
  const [showModal, setShowModal] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'SUPPORT' as AdminRole });

  const getRoleColor = (role: AdminRole) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'ACCOUNTANT': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'DEVELOPER': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getPermissionsText = (role: AdminRole) => {
    switch (role) {
        case 'SUPER_ADMIN': return 'Full System Access (Dangerous)';
        case 'ACCOUNTANT': return 'Finance, Reports, Strategy Only';
        case 'DEVELOPER': return 'Logs, Health, API Config Only';
        case 'SUPPORT': return 'User Management, Tickets Only';
        default: return 'Restricted';
    }
  };

  const handleAddStaff = (e: React.FormEvent) => {
      e.preventDefault();
      const newProfile: StaffProfile = {
          id: `STF-${Date.now()}`,
          name: newStaff.name,
          email: newStaff.email,
          role: newStaff.role,
          status: 'ACTIVE',
          lastLogin: 'Never',
          addedAt: new Date().toISOString().split('T')[0],
          permissions: [getPermissionsText(newStaff.role)]
      };
      setStaffList([...staffList, newProfile]);
      setShowModal(false);
      setNewStaff({ name: '', email: '', role: 'SUPPORT' });
  };

  const toggleStatus = (id: string) => {
      if (confirm('Are you sure you want to change the access status of this staff member?')) {
          setStaffList(staffList.map(s => s.id === id ? { ...s, status: s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } : s));
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserCog size={20} className="text-indigo-600" />
            Staff & Access Control
          </h2>
          <p className="text-slate-500 text-sm">Manage internal team members and their permission levels.</p>
        </div>
        <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md"
        >
          <Plus size={16} /> Add New Staff
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
           <div className="flex gap-2">
              <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600">All Staff ({staffList.length})</span>
           </div>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Search by name or email..." className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64" />
           </div>
        </div>
        
        <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                 <th className="px-6 py-4">Name / Email</th>
                 <th className="px-6 py-4">Role & Access</th>
                 <th className="px-6 py-4">Status</th>
                 <th className="px-6 py-4">Last Login</th>
                 <th className="px-6 py-4 text-right">Actions</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
              {staffList.map((staff) => (
                 <tr key={staff.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                       <div className="font-bold text-slate-800">{staff.name}</div>
                       <div className="text-slate-500 text-xs flex items-center gap-1 mt-1">
                          <Mail size={12} /> {staff.email}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${getRoleColor(staff.role)}`}>
                          {staff.role.replace('_', ' ')}
                       </span>
                       <div className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                          <Key size={12} /> {getPermissionsText(staff.role)}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       {staff.status === 'ACTIVE' ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                             <CheckCircle size={14} /> Active
                          </div>
                       ) : (
                          <div className="flex items-center gap-1.5 text-rose-600 text-xs font-bold">
                             <Ban size={14} /> Suspended
                          </div>
                       )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                       {staff.lastLogin}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                          onClick={() => toggleStatus(staff.id)}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                             staff.status === 'ACTIVE' 
                             ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' 
                             : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                       >
                          {staff.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                       </button>
                    </td>
                 </tr>
              ))}
           </tbody>
        </table>
      </div>

      {/* ADD STAFF MODAL */}
      {showModal && (
         <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
               <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                  <h3 className="font-bold text-slate-800">Add New Staff Member</h3>
                  <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
               </div>
               <form onSubmit={handleAddStaff} className="p-6 space-y-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                     <input type="text" required value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                     <input type="email" required value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role & Permission</label>
                     <div className="grid grid-cols-1 gap-2">
                        {[
                           { val: 'SUPPORT', label: 'Support (User Management Only)', icon: Shield },
                           { val: 'ACCOUNTANT', label: 'Accountant (Finance Only)', icon: Key },
                           { val: 'DEVELOPER', label: 'Developer (Logs & Health)', icon: UserCog }
                        ].map((roleOption) => (
                           <label key={roleOption.val} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${newStaff.role === roleOption.val ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'}`}>
                              <input 
                                 type="radio" 
                                 name="role" 
                                 value={roleOption.val} 
                                 checked={newStaff.role === roleOption.val} 
                                 onChange={() => setNewStaff({...newStaff, role: roleOption.val as AdminRole})}
                                 className="accent-indigo-600"
                              />
                              <div className="text-slate-600">
                                 <roleOption.icon size={16} />
                              </div>
                              <span className="text-sm font-medium text-slate-700">{roleOption.label}</span>
                           </label>
                        ))}
                     </div>
                  </div>
                  <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors mt-2">
                     Create Account & Send Invite
                  </button>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};
