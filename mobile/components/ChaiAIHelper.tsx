import React from 'react';
import { motion } from 'framer-motion';

interface ChaiAIHelperProps {
  tip: string;
  visible?: boolean;
  position?: 'bottom-left' | 'bottom-center' | 'bottom-right';
}

const CHAI_AVATAR = 'https://i.pravatar.cc/150?u=chai-ai'; // Replace with actual Chai avatar URL

export const ChaiAIHelper: React.FC<ChaiAIHelperProps> = ({
  tip,
  visible = true,
  position = 'bottom-center',
}) => {
  if (!visible || !tip) return null;

  const posClasses = {
    'bottom-left': 'left-4 bottom-20',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20',
    'bottom-right': 'right-4 bottom-20',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`fixed z-[300] ${posClasses[position]} max-w-[calc(100vw-2rem)]`}
    >
      <div className="flex items-end gap-3">
        {/* Chai Avatar with pulse */}
        <motion.div
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(234, 179, 8, 0.4)',
              '0 0 0 12px rgba(234, 179, 8, 0)',
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="relative shrink-0"
        >
          <img
            src={CHAI_AVATAR}
            alt="Chai AI"
            className="w-12 h-12 rounded-full border-2 border-amber-400 object-cover"
          />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-charcoal-900 animate-pulse" />
        </motion.div>

        {/* Speech bubble */}
        <div className="relative bg-slate-800/95 backdrop-blur border border-amber-500/30 rounded-2xl rounded-bl-md px-4 py-3 shadow-xl max-w-[280px]">
          <p className="text-sm text-slate-100 leading-relaxed">{tip}</p>
          <div className="absolute -left-2 bottom-3 w-4 h-4 bg-slate-800 border-l border-b border-amber-500/20 transform rotate-45 rounded-sm" />
        </div>
      </div>
    </motion.div>
  );
};
