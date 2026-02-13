
import React, { useState } from 'react';
import { BookOpen, Search, FileText, ChevronRight, Tag } from 'lucide-react';
import { MOCK_DOCS } from '../constants';
import { DocArticle } from '../types';

export const DocumentationView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeArticle, setActiveArticle] = useState<DocArticle | null>(null);

  const categories = ['All', 'General', 'Security', 'Operations', 'Infrastructure', 'Support'];

  const filteredDocs = MOCK_DOCS.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          doc.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6">
      
      {/* Sidebar: Navigation & Search */}
      <div className="w-80 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
           <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
             <BookOpen size={20} className="text-indigo-600" />
             System Manual
           </h3>
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
               type="text" 
               placeholder="Search documentation..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
             />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
           {/* Categories */}
           <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Categories</h4>
              <div className="flex flex-wrap gap-2">
                 {categories.map(cat => (
                   <button
                     key={cat}
                     onClick={() => setSelectedCategory(cat)}
                     className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                       selectedCategory === cat 
                         ? 'bg-indigo-600 text-white' 
                         : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                     }`}
                   >
                     {cat}
                   </button>
                 ))}
              </div>
           </div>

           {/* Article List */}
           <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Articles ({filteredDocs.length})</h4>
              <div className="space-y-1">
                 {filteredDocs.map(doc => (
                   <button
                     key={doc.id}
                     onClick={() => setActiveArticle(doc)}
                     className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors group ${
                       activeArticle?.id === doc.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'
                     }`}
                   >
                      <FileText size={16} className={`shrink-0 mt-0.5 ${activeArticle?.id === doc.id ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <div>
                         <h5 className={`text-sm font-medium ${activeArticle?.id === doc.id ? 'text-indigo-700' : 'text-slate-700'}`}>{doc.title}</h5>
                         <p className="text-xs text-slate-400 mt-1">{doc.category}</p>
                      </div>
                   </button>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* Main Content: Article Viewer */}
      <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
         {activeArticle ? (
           <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto">
                 <div className="mb-6 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium mb-2">
                       <span className="px-2 py-1 bg-indigo-50 rounded flex items-center gap-1">
                         <Tag size={14} /> {activeArticle.category}
                       </span>
                       <span className="text-slate-400">•</span>
                       <span className="text-slate-500">Last updated: {activeArticle.lastUpdated}</span>
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 leading-tight">{activeArticle.title}</h1>
                 </div>
                 
                 <div className="prose prose-slate max-w-none">
                    {/* Simple Markdown-like rendering for the demo */}
                    {activeArticle.content.split('\n').map((line, i) => {
                       if (line.trim().startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-slate-800 mt-6 mb-3">{line.replace('## ', '')}</h2>;
                       if (line.trim().startsWith('### ')) return <h3 key={i} className="text-lg font-bold text-slate-800 mt-4 mb-2">{line.replace('### ', '')}</h3>;
                       if (line.trim().startsWith('- ')) return <li key={i} className="ml-4 list-disc text-slate-600 mb-1">{line.replace('- ', '')}</li>;
                       if (line.trim().match(/^\d\./)) return <div key={i} className="ml-4 text-slate-600 mb-1 font-medium">{line}</div>;
                       return <p key={i} className="text-slate-600 mb-3 leading-relaxed">{line}</p>;
                    })}
                 </div>
              </div>
           </div>
         ) : (
           <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                 <BookOpen size={40} className="text-slate-300" />
              </div>
              <h2 className="text-xl font-bold text-slate-700 mb-2">Welcome to Knowledge Base</h2>
              <p className="max-w-md">Select an article from the sidebar to view detailed operational procedures and troubleshooting guides.</p>
           </div>
         )}
      </div>

    </div>
  );
};
