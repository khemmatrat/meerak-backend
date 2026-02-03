
import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Clock, CheckCircle, Send, Bot, AlertCircle, Phone, Mail, FileText, Zap } from 'lucide-react';
import { MOCK_TICKETS, MOCK_CHAT_HISTORY, MOCK_USERS, MOCK_AUTO_REPLY_RULES } from '../constants';
import { SupportTicket, ChatMessage, MobileUser } from '../types';

export const SupportTicketView: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>(MOCK_TICKETS);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(MOCK_TICKETS[0].id);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(MOCK_CHAT_HISTORY);
  const [messageInput, setMessageInput] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const selectedUser = MOCK_USERS.find(u => u.id === selectedTicket?.userId);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    // 1. Add Admin Message
    const adminMsg: ChatMessage = {
      id: `MSG-${Date.now()}`,
      sender: 'ADMIN',
      message: messageInput,
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    setChatHistory(prev => [...prev, adminMsg]);
    setMessageInput('');

    // 2. Simulate User Reply (Random delay)
    setTimeout(() => {
        // In a real app, this would wait for WebSocket
    }, 2000);
  };

  // Simulate Auto-Reply Logic (For demo purposes, we trigger it on specific keywords if Admin types them or if we simulate a new user message)
  // Here, we'll demonstrate it by adding a "Test User Message" button to trigger the bot
  const simulateIncomingUserMessage = (text: string) => {
    const userMsg: ChatMessage = {
        id: `MSG-${Date.now()}`,
        sender: 'USER',
        message: text,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    };
    setChatHistory(prev => [...prev, userMsg]);

    // Check for Auto-Reply
    if (autoReplyEnabled) {
        const matchedRule = MOCK_AUTO_REPLY_RULES.find(rule => 
            rule.isEnabled && text.includes(rule.keyword)
        );

        if (matchedRule) {
            setTimeout(() => {
                const botMsg: ChatMessage = {
                    id: `MSG-BOT-${Date.now()}`,
                    sender: 'BOT',
                    message: matchedRule.response,
                    timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                };
                setChatHistory(prev => [...prev, botMsg]);
            }, 1000); // Fast response
        }
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6">
      
      {/* Left: Ticket List */}
      <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
           <h3 className="font-bold text-slate-800 mb-2">Active Tickets</h3>
           <div className="flex gap-2">
             <button className="flex-1 py-1 text-xs font-bold bg-indigo-600 text-white rounded">Open (3)</button>
             <button className="flex-1 py-1 text-xs font-bold bg-white border border-slate-200 text-slate-500 rounded">Resolved</button>
           </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {tickets.map(ticket => (
            <div 
              key={ticket.id} 
              onClick={() => setSelectedTicketId(ticket.id)}
              className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${selectedTicketId === ticket.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''}`}
            >
               <div className="flex justify-between items-start mb-1">
                 <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    ticket.priority === 'URGENT' ? 'bg-rose-100 text-rose-600' :
                    ticket.priority === 'HIGH' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'
                 }`}>{ticket.priority}</span>
                 <span className="text-[10px] text-slate-400">{ticket.lastUpdated}</span>
               </div>
               <h4 className="font-bold text-sm text-slate-800 mb-1 truncate">{ticket.subject}</h4>
               <p className="text-xs text-slate-500 truncate">{ticket.id} • {ticket.category}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Chat Interface */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
           <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                 {selectedTicket?.subject} 
                 <span className="px-2 py-0.5 rounded-full bg-slate-200 text-xs font-normal text-slate-600">{selectedTicket?.id}</span>
              </h3>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={12} /> Response Time Target: &lt; 15 mins
              </p>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
                <Bot size={16} className={autoReplyEnabled ? "text-indigo-600" : "text-slate-400"} />
                <span className="text-xs font-bold text-indigo-700">Auto-Reply Bot</span>
                <button 
                  onClick={() => setAutoReplyEnabled(!autoReplyEnabled)}
                  className={`w-8 h-4 rounded-full transition-colors relative ${autoReplyEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                >
                   <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${autoReplyEnabled ? 'left-4.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors">
                <CheckCircle size={14} /> Mark Resolved
              </button>
           </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
           {chatHistory.map((msg) => (
             <div key={msg.id} className={`flex ${msg.sender === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[80%] ${msg.sender === 'ADMIN' ? 'flex-row-reverse' : ''}`}>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.sender === 'ADMIN' ? 'bg-indigo-600 text-white' : 
                      msg.sender === 'BOT' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                   }`}>
                      {msg.sender === 'ADMIN' && <User size={16} />}
                      {msg.sender === 'BOT' && <Bot size={16} />}
                      {msg.sender === 'USER' && <User size={16} />}
                   </div>
                   <div>
                      <div className={`p-3 rounded-2xl text-sm ${
                        msg.sender === 'ADMIN' ? 'bg-indigo-600 text-white rounded-tr-none' : 
                        msg.sender === 'BOT' ? 'bg-purple-50 text-purple-900 border border-purple-100 rounded-tl-none' :
                        'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}>
                         {msg.sender === 'BOT' && <div className="text-[10px] font-bold text-purple-600 mb-1 flex items-center gap-1"><Zap size={10} /> Automated Response</div>}
                         {msg.message}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block px-1">{msg.timestamp}</span>
                   </div>
                </div>
             </div>
           ))}
        </div>

        {/* Debug / Demo Tools (Hidden in Prod) */}
        <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex gap-2 overflow-x-auto">
            <span className="text-xs font-bold text-slate-500 py-1">Simulate User:</span>
            <button onClick={() => simulateIncomingUserMessage('โอนเงินไม่เข้าครับ')} className="px-2 py-1 bg-white border border-slate-300 rounded text-xs hover:bg-slate-50">"โอนเงินไม่เข้า"</button>
            <button onClick={() => simulateIncomingUserMessage('ลืมรหัสผ่านทำไง')} className="px-2 py-1 bg-white border border-slate-300 rounded text-xs hover:bg-slate-50">"ลืมรหัสผ่าน"</button>
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-3">
           <input 
             type="text" 
             value={messageInput}
             onChange={(e) => setMessageInput(e.target.value)}
             placeholder="Type your reply..."
             className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all"
           />
           <button 
             type="submit"
             disabled={!messageInput.trim()}
             className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
           >
             <Send size={18} /> Send
           </button>
        </form>
      </div>

      {/* Right: User Context (CRM) */}
      <div className="w-80 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col shrink-0">
         <div className="p-6 border-b border-slate-100 flex flex-col items-center">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-2xl mb-3">
               {selectedUser?.username.charAt(0).toUpperCase()}
            </div>
            <h3 className="font-bold text-lg text-slate-800">{selectedUser?.username}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold mt-1 ${
               selectedUser?.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>{selectedUser?.status.toUpperCase()}</span>
         </div>
         
         <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            <div>
               <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Contact Info</h4>
               <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-slate-600">
                     <Mail size={16} /> <span className="truncate">{selectedUser?.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                     <Phone size={16} /> <span>+66 89 123 4567</span>
                  </div>
               </div>
            </div>

            <div>
               <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Financial Context</h4>
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-slate-500 text-xs">Total Spent (Lifetime)</p>
                  <p className="text-xl font-bold text-slate-800">฿{selectedUser?.totalSpent.toLocaleString()}</p>
                  <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                     <span className="text-xs text-slate-500">Last Transaction</span>
                     <span className="text-xs font-bold text-emerald-600">Today, 10:00 AM</span>
                  </div>
               </div>
            </div>

            <div>
               <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Previous Tickets</h4>
               <div className="space-y-2">
                  {[1, 2].map(i => (
                     <div key={i} className="flex items-center gap-2 text-xs p-2 hover:bg-slate-50 rounded cursor-pointer border border-transparent hover:border-slate-100">
                        <FileText size={14} className="text-slate-400" />
                        <span className="text-slate-600 truncate flex-1">Login issue on Android...</span>
                        <span className="text-emerald-600 font-bold">Done</span>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>

    </div>
  );
};
