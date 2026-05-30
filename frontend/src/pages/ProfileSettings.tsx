import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Settings, User, Mail, Shield, Save, Upload, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';

export const ProfileSettings: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const updateUserStore = useAuthStore((state) => state.updateUser);
  const toast = useToast();

  const [username, setUsername] = useState(user?.username || '');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Local avatar state synced with localStorage
  const [avatar, setAvatar] = useState<string | null>(() => {
    return user ? localStorage.getItem(`avatar_${user.id}`) : null;
  });

  // Fetch workspaces list for membership display
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces),
    enabled: !!user
  });

  // Update profile mutation
  const profileMutation = useMutation({
    mutationFn: (newUsername: string) =>
      api.patch('/auth/me', { username: newUsername }),
    onSuccess: (res) => {
      const updatedUser = res.data.data.user;
      updateUserStore({ username: updatedUser.username });
      toast.success('Username updated successfully');
    },
    onError: (err: any) => {
      const apiErr = err?.response?.data?.error;
      setErrorMsg(apiErr?.message || 'Failed to update username');
      toast.error('Profile update failed');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim()) {
      setErrorMsg('Username cannot be empty.');
      return;
    }

    if (username === user?.username) {
      toast.info('No changes detected.');
      return;
    }

    profileMutation.mutate(username);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (limit to 1MB for localStorage safety)
    if (file.size > 1024 * 1024) {
      toast.error('Avatar file size must be less than 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatar(base64String);
      if (user) {
        localStorage.setItem(`avatar_${user.id}`, base64String);
        // Force refresh profile UI
        updateUserStore({ ...user });
        toast.success('Avatar uploaded successfully!');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    setAvatar(null);
    if (user) {
      localStorage.removeItem(`avatar_${user.id}`);
      updateUserStore({ ...user });
      toast.success('Avatar removed.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in text-left max-w-2xl mx-auto pb-12">
        
        <div className="border-b border-slate-200 pb-4 select-none">
          <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-1 flex items-center gap-2">
            <Settings className="text-blue-650 w-5 h-5" />
            Profile Settings
          </h2>
          <p className="text-slate-500 text-xs">
            Manage your personal profile details, upload a custom avatar, and review memberships.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="shadow-sm">
            <CardBody className="p-6 space-y-6">
              
              {/* Avatar Section */}
              <div className="space-y-3">
                <label className="block text-slate-700 text-xs font-semibold uppercase tracking-wide select-none">Profile Photo</label>
                <div className="flex items-center space-x-4">
                  <Avatar
                    username={user?.username}
                    imageUrl={avatar || undefined}
                    size="lg"
                    className="border border-slate-200 shadow-sm"
                  />
                  
                  <div className="flex flex-col space-y-2 select-none">
                    <div className="flex items-center space-x-2">
                      <label className="px-3.5 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer transition flex items-center gap-1.5 shadow-sm">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </label>
                      
                      {avatar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleAvatarRemove}
                          className="p-2 rounded-md text-slate-400 hover:text-red-650 hover:bg-red-50"
                          title="Remove photo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">JPG, PNG or GIF. Max size 1MB. Saved locally.</span>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-805 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Field: Username */}
                <Input
                  label="Username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Update username"
                  leftIcon={<User className="w-4 h-4 text-slate-450" />}
                  required
                />

                {/* Readonly: Email */}
                <Input
                  label="Email Address"
                  type="text"
                  value={user?.email || ''}
                  leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
                  readOnly
                  containerClassName="opacity-80"
                  className="bg-slate-50 text-slate-500 cursor-not-allowed select-none border-slate-200"
                />

                {/* Readonly: UUID */}
                <Input
                  label="Unique Identifier (UUID)"
                  type="text"
                  value={user?.id || ''}
                  leftIcon={<Shield className="w-4 h-4 text-slate-400" />}
                  readOnly
                  containerClassName="opacity-80"
                  className="bg-slate-50 text-slate-500 font-mono cursor-not-allowed select-none border-slate-200"
                />

                {/* Workspace memberships list */}
                <div className="space-y-3 pt-5 border-t border-slate-250 text-left">
                  <label className="block text-slate-700 text-xs font-semibold uppercase tracking-wide select-none">Workspace Memberships</label>
                  <div className="space-y-3">
                    {workspaces.map((ws) => (
                      <div key={ws.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs shadow-sm">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-800">{ws.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">Slug: {ws.slug}</p>
                        </div>
                        <Badge variant="info">
                          {ws.role}
                        </Badge>
                      </div>
                    ))}
                    {workspaces.length === 0 && (
                      <p className="text-xs text-slate-450 italic select-none">No workspace memberships logged.</p>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2 select-none">
                  <Button
                    type="submit"
                    variant="primary"
                    className="font-semibold shadow-md"
                    isLoading={profileMutation.isPending}
                    leftIcon={<Save className="w-4 h-4" />}
                  >
                    Save Profile Changes
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfileSettings;
