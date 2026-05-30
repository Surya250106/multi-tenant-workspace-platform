import React, { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { 
  Sparkles, Settings, ArrowRight, Kanban, 
  UserPlus, Trash2, ClipboardList, Clock, Briefcase, 
  Users, Trash, AlertTriangle, Plus
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';

export const Dashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const { workspaceId: urlWorkspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [memberToEvict, setMemberToEvict] = useState<any | null>(null);

  // 1. Fetch workspaces list early to resolve roles
  const { data: workspaces = [], isLoading: isWorkspacesLoading } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces)
  });

  // Resolve active workspace details
  const activeWorkspace = workspaces.find((w) => w.id === urlWorkspaceId) || workspaces[0];
  const workspaceId = activeWorkspace?.id || 'default';
  const userRole = activeWorkspace?.role || 'member';

  // Prevent illegal route/tab access based on roles
  React.useEffect(() => {
    if (userRole === 'member' && ['members', 'settings', 'activity-logs'].includes(tab || '')) {
      navigate('/403', { replace: true });
    }
    if (userRole === 'manager' && ['settings', 'activity-logs'].includes(tab || '')) {
      navigate('/403', { replace: true });
    }
  }, [userRole, tab, navigate]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMemberToEvict(null);
      }
    };
    if (memberToEvict) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [memberToEvict]);

  // 2. Fetch projects and boards dynamically
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery<any[]>({
    queryKey: ['projects', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/projects`).then((r) => r.data.data.projects),
    enabled: !!workspaceId && workspaceId !== 'default'
  });

  // 3. Fetch active workspace members
  const { data: members = [], isLoading: isMembersLoading } = useQuery<any[]>({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`).then((r) => r.data.data.members),
    enabled: !!workspaceId && workspaceId !== 'default'
  });

  // 4. Fetch all tasks in parallel across all projects and boards
  const boardIds = useMemo(() => {
    return projects.flatMap((p) => p.boards?.map((b: any) => b.id) || []);
  }, [projects]);

  const taskQueries = useQueries({
    queries: boardIds.map((bId) => ({
      queryKey: ['board-tasks-summary', bId],
      queryFn: () => api.get(`/boards/${bId}/tasks`, { params: { limit: 100 } }).then((r) => r.data.data.tasks || []),
      enabled: !!bId
    }))
  });

  const allTasks = useMemo(() => {
    return taskQueries.flatMap((q) => (q.data as any[]) || []);
  }, [taskQueries]);

  // ==========================================
  // MUTATIONS
  // ==========================================

  // Invite member
  const inviteMemberMutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) =>
      api.post(`/workspaces/${workspaceId}/members`, payload),
    onSuccess: () => {
      toast.success('Team member invited successfully!');
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (err: any) => {
      const errMsg = err?.response?.data?.error?.message || 'Failed to invite member';
      toast.error(errMsg);
    }
  });

  // Update member role
  const updateMemberRoleMutation = useMutation({
    mutationFn: (payload: { memberId: string; role: string }) =>
      api.patch(`/workspaces/${workspaceId}/members/${payload.memberId}`, { role: payload.role }),
    onSuccess: () => {
      toast.success('Member role updated!');
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: () => {
      toast.error('Failed to update role');
    }
  });

  // Evict member
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/workspaces/${workspaceId}/members/${memberId}`),
    onSuccess: () => {
      toast.success('Member removed from workspace');
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setMemberToEvict(null);
    },
    onError: (err: any) => {
      const errMsg = err?.response?.data?.error?.message || 'Failed to remove member';
      toast.error(errMsg);
    }
  });

  // Create Project
  const createProjectMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) =>
      api.post(`/workspaces/${workspaceId}/projects`, payload),
    onSuccess: () => {
      toast.success('Project created successfully with default boards!');
      setNewProjectName('');
      setNewProjectDesc('');
      setShowCreateProject(false);
      queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
    },
    onError: () => {
      toast.error('Failed to create project');
    }
  });

  // Delete Workspace
  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}`),
    onSuccess: () => {
      toast.success('Workspace deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/dashboard');
    },
    onError: () => {
      toast.error('Failed to delete workspace');
    }
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMemberMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    createProjectMutation.mutate({ name: newProjectName.trim(), description: newProjectDesc.trim() });
  };

  const handleDeleteWorkspace = () => {
    if (confirm('CAUTION: Are you absolutely sure you want to delete this entire workspace? This action is irreversible.')) {
      deleteWorkspaceMutation.mutate();
    }
  };

  // Filter tasks assigned to active user
  const myTasks = useMemo(() => {
    return allTasks.filter((t: any) => t.assignee_id === user?.id);
  }, [allTasks, user]);

  const overdueTasks = useMemo(() => {
    const now = new Date();
    return allTasks.filter((t: any) => t.status !== 'done' && t.due_date && new Date(t.due_date) < now);
  }, [allTasks]);

  const completionRate = useMemo(() => {
    if (allTasks.length === 0) return 0;
    const completed = allTasks.filter((t: any) => t.status === 'done').length;
    return Math.round((completed / allTasks.length) * 100);
  }, [allTasks]);

  if (isWorkspacesLoading || isProjectsLoading || isMembersLoading) {
    return (
      <DashboardLayout>
        <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Clock className="w-10 h-10 animate-spin-custom text-blue-600" />
          <span className="font-semibold tracking-wide text-xs uppercase select-none">Initializing Workspace Coordination Engine...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (!activeWorkspace) {
    return (
      <DashboardLayout>
        <Card className="max-w-md mx-auto text-center mt-12">
          <CardBody className="p-8 space-y-4">
            <h3 className="text-base font-bold text-slate-800">No Workspace Hub Found</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              You do not belong to any workspace cluster. Create a workspace from the switcher on the sidebar to get started.
            </p>
          </CardBody>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in text-left pb-12">
        
        {/* Welcome Greeting Banner */}
        <Card className="relative overflow-hidden shadow-sm border border-slate-200">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/[0.015] blur-[80px] rounded-full pointer-events-none"></div>
          <CardBody className="p-6 relative z-10 flex flex-col justify-between h-full gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold uppercase tracking-wider select-none">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  WORKSPACE ROLE: {userRole.toUpperCase()}
                </div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                  Welcome back, {user?.username} 👋
                </h2>
                <p className="text-slate-500 text-xs max-w-xl leading-relaxed">
                  Coordination dashboard for workspace <span className="text-blue-600 font-semibold">{activeWorkspace.name}</span>. Track sprints, manage board tasks, and view live updates.
                </p>
              </div>
              
              {/* Quick action button for managers/admins */}
              {(userRole === 'admin' || userRole === 'manager') && (
                <Button
                  onClick={() => setShowCreateProject(!showCreateProject)}
                  variant="primary"
                  size="sm"
                  className="shadow-sm font-semibold flex items-center gap-1.5"
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  New Project
                </Button>
              )}
            </div>

            {/* Personalized Metrics Bar */}
            <div className="flex flex-wrap items-center gap-6 mt-2 pt-4 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium select-none">Active Tasks</span>
                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {myTasks.filter((t: any) => t.status !== 'done').length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium select-none">Overdue Tasks</span>
                <span className={`font-bold px-2 py-0.5 rounded-md border ${
                  myTasks.filter((t: any) => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length > 0
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {myTasks.filter((t: any) => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium select-none">Assigned Projects</span>
                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {new Set(myTasks.map((t) => projects.flatMap((p) => p.boards || []).find((b: any) => b.id === t.board_id)?.project_id).filter(Boolean)).size || projects.length}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Modal: Create Project */}
        {showCreateProject && (
          <Card className="max-w-md border-blue-100 bg-blue-50/[0.05]">
            <CardBody className="p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Create New Project</h4>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <Input
                  placeholder="Project Name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                />
                
                <div className="flex flex-col gap-1.5 w-full">
                  <textarea
                    placeholder="Description (Optional)"
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    rows={2}
                    className="w-full text-xs bg-white text-slate-900 border border-slate-200 focus:border-blue-500 rounded-md py-2 px-3 transition-colors resize-none"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateProject(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={createProjectMutation.isPending}
                  >
                    Create Project
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}        {/* ==========================================
            ROLE SPECIFIC VIEWS
            ========================================== */}

        {/* Render Tab Contents */}
        {tab === 'members' && (userRole === 'admin' || userRole === 'manager') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Members List Table */}
            <div className="lg:col-span-8 space-y-6">
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-4.5 h-4.5 text-slate-500" />
                    Workspace Team Members
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead className="text-center">Workspace Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="flex items-center gap-3">
                            <Avatar username={m.user?.username} size="xs" />
                            <div>
                              <span className="font-semibold text-slate-800">{m.user?.username}</span>
                              {m.user_id === user?.id && <span className="text-[10px] text-slate-400 ml-1.5 font-medium">(You)</span>}
                            </div>
                          </TableCell>
                          
                          <TableCell className="text-center">
                            {m.user_id === user?.id ? (
                              <Badge variant="neutral">
                                {m.role}
                              </Badge>
                            ) : (
                              <select
                                value={m.role}
                                disabled={userRole === 'manager' && m.role === 'admin'}
                                onChange={(e) => updateMemberRoleMutation.mutate({ memberId: m.id, role: e.target.value })}
                                className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-700 outline-none transition hover:border-slate-350"
                              >
                                {userRole !== 'manager' && <option value="admin">Admin</option>}
                                <option value="manager">Manager</option>
                                <option value="member">Member</option>
                              </select>
                            )}
                          </TableCell>
                          
                          <TableCell className="text-right">
                            {m.user_id !== user?.id && (userRole === 'admin' || (userRole === 'manager' && m.role === 'member')) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMemberToEvict(m)}
                                className="text-slate-400 hover:text-red-650 p-1.5 hover:bg-red-50"
                                title="Evict Member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardBody>
              </Card>
            </div>

            {/* Invite Form Card */}
            <div className="lg:col-span-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 select-none">
                    <UserPlus className="w-4 h-4 text-slate-500" />
                    Invite Member
                  </CardTitle>
                </CardHeader>
                <CardBody className="space-y-4">
                  <form onSubmit={handleInvite} className="space-y-4">
                    <Input
                      type="email"
                      placeholder="Collaborator Email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                    
                    <Select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      options={
                        userRole === 'manager'
                          ? [
                              { value: 'member', label: 'Member' },
                              { value: 'manager', label: 'Manager' }
                            ]
                          : [
                              { value: 'member', label: 'Member' },
                              { value: 'manager', label: 'Manager' },
                              { value: 'admin', label: 'Admin' }
                            ]
                      }
                    />

                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full font-semibold"
                      isLoading={inviteMemberMutation.isPending}
                    >
                      Invite Collaborator
                    </Button>
                  </form>
                </CardBody>
              </Card>
            </div>
          </div>
        )}

        {tab === 'settings' && userRole === 'admin' && (
          <div className="max-w-md">
            <Card className="border-red-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-red-700 select-none">
                  <Settings className="w-4 h-4" />
                  Workspace Danger Zone
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Deletes the active workspace coordination cluster, removing all project timelines, tasks, cards, and member associations permanently.
                </p>
                <Button
                  onClick={handleDeleteWorkspace}
                  variant="danger"
                  className="w-full flex items-center justify-center gap-1.5 font-semibold"
                  leftIcon={<Trash className="w-3.5 h-3.5" />}
                >
                  Delete Workspace
                </Button>
              </CardBody>
            </Card>
          </div>
        )}

        {tab === 'activity-logs' && userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-4.5 h-4.5 text-slate-500" />
                Workspace Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-xs text-slate-500 select-none">Showing recent chronological audit logs and action traces across the workspace:</p>
              <div className="space-y-3.5 pl-2 border-l border-slate-100">
                <div className="relative">
                  <span className="absolute -left-3.5 top-1.5 w-2 h-2 rounded-full bg-blue-500"></span>
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800">Workspace Hub initialized</span>
                    <span className="text-[10px] text-slate-400 ml-2">Just now</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Coordination cluster database successfully seeded with default project parameters.</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-3.5 top-1.5 w-2 h-2 rounded-full bg-emerald-500"></span>
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800">Prisma database context synced</span>
                    <span className="text-[10px] text-slate-400 ml-2">10 minutes ago</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Prisma ORM connected cleanly to Postgres storage engine.</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Dynamic dashboards depending on role and tabs */}
        {(!tab || tab === 'boards' || tab === 'my-tasks') && (
          <div className="space-y-8">
            
            {/* If no tab, show the role specific KPI cards and workflows */}
            {!tab && (
              <>
                {userRole === 'admin' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <Card>
                      <CardBody className="p-4 space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Tasks Completion</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{completionRate}%</p>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${completionRate}%` }}></div>
                        </div>
                      </CardBody>
                    </Card>
                    
                    <Card>
                      <CardBody className="p-4 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Total Task Cards</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{allTasks.length}</p>
                        <span className="text-[10px] text-slate-400 select-none">Across all boards</span>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardBody className="p-4 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Workspace Members</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{members.length}</p>
                        <span className="text-[10px] text-slate-400 select-none">Active registered</span>
                      </CardBody>
                    </Card>

                    <Card className="border-red-100">
                      <CardBody className="p-4 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-red-500 select-none">Overdue Tasks</span>
                        <p className="text-2xl font-bold text-red-650 leading-none">{overdueTasks.length}</p>
                        <span className="text-[10px] text-red-500/80 flex items-center gap-1 select-none font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Action required
                        </span>
                      </CardBody>
                    </Card>
                  </div>
                )}

                {userRole === 'manager' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardBody className="p-4 space-y-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Sprint Progress</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{completionRate}%</p>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${completionRate}%` }}></div>
                        </div>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardBody className="p-4 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Active Board Tasks</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{allTasks.length}</p>
                        <span className="text-[10px] text-slate-400 select-none">Across workspace boards</span>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardBody className="p-4 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Total Projects</span>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{projects.length}</p>
                        <span className="text-[10px] text-slate-400 select-none">Active sprints</span>
                      </CardBody>
                    </Card>
                  </div>
                )}
              </>
            )}

            {/* Show My Tasks table for Members or if specifically requested by other roles under ?tab=my-tasks */}
            {((!tab && userRole === 'member') || tab === 'my-tasks') && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="w-4.5 h-4.5 text-slate-500" />
                        My Active Allocated Tasks
                      </CardTitle>
                      <Badge variant="info">
                        {myTasks.length} Allocated
                      </Badge>
                    </CardHeader>
                    <CardBody className="p-0">
                      {myTasks.length === 0 ? (
                        <p className="text-xs text-slate-550 italic p-6 text-center select-none">No tasks currently assigned to you. Enjoy the workspace!</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Task</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-center">Priority</TableHead>
                              <TableHead className="text-right">Due Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {myTasks.map((t: any) => (
                              <TableRow key={t.id}>
                                <TableCell className="font-semibold text-slate-800">{t.title}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="neutral">
                                    {t.status.replace('_', ' ')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'success'}>
                                    {t.priority}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-slate-400 font-medium">
                                  {t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No Deadline'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardBody>
                  </Card>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 select-none">
                        <Clock className="w-4.5 h-4.5 text-slate-500" />
                        Upcoming Deadlines
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      {myTasks.filter((t) => t.due_date && t.status !== 'done').slice(0, 3).map((t) => (
                        <div key={t.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs shadow-sm">
                          <span className="font-semibold text-slate-700 truncate max-w-[120px]">{t.title}</span>
                          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-250 px-2 py-0.5 rounded-full font-bold">
                            {new Date(t.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                      {myTasks.filter((t) => t.due_date && t.status !== 'done').length === 0 && (
                        <p className="text-xs text-slate-500 italic text-center py-2 select-none">No approaching deadlines.</p>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}

            {/* Render Team workloads for managers when on Default view */}
            {!tab && userRole === 'manager' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-12 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Briefcase className="w-4.5 h-4.5 text-slate-500" />
                        Team Workload Allocation
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="space-y-5">
                      {members.map((m) => {
                        const memberTasks = allTasks.filter((t) => t.assignee_id === m.user_id);
                        const totalCount = memberTasks.length;
                        const completedCount = memberTasks.filter((t) => t.status === 'done').length;
                        const memberPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                        return (
                          <div key={m.id} className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-800">{m.user?.username} ({m.role})</span>
                              <span className="text-slate-450">{totalCount} tasks assigned ({memberPercent}% complete)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                              <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(8, memberPercent)}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}

            {/* Show global interactive boards list when requested (?tab=boards) or as part of Dashboard for Admins/Managers */}
            {((!tab && userRole !== 'member') || tab === 'boards') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-250">
                {projects.map((proj) => (
                  <Card 
                    key={proj.id} 
                    className="hover-lift border border-slate-200 hover:border-blue-200 transition duration-200 text-left flex flex-col justify-between"
                  >
                    <CardBody className="p-5 flex flex-col justify-between h-full gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 select-none">Workspace Project</span>
                        <h4 className="text-sm font-extrabold text-slate-800 leading-none">
                          {proj.name}
                        </h4>
                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                          {proj.description || 'No project description logged.'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span className="block text-[10px] uppercase font-bold text-slate-400 select-none">Kanban Board Columns</span>
                        
                        {proj.boards?.map((board: any) => (
                          <button
                            key={board.id}
                            onClick={() => navigate(`/workspaces/${workspaceId}/projects/${proj.id}/boards/${board.id}?column=${board.name.toLowerCase().replace(/[\s_]+/g, '-')}`)}
                            className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-350 hover:bg-slate-100/50 text-xs font-bold text-slate-700 hover:text-slate-900 transition duration-150 shadow-sm"
                          >
                            <span className="flex items-center gap-2">
                              <Kanban className="w-4 h-4 text-blue-600" />
                              {board.name}
                            </span>
                            <span className="text-[11px] text-blue-600 font-bold flex items-center gap-0.5">
                              Open Board <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Modal: Remove Member Confirmation */}
      <Modal
        isOpen={!!memberToEvict}
        onClose={() => setMemberToEvict(null)}
        title="Remove Team Member"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMemberToEvict(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => removeMemberMutation.mutate(memberToEvict.id)}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-50 rounded-full text-red-600 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800">Are you absolutely sure?</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              This will remove <span className="text-slate-800 font-semibold">{memberToEvict?.user?.username}</span> from the workspace. They will lose access to all projects, boards, and tasks in this workspace hub.
            </p>
          </div>
        </div>
      </Modal>

    </DashboardLayout>
  );
};

export default Dashboard;
