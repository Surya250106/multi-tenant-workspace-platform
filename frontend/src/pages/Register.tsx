import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRegisterMutation } from '../hooks/useAuth';
import { Mail, User, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !username || !password) {
      setErrorMsg('All fields are required to register.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Passwords must contain at least 6 characters.');
      return;
    }

    registerMutation.mutate(
      { email, username, password },
      {
        onSuccess: () => {
          toast.success('Registration successful!');
          navigate('/dashboard');
        },
        onError: (err: any) => {
          const apiErr = err?.response?.data?.error;
          setErrorMsg(apiErr?.message || 'Registration failed. Username or Email already in use.');
        }
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden font-sans select-none text-slate-800">
      
      {/* Background soft gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-100/50 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-100/50 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in space-y-6">
        
        {/* Branding Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 shadow-md text-white font-bold text-lg mb-1 select-none">
            ▲
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create an Account
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Join Antigravity to collaborate on sprints, boards, and tasks
          </p>
        </div>

        {/* Clean Light-Mode Register Card */}
        <Card className="shadow-lg border border-slate-200 bg-white">
          <CardBody className="p-8">
            
            {/* Error Banner */}
            {errorMsg && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              {/* Email Field */}
              <Input
                label="Email Address"
                type="email"
                placeholder="e.g. alice@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
                required
              />

              {/* Username Field */}
              <Input
                label="Username"
                placeholder="e.g. alice"
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
                isLoading={registerMutation.isPending}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Create Account
              </Button>
            </form>

            {/* Login Link */}
            <div className="mt-5 text-center text-xs text-slate-500 font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 font-bold hover:underline">
                Sign In
              </Link>
            </div>

          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Register;
