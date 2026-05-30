import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  Briefcase,
  Layers,
  Users
} from 'lucide-react';
import api from '../services/api';
import { DashboardLayout } from '../components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';

import { useAuthStore } from '../store/authStore';

export const Analytics: React.FC = () => {
  const { workspaceId = 'default' } = useParams<{ workspaceId: string }>();
  const currentUser = useAuthStore((state) => state.user);

  // Fetch workspaces list to resolve roles
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces)
  });

  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
  const userRole = activeWorkspace?.role || 'member';

  // 1. Query workspace summary analytics
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['workspace-analytics-summary', workspaceId],
    queryFn: () =>
      api.get(`/workspaces/${workspaceId}/analytics/summary`).then((r) => r.data.data.summary),
    enabled: !!workspaceId && userRole !== 'member',
    // Fallback seed values for empty states
    initialData: {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      avgCompletionTimeHours: 0,
      overdueTasksCount: 0,
      completionTrends: []
    }
  });

  // 2. Query workspace members list to retrieve workload metrics
  const { data: membersList = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get(`/workspaces/${workspaceId}/members`).then((r) => r.data.data.members),
    initialData: []
  });

  // 3. Query analytics for each member in the list
  const myMemberRecord = membersList.find((m: any) => m.user_id === currentUser?.id);
  const myMemberId = myMemberRecord?.id;

  const memberAnalyticsQueries = useQueries({
    queries: (membersList || []).map((m: any) => ({
      queryKey: ['workspace-member-analytics', workspaceId, m.id],
      queryFn: () =>
        api.get(`/workspaces/${workspaceId}/analytics/member/${m.id}`).then((r) => r.data.data),
      enabled: !!m.id && (userRole !== 'member' || m.id === myMemberId)
    }))
  });

  const isSummaryQueryLoading = userRole !== 'member' && isSummaryLoading && summaryData.totalTasks === 0;

  if (isSummaryQueryLoading || isMembersLoading) {
    return (
      <DashboardLayout>
        <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Clock className="w-10 h-10 animate-spin-custom text-blue-600" />
          <span className="font-semibold tracking-wide text-xs uppercase select-none">Loading workspace analytics...</span>
        </div>
      </DashboardLayout>
    );
  }

  const summary = summaryData || {};
  const completionRate = summary.completionRate || 0;

  // Prepare status distribution for task allocation chart
  const statusData = [
    { name: 'Completed', value: summary.completedTasks || 0, color: '#10b981' },
    { name: 'Remaining', value: Math.max(0, (summary.totalTasks || 0) - (summary.completedTasks || 0)), color: '#3b82f6' }
  ];

  // Resolve member analytics mapped to members list
  const membersWithAnalytics = (membersList || []).map((m: any, idx: number) => {
    const qData = memberAnalyticsQueries[idx]?.data as any;
    return {
      ...m,
      totalAssigned: qData?.analytics?.totalAssigned ?? 0,
      completedAssigned: qData?.analytics?.completedAssigned ?? 0,
      memberCompletionRate: qData?.analytics?.completionRate ?? 0,
      avgCompletionTimeHours: qData?.analytics?.avgCompletionTimeHours ?? 0
    };
  });

  const myAnalytics = membersWithAnalytics.find((m: any) => m.user_id === currentUser?.id) || {
    totalAssigned: 0,
    completedAssigned: 0,
    memberCompletionRate: 0,
    avgCompletionTimeHours: 0
  };

  if (userRole === 'member') {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-fade-in text-left pb-12">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-1 flex items-center gap-2">
              <TrendingUp className="text-blue-600 w-5 h-5" />
              Personal Performance Telemetry
            </h2>
            <p className="text-slate-500 text-xs">
              Individual sprint telemetry mapping completion rates, task allocations, and resolution velocity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Card: Personal Completion Rate */}
            <Card className="flex justify-between items-center relative overflow-hidden group shadow-sm">
              <CardBody className="p-5 flex justify-between items-center w-full z-10">
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block select-none">
                    Completion Rate
                  </span>
                  <h3 className="text-3xl font-bold text-slate-800 leading-none">{myAnalytics.memberCompletionRate}%</h3>
                  <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {myAnalytics.completedAssigned} of {myAnalytics.totalAssigned} tasks complete
                  </p>
                </div>
                
                <div className="w-14 h-14 relative flex items-center justify-center z-10 select-none">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="28" cy="28" r="22" stroke="#f1f5f9" strokeWidth="5" fill="transparent" />
                    <circle
                      cx="28"
                      cy="28"
                      r="22"
                      stroke="#10b981"
                      strokeWidth="5"
                      fill="transparent"
                      strokeDasharray="138"
                      strokeDashoffset={138 - (138 * myAnalytics.memberCompletionRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold text-slate-700">{myAnalytics.memberCompletionRate}%</span>
                </div>
              </CardBody>
            </Card>

            {/* Card: Personal Velocity */}
            <Card className="relative overflow-hidden shadow-sm">
              <CardBody className="p-5 space-y-1.5 z-10 relative">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block select-none">
                  Average Velocity
                </span>
                <h3 className="text-3xl font-bold text-slate-800 leading-none">
                  {myAnalytics.avgCompletionTimeHours ? myAnalytics.avgCompletionTimeHours.toFixed(1) : 0}h
                </h3>
                <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Average time to mark your tasks as Done
                </p>
              </CardBody>
            </Card>

            {/* Card: Total Assigned */}
            <Card className="relative overflow-hidden shadow-sm">
              <CardBody className="p-5 space-y-1.5 z-10 relative">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block select-none">
                  Total Allocated Cards
                </span>
                <h3 className="text-3xl font-bold text-slate-850 leading-none">
                  {myAnalytics.totalAssigned}
                </h3>
                <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  Total tasks assigned to you
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in text-left pb-12">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-1 flex items-center gap-2">
            <TrendingUp className="text-blue-600 w-5 h-5" />
            Workspace Telemetry
          </h2>
          <p className="text-slate-500 text-xs">
            Real-time analytics aggregating task completion rates, creation velocity, and member performance.
          </p>
        </div>

        {/* 1. Core Analytics KPI Panels */}
        <div className={`grid grid-cols-1 ${userRole === 'manager' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-5`}>
          {/* Card: Completion Rate */}
          <Card className="flex justify-between items-center relative overflow-hidden group shadow-sm">
            <CardBody className="p-5 flex justify-between items-center w-full z-10">
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block select-none">
                  Completion Rate
                </span>
                <h3 className="text-3xl font-bold text-slate-800 leading-none">{completionRate}%</h3>
                <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {summary.completedTasks} of {summary.totalTasks} tasks complete
                </p>
              </div>
              
              {/* Premium circular completion progress graphic */}
              <div className="w-14 h-14 relative flex items-center justify-center z-10 select-none">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="22" stroke="#f1f5f9" strokeWidth="5" fill="transparent" />
                  <circle
                    cx="28"
                    cy="28"
                    r="22"
                    stroke="#10b981"
                    strokeWidth="5"
                    fill="transparent"
                    strokeDasharray="138"
                    strokeDashoffset={138 - (138 * completionRate) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[10px] font-bold text-slate-700">{completionRate}%</span>
              </div>
            </CardBody>
          </Card>

          {/* Card: Average Completion Time */}
          <Card className="relative overflow-hidden shadow-sm">
            <CardBody className="p-5 space-y-1.5 z-10 relative">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block select-none">
                Average Completion Velocity
              </span>
              <h3 className="text-3xl font-bold text-slate-800 leading-none">
                {summary.avgCompletionTimeHours ? summary.avgCompletionTimeHours.toFixed(1) : 0}h
              </h3>
              <p className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Time between creation and Done status
              </p>
            </CardBody>
          </Card>

          {/* Card: Overdue Tasks Count (Admin Only) */}
          {userRole !== 'manager' && (
            <Card className="border-red-200 bg-red-50/5 relative overflow-hidden shadow-sm">
              <CardBody className="p-5 space-y-1.5 z-10 relative">
                <span className="text-[10px] uppercase font-bold tracking-wider text-red-500 block select-none">
                  Overdue Tasks
                </span>
                <h3 className="text-3xl font-bold text-red-650 leading-none">{summary.overdueTasksCount || 0}</h3>
                <p className="text-xs text-red-500/80 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Incomplete tasks past their due dates
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* 2. Completion Trends Chart & Status distributions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Recharts Completion Trends Chart Panel */}
          <Card className="md:col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                Completion Trends (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="w-full h-56 select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={summary.completionTrends}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '11px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                      }}
                    />
                    <Area
                      name="Completed Tasks"
                      type="monotone"
                      dataKey="completed"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCompleted)"
                    />
                    <Area
                      name="Created Tasks"
                      type="monotone"
                      dataKey="created"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorCreated)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          {/* Recharts Task Allocation Distribution Panel */}
          <Card className="flex flex-col justify-between shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-blue-600" />
                Task Allocation
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col justify-between h-full">
              <div className="w-full h-36 relative flex items-center justify-center select-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={56}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '11px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider select-none">Total</span>
                  <span className="text-xl font-bold text-slate-800 leading-none">{summary.totalTasks || 0}</span>
                </div>
              </div>

              <div className="space-y-1.5 mt-4">
                {statusData.map((entry, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 text-slate-650">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name}</span>
                    </div>
                    <span className="font-semibold text-slate-800">{entry.value} tasks</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 3. Member Analytics list */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Users className="w-4.5 h-4.5 text-slate-500" />
              Member Workloads & Performance
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {membersWithAnalytics.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs italic select-none">
                No active workspace members have assigned tasks.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">Workload</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">Velocity</TableHead>
                    <TableHead className="text-right">Completion Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersWithAnalytics.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="flex items-center gap-3">
                        <Avatar username={m.user?.username} size="xs" />
                        <div>
                          <div className="font-semibold text-slate-800">{m.user?.username || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{m.user?.email}</div>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant={m.role === 'admin' ? 'danger' : m.role === 'manager' ? 'info' : 'neutral'}>
                          {m.role}
                        </Badge>
                      </TableCell>
                      
                      <TableCell className="text-center font-semibold text-slate-700">
                        {m.totalAssigned} tasks
                      </TableCell>
                      
                      <TableCell className="text-center text-emerald-650 font-semibold">
                        {m.completedAssigned} done
                      </TableCell>
                      
                      <TableCell className="text-center text-slate-700 font-semibold">
                        {m.avgCompletionTimeHours ? `${m.avgCompletionTimeHours.toFixed(1)}h` : '0.0h'}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <span className="font-bold text-blue-600 text-xs">{m.memberCompletionRate}%</span>
                          <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${m.memberCompletionRate}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Analytics;
