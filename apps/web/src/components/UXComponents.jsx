import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

// Enhanced Loading Component
export const LoadingCard = ({ title = 'Loading...', subtitle = null, size = 'medium' }) => {
  const sizeClasses = {
    small: 'p-4',
    medium: 'p-6',
    large: 'p-8',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${sizeClasses[size]} text-center`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
    </div>
  );
};

// Enhanced Error Component
export const ErrorCard = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryText = 'Try Again',
  icon = <AlertCircle size={24} />,
}) => {
  return (
    <div className="bg-white rounded-lg border border-red-200 p-6 text-center">
      <div className="flex justify-center mb-4 text-red-500">{icon}</div>
      <h3 className="text-lg font-medium text-red-900 mb-2">{title}</h3>
      {message && <p className="text-sm text-red-700 mb-4">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          <span>{retryText}</span>
        </button>
      )}
    </div>
  );
};

// Empty State Component
export const EmptyState = ({
  icon = '📭',
  title = 'No data found',
  description,
  action,
  actionText = 'Get Started',
}) => {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-600 mb-6 max-w-md mx-auto">{description}</p>}
      {action && (
        <button
          onClick={action}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

// Skeleton Loader for Lists
export const SkeletonCard = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              <div className="h-3 bg-gray-300 rounded w-1/2"></div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-300 rounded w-full"></div>
            <div className="h-3 bg-gray-300 rounded w-2/3"></div>
          </div>
        </div>
      ))}
    </>
  );
};

// Success/Info Toast replacement
export const StatusBanner = ({ type = 'info', message, onClose, autoClose = true }) => {
  React.useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  const typeClasses = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div
      className={`fixed top-4 right-4 max-w-sm border rounded-lg p-4 shadow-lg z-50 ${typeClasses[type]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="ml-3 text-lg leading-none hover:opacity-70">
          ×
        </button>
      </div>
    </div>
  );
};
