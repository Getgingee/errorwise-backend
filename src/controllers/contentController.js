/**
 * Content Controller
 * Handles dynamic content for Privacy Policy, Terms, Help Center, etc.
 */

const pool = require('../config/db');

/**
 * Get Privacy Policy
 */
exports.getPrivacyPolicy = async (req, res) => {
  try {
    const content = {
      title: 'Privacy Policy',
      lastUpdated: '2025-11-03',
      sections: [
        {
          heading: '1. Information We Collect',
          content: `We collect information you provide directly to us, including:
- Account Information: Name, email address, password (encrypted)
- Error Data: Stack traces, error messages, code snippets you submit for analysis
- Usage Data: How you interact with our platform
- Payment Information: Processed securely through Stripe (we don't store card details)`
        },
        {
          heading: '2. How We Use Your Information',
          content: `We use your information to:
- Provide and improve our AI error analysis services
- Process transactions and send related information
- Send technical notices and support messages
- Respond to your comments and questions
- Analyze usage patterns to improve our platform`
        },
        {
          heading: '3. Data Security',
          content: `We implement industry-standard security measures:
- All data encrypted in transit (TLS/SSL)
- Passwords hashed using bcrypt
- Regular security audits
- GDPR and CCPA compliant practices
- Secure data centers with redundancy`
        },
        {
          heading: '4. Data Sharing',
          content: `We may share your information with:
- AI Service Providers: OpenAI, Anthropic, Google (for error analysis)
- Payment Processors: Stripe (for subscription billing)
- Analytics Services: Google Analytics (anonymized data)
We never sell your personal data to third parties.`
        },
        {
          heading: '5. Your Rights',
          content: `You have the right to:
- Access your personal data
- Correct inaccurate data
- Delete your account and data
- Export your data (data portability)
- Opt-out of marketing communications
Contact privacy@errorwise.com to exercise these rights.`
        },
        {
          heading: '6. Cookies and Tracking',
          content: `We use cookies for:
- Authentication and session management
- Analytics and performance monitoring
- Personalization
You can control cookies through your browser settings.`
        },
        {
          heading: '7. Data Retention',
          content: `We retain your data:
- While your account is active
- As needed to provide services
- To comply with legal obligations
- For 90 days after account deletion (for recovery)`
        },
        {
          heading: '8. Children\'s Privacy',
          content: `ErrorWise is not intended for users under 13 years old. We do not knowingly collect information from children under 13.`
        },
        {
          heading: '9. Contact Us',
          content: `For privacy-related questions:
Email: privacy@errorwise.com
Address: ErrorWise Inc., 123 Tech Street, San Francisco, CA 94105`
        }
      ]
    };

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('❌ Error fetching privacy policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch privacy policy'
    });
  }
};

/**
 * Get Terms of Service
 */
exports.getTermsOfService = async (req, res) => {
  try {
    const content = {
      title: 'Terms of Service',
      lastUpdated: '2025-11-03',
      sections: [
        {
          heading: '1. Acceptance of Terms',
          content: `By accessing and using ErrorWise, you agree to be bound by these Terms of Service and all applicable laws and regulations.`
        },
        {
          heading: '2. Service Description',
          content: `ErrorWise provides AI-powered error analysis and debugging assistance. Features include:
- Real-time error analysis
- AI-generated solutions
- Multi-language support (50+ languages)
- Integration with development tools
- Team collaboration features`
        },
        {
          heading: '3. User Accounts',
          content: `You are responsible for:
- Maintaining the confidentiality of your account
- All activities that occur under your account
- Notifying us of any unauthorized access
You must be at least 13 years old to create an account.`
        },
        {
          heading: '4. Acceptable Use',
          content: `You agree NOT to:
- Use the service for illegal purposes
- Attempt to gain unauthorized access
- Interfere with service operation
- Upload malicious code or viruses
- Abuse or harass other users
- Scrape or copy our AI models`
        },
        {
          heading: '5. Subscription and Payment',
          content: `- Free tier: 10 error analyses per month
- Paid plans: Billed monthly or annually
- Automatic renewal unless cancelled
- Refunds: 30-day money-back guarantee for annual plans
- Price changes: 30-day advance notice`
        },
        {
          heading: '6. Intellectual Property',
          content: `- ErrorWise: We own all rights to our platform, AI models, and branding
- Your Code: You retain all rights to code you submit
- AI Suggestions: Provided "as-is" for your use
- Feedback: We may use your feedback to improve our service`
        },
        {
          heading: '7. AI-Generated Content',
          content: `Important disclaimers:
- AI solutions may not always be correct or optimal
- You are responsible for reviewing and testing all code
- We are not liable for bugs introduced by suggested fixes
- Always verify AI responses before production use`
        },
        {
          heading: '8. Limitation of Liability',
          content: `ErrorWise shall not be liable for any indirect, incidental, special, consequential, or punitive damages. Our total liability is limited to the amount you paid in the last 12 months.`
        },
        {
          heading: '9. Service Availability',
          content: `We strive for 99.9% uptime but do not guarantee uninterrupted access. We may:
- Perform scheduled maintenance with notice
- Temporarily suspend service for updates
- Modify or discontinue features with notice`
        },
        {
          heading: '10. Termination',
          content: `We may terminate or suspend your account immediately for violations of these Terms. You may cancel your subscription at any time through your account settings.`
        },
        {
          heading: '11. Changes to Terms',
          content: `We reserve the right to modify these terms at any time. We will notify users of significant changes via email or in-app notification. Continued use constitutes acceptance of new terms.`
        },
        {
          heading: '12. Contact',
          content: `For questions about these Terms:
Email: legal@errorwise.com
Address: ErrorWise Inc., 123 Tech Street, San Francisco, CA 94105`
        }
      ]
    };

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('❌ Error fetching terms of service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms of service'
    });
  }
};

