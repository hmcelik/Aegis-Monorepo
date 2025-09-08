import React, { useState } from 'react';
import { Check, Crown, Zap, Shield, Star, Users, TrendingUp, Award } from 'lucide-react';

const SubscriptionPage = ({ user }) => {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState('pro');

  const plans = {
    free: {
      name: 'Free',
      icon: '🚀',
      price: { monthly: 0, yearly: 0 },
      color: 'border-gray-200 bg-white',
      popular: false,
      features: [
        'Basic spam detection',
        'Up to 100 members',
        'Daily reports',
        'Community support',
        '24/7 basic monitoring',
      ],
    },
    pro: {
      name: 'Professional',
      icon: '⭐',
      price: { monthly: 9.99, yearly: 99.99 },
      color: 'border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50',
      popular: true,
      features: [
        'Advanced AI moderation',
        'Up to 5,000 members',
        'Real-time alerts',
        'Custom rules engine',
        'Analytics dashboard',
        'Priority support',
        'Auto-ban capabilities',
        'Strike system',
      ],
    },
    enterprise: {
      name: 'Enterprise',
      icon: '👑',
      price: { monthly: 29.99, yearly: 299.99 },
      color: 'border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50',
      popular: false,
      features: [
        'Everything in Professional',
        'Unlimited members',
        'Multi-group management',
        'Advanced analytics',
        'Custom integrations',
        'Dedicated support',
        'White-label options',
        'API access',
        'Custom AI training',
      ],
    },
  };

  const addons = [
    {
      id: 'extra_groups',
      name: 'Additional Groups',
      description: '+10 more groups',
      price: { monthly: 2.99, yearly: 29.99 },
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'priority_support',
      name: 'Priority Support',
      description: '24/7 premium support',
      price: { monthly: 4.99, yearly: 49.99 },
      icon: <Shield className="w-5 h-5" />,
    },
    {
      id: 'advanced_analytics',
      name: 'Advanced Analytics',
      description: 'Detailed insights & reports',
      price: { monthly: 7.99, yearly: 79.99 },
      icon: <TrendingUp className="w-5 h-5" />,
    },
  ];

  const handlePlanSelect = planId => {
    setSelectedPlan(planId);
  };

  const handleSubscribe = () => {
    // Handle subscription logic here
    console.log('Subscribe to:', selectedPlan, 'billing:', billingCycle);
  };

  const getSavingsPercentage = () => {
    if (billingCycle === 'yearly' && selectedPlan in plans) {
      const monthly = plans[selectedPlan].price.monthly;
      const yearly = plans[selectedPlan].price.yearly;
      if (monthly > 0 && yearly > 0) {
        return Math.round((1 - yearly / (monthly * 12)) * 100);
      }
    }
    return 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl border border-purple-200/50 p-8 shadow-lg">
          <div className="text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent flex items-center justify-center gap-4">
              <span className="text-4xl">👑</span>
              <span>Upgrade Your Bot</span>
            </h1>
            <p className="mt-4 text-gray-700 text-xl">
              Choose the perfect plan to supercharge your Telegram moderation
            </p>
            <div className="mt-4 flex items-center justify-center gap-4">
              <span className="text-lg font-medium text-gray-800">
                Plan for{' '}
                <span className="font-bold text-purple-600">{user?.first_name || 'User'}</span>
              </span>
              {user?.is_guest && (
                <span className="px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-sm rounded-full font-medium shadow-md">
                  Demo Mode
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-2 shadow-xl border-2 border-purple-200/50">
            <div className="relative grid grid-cols-2 bg-gray-100/80 rounded-xl p-1">
              {/* Animated Slider Background */}
              <div
                className={`absolute inset-1 w-1/2 rounded-lg shadow-lg bg-gradient-to-r from-purple-500 to-purple-600 
                            transition-transform duration-300 ease-out pointer-events-none
                            ${billingCycle === 'monthly' ? 'translate-x-0' : 'translate-x-full'}`}
              />

              {/* Monthly Button */}
              <button
                className={`!relative !z-10 !h-14 !px-8 !rounded-lg !font-bold !text-base !tracking-wide 
                            !flex !items-center !justify-center !gap-2 !transition-all !duration-300 !border-none !outline-none
                            ${billingCycle === 'monthly' ? '!text-white' : '!text-gray-700 hover:!text-gray-900'}`}
                onClick={() => setBillingCycle('monthly')}
                type="button"
              >
                💳 Monthly
              </button>

              {/* Yearly Button */}
              <button
                className={`!relative !z-10 !h-14 !px-8 !rounded-lg !font-bold !text-base !tracking-wide 
                            !flex !items-center !justify-center !gap-2 !transition-all !duration-300 !border-none !outline-none
                            ${billingCycle === 'yearly' ? '!text-white' : '!text-gray-700 hover:!text-gray-900'}`}
                onClick={() => setBillingCycle('yearly')}
                type="button"
              >
                🎯 Yearly
              </button>

              {/* Save Badge */}
              {billingCycle === 'yearly' && (
                <div className="absolute -top-3 -right-4 bg-gradient-to-r from-orange-400 to-red-400 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg animate-pulse">
                  Save 17%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {Object.entries(plans).map(([planId, plan]) => (
            <div
              key={planId}
              className={`relative rounded-2xl p-8 cursor-pointer transition-all duration-300 hover:shadow-xl border-2 ${
                plan.color
              } ${selectedPlan === planId ? 'ring-4 ring-purple-300 shadow-2xl transform scale-105' : 'shadow-lg'}`}
              onClick={() => handlePlanSelect(planId)}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                    <Star className="w-4 h-4 inline mr-2" />
                    Most Popular
                  </div>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6">
                <div className="text-4xl mb-4">{plan.icon}</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>

                <div className="mb-4">
                  <div className="text-4xl font-bold text-gray-900">
                    {plan.price[billingCycle] === 0 ? (
                      <span>Free</span>
                    ) : (
                      <span>
                        ${plan.price[billingCycle]}
                        <span className="text-lg text-gray-600 ml-1">
                          /{billingCycle === 'monthly' ? 'month' : 'year'}
                        </span>
                      </span>
                    )}
                  </div>

                  {billingCycle === 'yearly' && plan.price.yearly > 0 && (
                    <div className="text-green-600 font-semibold text-sm mt-2">
                      Save ${(plan.price.monthly * 12 - plan.price.yearly).toFixed(2)}/year
                    </div>
                  )}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Select Button */}
              <button
                className={`!w-full !py-4 !px-6 !rounded-xl !font-bold !text-lg !transition-all !duration-200 !border-none !outline-none !cursor-pointer ${
                  selectedPlan === planId
                    ? '!bg-gradient-to-r !from-purple-500 !to-blue-500 !text-white !shadow-lg'
                    : '!bg-gray-100 !text-gray-700 hover:!bg-gray-200 !border !border-gray-300'
                }`}
                onClick={e => {
                  e.stopPropagation();
                  handlePlanSelect(planId);
                }}
                type="button"
              >
                {selectedPlan === planId ? (
                  <span className="flex items-center justify-center gap-2">
                    <Crown className="w-5 h-5" />
                    Selected
                  </span>
                ) : (
                  'Choose Plan'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Add-ons Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
              <Zap className="w-8 h-8 text-purple-600" />
              Premium Add-ons
            </h2>
            <p className="mt-2 text-gray-600">Enhance your plan with additional features</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {addons.map(addon => (
              <div
                key={addon.id}
                className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 border border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-600">{addon.icon}</div>
                  <div>
                    <h4 className="font-bold text-gray-900">{addon.name}</h4>
                    <p className="text-sm text-gray-600">{addon.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">
                    ${addon.price[billingCycle]}
                    <span className="text-sm text-gray-600">
                      /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </span>
                  <button
                    className="!px-4 !py-2 !bg-purple-100 !text-purple-700 !rounded-lg hover:!bg-purple-200 !transition-colors !duration-200 !font-medium !border-none !outline-none !cursor-pointer"
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscribe Button */}
        <div className="text-center">
          <button
            onClick={handleSubscribe}
            className="!inline-flex !items-center !gap-3 !px-12 !py-4 !bg-gradient-to-r !from-purple-600 !to-blue-600 !text-white !text-xl !font-bold !rounded-2xl !shadow-2xl hover:!shadow-3xl hover:!scale-105 !transition-all !duration-300 !border-none !outline-none !cursor-pointer"
            type="button"
          >
            <Award className="w-6 h-6" />
            Subscribe to {plans[selectedPlan].name}
            {getSavingsPercentage() > 0 && (
              <span className="ml-2 px-3 py-1 bg-white/20 rounded-full text-sm">
                Save {getSavingsPercentage()}%
              </span>
            )}
          </button>

          <p className="mt-4 text-gray-600">
            Cancel anytime • 30-day money-back guarantee • Secure payment
          </p>
        </div>

        {/* Features Comparison */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Why Choose Premium?</h2>
            <p className="mt-2 text-gray-600">See what you get with our premium plans</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: '🤖',
                title: 'AI-Powered',
                desc: 'Advanced machine learning for spam detection',
              },
              { icon: '⚡', title: 'Real-time', desc: 'Instant moderation and alerts' },
              { icon: '📊', title: 'Analytics', desc: 'Detailed insights and reporting' },
              { icon: '🛡️', title: 'Protection', desc: '24/7 monitoring and security' },
            ].map((feature, index) => (
              <div
                key={index}
                className="text-center p-6 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h4 className="font-bold text-gray-900 mb-2">{feature.title}</h4>
                <p className="text-gray-600 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
