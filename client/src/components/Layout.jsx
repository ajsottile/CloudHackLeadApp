import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  LayoutDashboard, 
  Users, 
  Search, 
  FileText, 
  Send,
  Zap,
  Bot,
  Bell,
  X,
  ExternalLink,
  Check,
} from 'lucide-react';
import { agentsApi } from '../services/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: Users, label: 'Pipeline' },
  { to: '/discovery', icon: Search, label: 'Discovery' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/campaigns', icon: Send, label: 'Campaigns' },
  { to: '/agents', icon: Bot, label: 'AI Agents' },
];

function Layout() {
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notificationData } = useQuery({
    queryKey: ['notifications'],
    queryFn: agentsApi.getNotifications,
    refetchInterval: 15000, // Check every 15 seconds
  });

  const markReadMutation = useMutation({
    mutationFn: agentsApi.markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: agentsApi.markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notifications = notificationData?.notifications || [];
  const unreadCount = notificationData?.unreadCount || 0;

  const handleNotificationClick = (notification) => {
    markReadMutation.mutate(notification.id);
    if (notification.action_url) {
      navigate(notification.action_url);
    }
    setShowNotifications(false);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'meeting_request':
        return '🎯';
      case 'interested':
        return '✨';
      case 'deal_won':
        return '🎉';
      case 'not_interested':
        return '😔';
      case 'question':
        return '❓';
      case 'review_needed':
        return '⚠️';
      default:
        return '📬';
    }
  };

  return (
    <div className="min-h-screen flex bg-dark-900">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-800 border-r border-dark-600 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-dark-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-white">CloudHack</h1>
              <p className="text-xs text-gray-500">Outreach Manager</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-dark-700'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-dark-600">
          <div className="px-4 py-3 rounded-lg bg-dark-700/50">
            <p className="text-xs text-gray-500">Version 2.0.0</p>
            <p className="text-xs text-cyan-400 mt-1">cloudhack.dev</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Bar */}
        <div className="sticky top-0 z-10 bg-dark-900/80 backdrop-blur-sm border-b border-dark-600 px-8 py-4">
          <div className="flex justify-end">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg hover:bg-dark-700 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 w-5 h-5 bg-cyan-500 rounded-full text-xs text-white flex items-center justify-center font-medium">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-dark-800 rounded-xl border border-dark-600 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
                    <h3 className="font-medium text-white">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllReadMutation.mutate()}
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 10).map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => handleNotificationClick(notification)}
                          className={`px-4 py-3 border-b border-dark-700 cursor-pointer hover:bg-dark-700/50 transition-colors ${
                            !notification.is_read ? 'bg-dark-700/30' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-xl">{getNotificationIcon(notification.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white text-sm truncate">
                                  {notification.title}
                                </span>
                                {!notification.is_read && (
                                  <span className="w-2 h-2 bg-cyan-500 rounded-full flex-shrink-0" />
                                )}
                              </div>
                              {notification.message && (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                  {notification.message}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(notification.created_at).toLocaleString()}
                              </p>
                            </div>
                            {notification.action_url && (
                              <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center text-gray-400">
                        No notifications yet
                      </div>
                    )}
                  </div>
                  {notifications.length > 10 && (
                    <div className="px-4 py-2 border-t border-dark-600 text-center">
                      <button
                        onClick={() => {
                          navigate('/agents');
                          setShowNotifications(false);
                        }}
                        className="text-sm text-cyan-400 hover:text-cyan-300"
                      >
                        View all notifications
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8">
          <Outlet />
        </div>
      </main>

      {/* Click outside to close notifications */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}

export default Layout;
