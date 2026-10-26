'use client';

import React, { useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Globe, Settings } from 'lucide-react';

const subscribeToLocation = () => () => {};
const getCurrentDomain = () => window.location.hostname;
const getServerDomain = () => '';

export default function VersionSwitcher() {
  const currentDomain = useSyncExternalStore(
    subscribeToLocation,
    getCurrentDomain,
    getServerDomain,
  );
  const baseDomain = currentDomain.replace(/^(ip4?\.|ip6?\.)/, '');
  const isClient = currentDomain !== '';
  
  const versions = [
    {
      id: 'auto',
      label: '自动检测',
      icon: Globe,
      url: baseDomain ? `https://ip.${baseDomain}` : '#',
      description: '自动选择最佳IP版本',
      color: 'text-gray-600 dark:text-gray-400',
      bg: 'bg-gray-100 dark:bg-gray-800/50'
    },
    {
      id: 'ipv4',
      label: 'IPv4',
      icon: Wifi,
      url: baseDomain ? `https://ip4.${baseDomain}` : '#',
      description: '强制使用IPv4查询',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      id: 'ipv6',
      label: 'IPv6',
      icon: Wifi,
      url: baseDomain ? `https://ip6.${baseDomain}` : '#',
      description: '强制使用IPv6查询',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-100 dark:bg-purple-900/30'
    }
  ];

  const getCurrentVersion = () => {
    if (!isClient) return 'auto'; // 服务器端和首次渲染时默认为auto
    if (currentDomain.startsWith('ip4.')) return 'ipv4';
    if (currentDomain.startsWith('ip6.')) return 'ipv6';
    return 'auto';
  };

  const currentVersion = getCurrentVersion();

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
      <div className="flex items-center space-x-2">
        <Settings className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
        <span className="text-sm text-[rgb(var(--color-text-secondary))] font-medium">IP版本:</span>
      </div>
      <div className="flex gap-2">
        {versions.map((version) => {
          const isActive = currentVersion === version.id;
          const Icon = version.icon;
          
          return (
            <motion.a
              key={version.id}
              href={version.url}
              whileHover={isClient ? { scale: 1.05 } : {}}
              whileTap={isClient ? { scale: 0.95 } : {}}
              onClick={!isClient || version.url === '#' ? (e) => e.preventDefault() : undefined}
              className={`
                relative px-4 py-2 rounded-xl font-medium text-sm
                transition-all duration-200
                ${!isClient || version.url === '#' ? 'pointer-events-none opacity-75' : ''}
                ${isActive 
                  ? `${version.bg} ${version.color} shadow-md` 
                  : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-hover))] border border-[rgb(var(--color-border))]'
                }
              `}
              title={version.description}
            >
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4" />
                <span>{version.label}</span>
              </div>
              
              {isActive && (
                <motion.div
                  layoutId="activeVersion"
                  className="absolute inset-0 rounded-xl border-2 border-current/20"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </motion.a>
          );
        })}
      </div>
    </div>
  );
}