/**
 * Get About page content
 */
exports.getAboutContent = async (req, res) => {
  try {
    const content = {
      title: 'About ErrorWise',
      mission: 'Make debugging faster and less frustrating for developers everywhere.',
      description: `ErrorWise was founded in 2024 with a simple mission: make debugging faster and less frustrating for developers everywhere. We believe that developers should spend their time building amazing products, not deciphering cryptic error messages. Our AI-powered platform analyzes errors in seconds and provides clear, actionable solutions.`,
      stats: [
        { label: 'Active Developers', value: '50,000+' },
        { label: 'Errors Analyzed', value: '1,000,000+' },
        { label: 'Accuracy Rate', value: '95%' }
      ],
      values: [
        {
          title: 'Developer First',
          description: 'Built by developers, for developers'
        },
        {
          title: 'Privacy Focused',
          description: 'Your code is yours, we never store it permanently'
        },
        {
          title: 'Continuous Innovation',
          description: 'Always improving our AI models'
        }
      ]
    };

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('❌ Error fetching about content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch about content'
    });
  }
};

/**
 * Get Community info
 */
exports.getCommunityInfo = async (req, res) => {
  try {
    const content = {
      title: 'Join Our Developer Community',
      description: 'Connect with 50,000+ developers solving real-world problems.',
      platforms: [
        {
          name: 'Discord',
          members: '15,000+',
          description: 'Real-time chat, voice channels, and dedicated help channels',
          activity: '~500 messages/day',
          link: 'https://discord.gg/errorwise'
        },
        {
          name: 'GitHub',
          members: '8,000+',
          description: 'In-depth technical discussions and open-source contributions',
          activity: 'Highly technical',
          link: 'https://github.com/errorwise/community'
        },
        {
          name: 'Twitter',
          members: '25,000+',
          description: 'Latest updates, tips & tricks, and debugging challenges',
          activity: 'Daily tips',
          link: 'https://twitter.com/errorwise'
        },
        {
          name: 'Reddit',
          members: '5,000+',
          description: 'Community forum for discussions and success stories',
          activity: '~50 posts/week',
          link: 'https://reddit.com/r/errorwise'
        }
      ],
      stats: [
        { label: 'Errors Solved Together', value: '1M+' },
        { label: 'GitHub Stars', value: '50K+' },
        { label: 'Active Contributors', value: '200+' }
      ],
      channels: [
        { name: '#javascript-help', description: 'React, Node.js, TypeScript troubleshooting' },
        { name: '#python-debugging', description: 'Django, Flask, async/await issues' },
        { name: '#backend-warriors', description: 'Database errors, API issues, performance' },
        { name: '#show-and-tell', description: 'Share your solved errors and solutions' },
        { name: '#ai-discussions', description: 'How AI analyzes your errors' },
        { name: '#feature-requests', description: 'Suggest improvements and vote' }
      ]
    };

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    console.error('❌ Error fetching community info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch community info'
    });
  }
};

module.exports = exports;
