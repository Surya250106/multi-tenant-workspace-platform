import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useLogoutMutation } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { useToast } from './Toast';
import {
  LayoutDashboard, BarChart3, Bell, Settings,
  LogOut, ChevronsUpDown, ChevronLeft, ChevronRight, Search,
  Plus, Trash2, ChevronDown, Users, ClipboardList, Layers
} from 'lucide-react';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';

interface LayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<LayoutProps> = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { isConnected } = useWebSocket();

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  // Dropdown states
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Refs for closing dropdowns on click outside
  const workspaceRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Close dropdowns on outside click and ESC key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setWorkspaceDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setWorkspaceDropdownOpen(false);
        setNotificationsOpen(false);
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        navigate('/login', { replace: true });
      }
    });
  };

  // Fetch workspaces dynamically
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces),
    enabled: !!user
  });

  // Resolve active workspace details
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
  const activeWorkspaceId = activeWorkspace?.id || 'default';
  const userRole = activeWorkspace?.role || 'member';

  // Fetch notifications dynamically
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data.data.notifications),
    refetchInterval: 10000,
    enabled: !!user
  });

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadNotifications.length;

  // Notification mutations
  const readAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    }
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notification removed');
    }
  });

  // Create workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: (name: string) => api.post('/workspaces', { name }),
    onSuccess: (res) => {
      const newWs = res.data.data;
      toast.success('Workspace created successfully!');
      setNewWorkspaceName('');
      setCreateWorkspaceOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate(`/workspaces/${newWs.id}`);
    },
    onError: () => {
      toast.error('Failed to create workspace');
    }
  });

  const handleCreateWorkspaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    createWorkspaceMutation.mutate(newWorkspaceName.trim());
  };

  // Dynamic Nav directory configuration based on active workspace role
  const navItems = React.useMemo(() => {
    const base = [
      { label: 'Dashboard', path: `/workspaces/${activeWorkspaceId}`, icon: LayoutDashboard },
      { label: 'Boards', path: `/workspaces/${activeWorkspaceId}?tab=boards`, icon: Layers }
    ];

    if (userRole === 'admin') {
      base.push(
        { label: 'Analytics', path: `/workspaces/${activeWorkspaceId}/analytics`, icon: BarChart3 },
        { label: 'Notifications', path: '/notifications', icon: Bell },
        { label: 'Members', path: `/workspaces/${activeWorkspaceId}?tab=members`, icon: Users },
        { label: 'Settings', path: `/workspaces/${activeWorkspaceId}?tab=settings`, icon: Settings },
        { label: 'Activity Logs', path: `/workspaces/${activeWorkspaceId}?tab=activity-logs`, icon: ClipboardList }
      );
    } else if (userRole === 'manager') {
      base.push(
        { label: 'Analytics', path: `/workspaces/${activeWorkspaceId}/analytics`, icon: BarChart3 },
        { label: 'Notifications', path: '/notifications', icon: Bell },
        { label: 'Members', path: `/workspaces/${activeWorkspaceId}?tab=members`, icon: Users }
      );
    } else if (userRole === 'member') {
      base.push(
        { label: 'My Tasks', path: `/workspaces/${activeWorkspaceId}?tab=my-tasks`, icon: ClipboardList },
        { label: 'Notifications', path: '/notifications', icon: Bell },
        { label: 'Profile', path: '/settings/profile', icon: Settings }
      );
    }

    return base;
  }, [activeWorkspaceId, userRole]);

  const getIsActive = (path: string) => {
    try {
      const pathUrl = new URL(path, window.location.origin);
      const currentUrl = new URL(location.pathname + location.search, window.location.origin);
      
      if (pathUrl.pathname !== currentUrl.pathname) {
        return false;
      }
      
      const pathTab = pathUrl.searchParams.get('tab');
      const currentTab = currentUrl.searchParams.get('tab');
      return pathTab === currentTab;
    } catch {
      return location.pathname === path || location.pathname.startsWith(path);
    }
  };

  // Retrieve user avatar from localStorage if uploaded
  const userAvatar = user ? localStorage.getItem(`avatar_${user.id}`) : null;

  const handleSearchFocus = () => {
    const boardSearchInput = document.querySelector('input[placeholder*="Search tasks"]') as HTMLInputElement;
    if (boardSearchInput) {
      boardSearchInput.focus();
      toast.info('Search box focused. Start typing!');
    } else {
      toast.info('Navigate to a Kanban board to search tasks.');
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans select-none">

      {/* 1. COLLAPSIBLE SIDEBAR */}
      <aside
        className={`border-r border-slate-200 bg-white flex flex-col justify-between p-4 relative z-30 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
      >
        {/* Sidebar Toggle Handle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-6 bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md p-1.5 z-50 transition-colors shadow-sm"
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        <div className="space-y-6">
          {/* Logo Brand Header */}
          <div className="flex items-center space-x-2.5 px-2 py-1 select-none">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-sm flex-shrink-0">
              ▲
            </div>
            {!sidebarCollapsed && (
              <span className="text-xs font-bold tracking-tight text-slate-800 uppercase truncate">
                Multi SaaS
              </span>
            )}
          </div>

          {/* Dynamic Workspace Switcher Dropdown */}
          <div className="relative" ref={workspaceRef}>
            <button
              onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-350 transition duration-150"
            >
              <div className="flex items-center space-x-2 text-left min-w-0">
                <div className="w-5.5 h-5.5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {activeWorkspace?.name?.substring(0, 1).toUpperCase() || 'W'}
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-800 leading-tight truncate">{activeWorkspace?.name || 'Workspace Space'}</h4>
                    <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wider truncate block">
                      Role: {userRole}
                    </span>
                  </div>
                )}
              </div>
              {!sidebarCollapsed && <ChevronsUpDown className="w-3 h-3 text-slate-400 flex-shrink-0" />}
            </button>

            {workspaceDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 p-1 bg-white border border-slate-200 rounded-lg shadow-lg z-40 animate-fade-in w-56">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider p-2 border-b border-slate-100 mb-1">
                  Switch Workspace
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setWorkspaceDropdownOpen(false);
                        navigate(`/workspaces/${ws.id}`);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium flex items-center justify-between transition ${ws.id === activeWorkspaceId
                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                        : 'text-slate-650 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                      <span className="truncate">{ws.name}</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 flex-shrink-0">
                        {ws.role}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Create workspace entry */}
                {(!activeWorkspace || userRole === 'admin') && (
                  <button
                    onClick={() => {
                      setWorkspaceDropdownOpen(false);
                      setCreateWorkspaceOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 mt-1 border-t border-slate-100 rounded-b-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    Create Workspace
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Navigation Directory list */}
          <nav className="space-y-1 text-left">
            {navItems.map((item) => {
              const isActive = getIsActive(item.path);
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center rounded-lg text-xs font-medium tracking-wide transition duration-150 border ${sidebarCollapsed ? 'justify-center p-2.5' : 'space-x-3 px-3 py-2'
                    } ${isActive
                      ? 'bg-slate-100 border-slate-150 text-slate-900 shadow-sm font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-transparent'
                    }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-slate-800' : 'text-slate-400'}`} />
                  {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!sidebarCollapsed && item.label === 'Notifications' && unreadCount > 0 && (
                    <span className="bg-red-50 text-red-650 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 border border-red-100">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile footer details */}
        <div className="border-t border-slate-100 pt-4 relative" ref={userRef}>
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="w-full flex items-center justify-between p-1 rounded-lg hover:bg-slate-50 transition duration-150 text-left focus:outline-none"
            title="User actions"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative flex-shrink-0">
                <Avatar
                  username={user?.username}
                  imageUrl={userAvatar || undefined}
                  isOnline={true}
                  size="sm"
                />
              </div>

              {!sidebarCollapsed && (
                <div className="text-left min-w-0">
                  <p className="text-xs font-bold text-slate-850 truncate leading-tight">{user?.username}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant={userRole === 'admin' ? 'danger' : userRole === 'manager' ? 'info' : 'neutral'}>
                      {userRole}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            )}
          </button>

          {/* Bottom-left Dropdown */}
          {userDropdownOpen && (
            <div className={`absolute bottom-full left-0 mb-2 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-fade-in p-1 ${sidebarCollapsed ? 'left-4' : ''
              }`}>
              <div className="p-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-bold text-slate-800 truncate">{user?.username}</p>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{user?.email}</p>
              </div>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  navigate('/settings/profile');
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-650 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 transition"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Profile & Settings
              </button>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  navigate('/notifications');
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-650 hover:text-slate-900 hover:bg-slate-50 flex items-center gap-2 transition"
              >
                <Bell className="w-3.5 h-3.5 text-slate-400" />
                Notifications
              </button>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  handleLogout();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-bold text-red-650 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100 mt-1 pt-2 transition"
              >
                <LogOut className="w-3.5 h-3.5 text-red-550" />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN VIEWPORT */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-20">

        {/* Top Header Navbar */}
        <header className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-white relative z-20 shadow-sm">

          {/* Breadcrumbs workspace layout */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-[10px] font-bold text-slate-450 tracking-wider uppercase truncate">
              {activeWorkspace?.name || 'COLLABORATIVE WORKSPACE'}
            </span>
            <span className="text-slate-300 text-[10px]">/</span>
            <span className="text-[10px] font-bold text-slate-800 tracking-wider uppercase truncate">
              {location.pathname.includes('analytics')
                ? 'Analytics'
                : location.pathname.includes('notifications')
                  ? 'Notifications'
                  : location.pathname.includes('settings')
                    ? 'Profile Settings'
                    : (() => {
                        const tab = new URLSearchParams(location.search).get('tab');
                        if (tab === 'boards') return 'Boards';
                        if (tab === 'members') return 'Members';
                        if (tab === 'settings') return 'Settings';
                        if (tab === 'activity-logs') return 'Activity Logs';
                        if (tab === 'my-tasks') return 'My Tasks';
                        return 'Dashboard';
                      })()}
            </span>
          </div>

          <div className="flex items-center space-x-4">

            {/* Search command bar button */}
            <button
              onClick={handleSearchFocus}
              className="hidden sm:flex items-center space-x-2.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 text-slate-500 transition"
              title="Focus search input"
            >
              <Search className="w-3.5 h-3.5 text-slate-450" />
              <span className="text-xs font-medium">Search Board</span>
              <kbd className="text-[9px] bg-white border border-slate-200 text-slate-450 px-1 py-0.5 rounded shadow-sm">⌘K</kbd>
            </button>

            {/* WebSocket connection status indicator */}
            <div className="flex items-center">
              {isConnected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Live Sync
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 border border-amber-200 text-amber-700 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Sync Off
                </span>
              )}
            </div>

            {/* Interactive Notifications Bell Dropdown */}
            <div className="relative" ref={notificationsRef}>
              <button
                data-testid="notification-bell"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100/60 border border-slate-200 text-slate-500 hover:text-slate-800 transition relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span
                    data-testid="notification-badge"
                    className="absolute -top-0.5 -right-0.5 bg-red-500 text-[9px] font-bold text-white w-4 h-4 rounded-full flex items-center justify-center border border-white shadow-sm"
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-fade-in p-1">
                  <div className="flex items-center justify-between p-2 border-b border-slate-150 mb-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Workspace Inbox</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => readAllMutation.mutate()}
                        className="text-[10px] text-blue-600 hover:underline font-semibold"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-slate-450 text-xs italic select-none">
                        No alerts logged.
                      </div>
                    ) : (
                      notifications.slice(0, 5).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.is_read) {
                              api.patch('/notifications/read').then(() => {
                                queryClient.invalidateQueries({ queryKey: ['notifications'] });
                              });
                            }
                          }}
                          className={`p-2.5 rounded-lg border text-left text-xs transition relative group cursor-pointer ${n.is_read
                            ? 'border-transparent bg-slate-50 hover:bg-slate-100/50'
                            : 'border-blue-100 bg-blue-50/20 hover:bg-blue-50/40'
                            }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <h5 className="font-semibold text-slate-800 truncate">{n.title}</h5>
                              <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">{n.message}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotificationMutation.mutate(n.id);
                              }}
                              className="text-slate-450 hover:text-red-650 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate('/notifications');
                    }}
                    className="w-full text-center py-2 mt-1 border-t border-slate-100 rounded-b-md text-[10px] font-bold text-slate-500 hover:text-slate-800 transition bg-slate-50 hover:bg-slate-100/60"
                  >
                    View All Notifications
                  </button>
                </div>
              )}
            </div>

            {/* Profile Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => navigate('/settings/profile')}
                className="flex items-center space-x-1.5 focus:outline-none"
              >
                <Avatar
                  username={user?.username}
                  imageUrl={userAvatar || undefined}
                  size="sm"
                />
              </button>
            </div>

          </div>
        </header>

        {/* Content view container */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Quick Modal - Create Workspace */}
      <Modal
        isOpen={createWorkspaceOpen}
        onClose={() => {
          setCreateWorkspaceOpen(false);
          setNewWorkspaceName('');
        }}
        title="Create New Workspace"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateWorkspaceOpen(false);
                setNewWorkspaceName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              onClick={handleCreateWorkspaceSubmit}
              disabled={createWorkspaceMutation.isPending}
            >
              {createWorkspaceMutation.isPending ? 'Creating...' : 'Create Space'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateWorkspaceSubmit} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="text-xs font-semibold text-slate-700 tracking-wide">Workspace Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Acme Corporation"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-md px-3 py-2 text-xs text-slate-900 outline-none transition"
            />
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default DashboardLayout;
