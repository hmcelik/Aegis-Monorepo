import React, { useEffect, useState } from 'react';
import { Bot, Shield, Users, BarChart3, Settings, Zap } from 'lucide-react';
import TelegramLoginWidget from './TelegramLoginWidget';

const LoginScreen = ({ onTelegramLogin, onDemoMode }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoClick = async () => {
    setIsLoading(true);
    try {
      await onDemoMode();
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: <Shield className="h-6 w-6" />,
      title: "AI-Powered Moderation",
      description: "Advanced spam and content detection using machine learning"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "User Management",
      description: "Comprehensive strike system with automatic penalties"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Detailed Analytics",
      description: "Real-time statistics and moderation insights"
    },
    {
      icon: <Settings className="h-6 w-6" />,
      title: "Flexible Configuration",
      description: "Customize thresholds and moderation rules per group"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Real-time Actions",
      description: "Instant moderation with audit logging"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Left Panel - Hero Section */}
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12">
          <div className="max-w-lg mx-auto lg:mx-0">
            {/* Logo and Title */}
            <div className="flex items-center mb-8">
              <div className="bg-blue-600 rounded-2xl p-3 mr-4">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Aegis Bot
                </h1>
                <p className="text-lg text-blue-600 font-medium">
                  Telegram Moderation Dashboard
                </p>
              </div>
            </div>

            {/* Subtitle */}
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
              Intelligent Group Moderation Made Simple
            </h2>
            
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Protect your Telegram communities with AI-powered moderation, 
              comprehensive analytics, and flexible rule management.
            </p>

            {/* Features List */}
            <div className="space-y-4 mb-12">
              {features.slice(0, 3).map((feature, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="bg-blue-100 rounded-lg p-2 text-blue-600">
                      {feature.icon}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-gray-200">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">99.9%</div>
                <div className="text-sm text-gray-600">Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">24/7</div>
                <div className="text-sm text-gray-600">Monitoring</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">1M+</div>
                <div className="text-sm text-gray-600">Messages Processed</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 lg:bg-white lg:shadow-2xl">
          <div className="max-w-md mx-auto w-full">
            {/* Login Header */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome Back
              </h3>
              <p className="text-gray-600">
                Sign in to access your moderation dashboard
              </p>
            </div>

            {/* Login Methods */}
            <div className="space-y-6">
              {/* Telegram Login */}
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-center">
                <div className="mb-4">
                  <div className="bg-white bg-opacity-20 rounded-full p-3 inline-block mb-3">
                    <Bot className="h-6 w-6 text-white" />
                  </div>
                  <h4 className="text-white font-semibold mb-2">
                    Sign in with Telegram
                  </h4>
                  <p className="text-blue-100 text-sm mb-4">
                    Use your Telegram account for secure authentication
                  </p>
                </div>
                
                <div className="bg-white rounded-lg p-4">
                  <TelegramLoginWidget onAuth={onTelegramLogin} />
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Demo Mode */}
              <div className="bg-gray-50 rounded-xl p-6 text-center">
                <div className="mb-4">
                  <div className="bg-gray-200 rounded-full p-3 inline-block mb-3">
                    <BarChart3 className="h-6 w-6 text-gray-600" />
                  </div>
                  <h4 className="text-gray-900 font-semibold mb-2">
                    Try Demo Mode
                  </h4>
                  <p className="text-gray-600 text-sm mb-4">
                    Explore all features with sample data
                  </p>
                </div>
                
                <button
                  onClick={handleDemoClick}
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                    isLoading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gray-800 hover:bg-gray-900 text-white shadow-sm hover:shadow-md'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Loading Demo...</span>
                    </div>
                  ) : (
                    'Enter Demo Mode'
                  )}
                </button>
              </div>

              {/* Security Note */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="font-medium text-green-900 mb-1">
                      Secure & Private
                    </h5>
                    <p className="text-sm text-green-700">
                      We use Telegram's secure authentication. Your credentials are never stored on our servers.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500">
                Need help? Contact{' '}
                <a href="https://t.me/aegisbot" className="text-blue-600 hover:text-blue-700 font-medium">
                  @aegisbot
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
