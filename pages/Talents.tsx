
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MockApi } from '../services/mockApi';
import { UserProfile } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Search, Star, GraduationCap, Heart, MapPin, Filter, User, Briefcase, Rocket } from 'lucide-react';

export const Talents: React.FC = () => {
  const [providers, setProviders] = useState<UserProfile[]>([]);
  const [filtered, setFiltered] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const { t } = useLanguage();

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const data = await MockApi.getProviders();
        setProviders(data);
        setFiltered(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  useEffect(() => {
      let result = providers;

      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(p => 
              p.name.toLowerCase().includes(q) || 
              (p.university && p.university.toLowerCase().includes(q)) ||
              (p.looks && p.looks.some(tag => tag.toLowerCase().includes(q)))
          );
      }

      if (genderFilter !== 'all') {
          result = result.filter(p => p.gender === genderFilter);
      }

      setFiltered(result);
  }, [searchQuery, genderFilter, providers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Heart className="text-pink-500 mr-2 fill-current" />
                {t('talents.title')}
            </h1>
            <p className="text-gray-500 mt-1">{t('talents.subtitle')}</p>
        </div>
        
        <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-gray-200 overflow-x-auto max-w-full">
             <button 
                onClick={() => setGenderFilter('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${genderFilter === 'all' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                 {t('talents.filter_all')}
             </button>
             <button 
                onClick={() => setGenderFilter('female')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${genderFilter === 'female' ? 'bg-pink-100 text-pink-700' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                 {t('talents.filter_female')}
             </button>
             <button 
                onClick={() => setGenderFilter('male')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${genderFilter === 'male' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                 {t('talents.filter_male')}
             </button>
             <button 
                onClick={() => setGenderFilter('lgbtq')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${genderFilter === 'lgbtq' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-50'}`}
             >
                 {t('talents.filter_lgbtq')}
             </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input 
            type="text" 
            placeholder={t('talents.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
        />
      </div>

      {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[1,2,3].map(i => <div key={i} className="h-80 bg-gray-100 rounded-2xl animate-pulse"></div>)}
          </div>
      ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                      {t('talents.no_results')}
                  </div>
              ) : (
                  filtered.map(person => (
                      <div 
                        key={person.id} 
                        className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-all group relative ${person.is_boosted ? 'border-amber-300 ring-2 ring-amber-100 transform scale-[1.02]' : 'border-gray-100'}`}
                      >
                           {/* Boost Rocket Badge */}
                           {person.is_boosted && (
                               <div className="absolute top-2 left-2 z-10 bg-amber-400 text-white p-1.5 rounded-full shadow-md animate-bounce">
                                   <Rocket size={14} fill="currentColor" />
                               </div>
                           )}

                           {/* Image */}
                           <div className="h-64 bg-gray-200 relative overflow-hidden">
                               <img 
                                  src={person.avatar_url} 
                                  alt={person.name} 
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                               />
                               
                               {/* Online Status Dot */}
                               {person.is_online && (
                                   <div className="absolute top-4 right-4 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm z-10" title="Online"></div>
                               )}

                               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
                                   <div className="flex justify-between items-end text-white">
                                       <div>
                                            <h3 className="text-xl font-bold flex items-center">
                                                {person.name} 
                                                {person.age && <span className="ml-2 text-sm font-normal opacity-90">{person.age}</span>}
                                            </h3>
                                            {person.university && (
                                                <p className="text-xs opacity-90 flex items-center mt-0.5">
                                                    <GraduationCap size={12} className="mr-1" /> {person.university}
                                                </p>
                                            )}
                                       </div>
                                       <div className="flex items-center bg-black/30 px-2 py-1 rounded-lg backdrop-blur-sm">
                                           <Star size={14} className="text-yellow-400 fill-current mr-1" />
                                           <span className="font-bold text-sm">{person.rating}</span>
                                       </div>
                                   </div>
                               </div>
                           </div>

                           {/* Details */}
                           <div className="p-4">
                               <div className="flex flex-wrap gap-1 mb-3">
                                    {person.looks?.map(tag => (
                                        <span key={tag} className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-gray-100 text-gray-600 rounded-md">
                                            {tag}
                                        </span>
                                    ))}
                               </div>
                               
                               <div className="flex justify-between text-xs text-gray-500 mb-4">
                                   {person.height && (
                                       <span className="flex items-center" title={t('talents.height')}><User size={12} className="mr-1" /> {person.height} cm</span>
                                   )}
                                   <span className="flex items-center"><Briefcase size={12} className="mr-1" /> {person.completed_jobs_count} jobs</span>
                               </div>

                               <Link 
                                  to={`/create-job?providerId=${person.id}&providerName=${encodeURIComponent(person.name)}`}
                                  className="block w-full py-2 text-center bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                               >
                                   {t('talents.hire')}
                               </Link>
                           </div>
                      </div>
                  ))
              )}
          </div>
      )}
    </div>
  );
};
