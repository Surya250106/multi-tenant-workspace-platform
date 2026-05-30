import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Forbidden: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0f19] px-4 font-sans text-center relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 blur-[120px] rounded-full"></div>
      
      <div className="glass-panel p-10 rounded-2xl max-w-md w-full shadow-2xl relative z-10 animate-fade-in">
        <h1 className="text-8xl font-black text-red-500 mb-4 tracking-tighter">403</h1>
        <h3 className="text-2xl font-bold text-white mb-2">Access Denied</h3>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          You do not possess the required workspace role clearances to view this resource. Please contact your workspace administrator for upgrade requests.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="gradient-btn text-white px-6 py-3 rounded-lg text-sm font-semibold shadow-lg shadow-indigoBrand/25"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0f19] px-4 font-sans text-center relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigoBrand/10 blur-[120px] rounded-full"></div>

      <div className="glass-panel p-10 rounded-2xl max-w-md w-full shadow-2xl relative z-10 animate-fade-in">
        <h1 className="text-8xl font-black text-indigoBrand mb-4 tracking-tighter">404</h1>
        <h3 className="text-2xl font-bold text-white mb-2">Page Not Found</h3>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          The collaborative board column or routing path you are trying to visit does not exist or has been deleted.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="gradient-btn text-white px-6 py-3 rounded-lg text-sm font-semibold shadow-lg shadow-indigoBrand/25"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};
