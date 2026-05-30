import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useLoginMutation } from '../hooks/useAuth';
import { User, Lock, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const toast = useToast();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username || !password) {
      setErrorMsg('Please specify both username and password.');
      return;
    }

    loginMutation.mutate(
      { username, password },
      {
        onSuccess: () => {
          toast.success('Successfully authenticated!');
          navigate(from, { replace: true });
        },
        onError: (err: any) => {
          const apiErr = err?.response?.data?.error;
          setErrorMsg(apiErr?.message || 'Authentication failed. Please check credentials.');
        }
      }
    );
  };

  const handleQuickLogin = (user: string) => {
    setUsername(user);
    const formattedPassword = `${user.charAt(0).toUpperCase()}${user.slice(1)}@12345`;
    setPassword(formattedPassword);
    toast.success(`Autofilled credentials for ${user}!`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden font-sans select-none text-slate-800">

      {/* Background soft gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-100/50 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-100/50 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in space-y-6">

        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 shadow-md text-white font-bold text-lg mb-1 select-none">
            ▲
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Enter your credentials to access your collaborative workspaces
          </p>
        </div>

        {/* Clean Light-Mode Auth Card */}
        <Card className="shadow-lg border border-slate-200 bg-white">
          <CardBody className="p-8">

            {/* Session Expiry Banner */}
            {location.search.includes('expired=true') && (
              <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>Your session has expired. Please log in again to continue.</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {/* Username Field */}
              <Input
                label="Username or Email"
                placeholder="e.g. alice or alice@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                leftIcon={<User className="w-4 h-4 text-slate-400" />}
                required
              />

              {/* Password Field */}
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
                required
              />

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                className="w-full font-semibold shadow-md mt-2"
                isLoading={loginMutation.isPending}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Sign In
              </Button>
            </form>

            {/* Register Link */}
            <div className="mt-5 text-center text-xs text-slate-500 font-medium">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 font-bold hover:underline">
                Create one
              </Link>
            </div>

          </CardBody>
        </Card>

        {/* Seeded Demo Accounts Panel */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white/70 backdrop-blur-sm text-left space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 select-none">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Quick-Access Seed Profiles
            </h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 font-bold uppercase tracking-wider select-none">
              Developer Demo
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-normal select-none">
            Click any test profile card below to pre-fill active authentication credentials automatically:
          </p>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={() => handleQuickLogin('alice')}
              className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm hover:-translate-y-0.5 transition duration-150 text-left space-y-0.5 group"
            >
              <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600">Alice</span>
              <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Admin</span>
            </button>
            <button
              onClick={() => handleQuickLogin('bob')}
              className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm hover:-translate-y-0.5 transition duration-150 text-left space-y-0.5 group"
            >
              <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600">Bob</span>
              <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wide">Manager</span>
            </button>
            <button
              onClick={() => handleQuickLogin('charlie')}
              className="flex flex-col p-2.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm hover:-translate-y-0.5 transition duration-150 text-left space-y-0.5 group"
            >
              <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600">Charlie</span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Member</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
