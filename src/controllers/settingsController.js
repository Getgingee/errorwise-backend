const UserSettings = require('../models/userSettings');

// Get user settings
exports.getSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({
        userId,
        preferences: {
          notifications: { email: true, push: false, errorAlerts: true, weeklyReports: true },
          privacy: { shareAnalytics: false, publicProfile: false },
          ai: { preferredProvider: 'auto', analysisDepth: 'standard', codeContext: true },
          display: { theme: 'light', language: 'en', timezone: 'UTC' }
        }
      });
    }

    res.json({
      id: settings.id,
      preferences: settings.preferences,
      updatedAt: settings.updatedAt
    });
  } catch (error) {
    console.error('Failed to fetch user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
};

// Update user settings
exports.updateSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Valid preferences object is required' });
    }

    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({ userId, preferences });
    } else {
      const mergedPreferences = { ...settings.preferences, ...preferences };
      await settings.update({ preferences: mergedPreferences });
    }

    res.json({
      message: 'Settings updated successfully',
      preferences: settings.preferences,
      updatedAt: settings.updatedAt
    });
  } catch (error) {
    console.error('Failed to update user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
};

// Update notification settings
exports.updateNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notifications } = req.body;

    if (!notifications || typeof notifications !== 'object') {
      return res.status(400).json({ error: 'Valid notifications object is required' });
    }

    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({
        userId,
        preferences: { notifications }
      });
    } else {
      const updatedPreferences = {
        ...settings.preferences,
        notifications: { ...settings.preferences.notifications, ...notifications }
      };
      await settings.update({ preferences: updatedPreferences });
    }

    res.json({
      message: 'Notification settings updated successfully',
      notifications: settings.preferences.notifications
    });
  } catch (error) {
    console.error('Failed to update notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
};

// Update privacy settings
exports.updatePrivacy = async (req, res) => {
  try {
    const userId = req.user.id;
    const { privacy } = req.body;

    if (!privacy || typeof privacy !== 'object') {
      return res.status(400).json({ error: 'Valid privacy object is required' });
    }

    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({
        userId,
        preferences: { privacy }
      });
    } else {
      const updatedPreferences = {
        ...settings.preferences,
        privacy: { ...settings.preferences.privacy, ...privacy }
      };
      await settings.update({ preferences: updatedPreferences });
    }

    res.json({
      message: 'Privacy settings updated successfully',
      privacy: settings.preferences.privacy
    });
  } catch (error) {
    console.error('Failed to update privacy settings:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
};

// Update AI preferences
exports.updateAiPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ai } = req.body;

    if (!ai || typeof ai !== 'object') {
      return res.status(400).json({ error: 'Valid AI preferences object is required' });
    }

    const validProviders = ['auto', 'anthropic', 'mock'];  // Anthropic is the active provider (Claude)
    const validDepths = ['basic', 'standard', 'advanced', 'detailed'];
    
    if (ai.preferredProvider && !validProviders.includes(ai.preferredProvider)) {
      return res.status(400).json({ error: 'Invalid AI provider' });
    }
    
    if (ai.analysisDepth && !validDepths.includes(ai.analysisDepth)) {
      return res.status(400).json({ error: 'Invalid analysis depth' });
    }

    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({
        userId,
        preferences: { ai }
      });
    } else {
      const updatedPreferences = {
        ...settings.preferences,
        ai: { ...settings.preferences.ai, ...ai }
      };
      await settings.update({ preferences: updatedPreferences });
    }

    res.json({
      message: 'AI preferences updated successfully',
      ai: settings.preferences.ai
    });
  } catch (error) {
    console.error('Failed to update AI preferences:', error);
    res.status(500).json({ error: 'Failed to update AI preferences' });
  }
};

// Reset settings to default
exports.resetSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    const defaultPreferences = {
      notifications: { email: true, push: false, errorAlerts: true, weeklyReports: true },
      privacy: { shareAnalytics: false, publicProfile: false },
      ai: { preferredProvider: 'auto', analysisDepth: 'standard', codeContext: true },
      display: { theme: 'light', language: 'en', timezone: 'UTC' }
    };

    let settings = await UserSettings.findOne({ where: { userId } });

    if (!settings) {
      settings = await UserSettings.create({
        userId,
        preferences: defaultPreferences
      });
    } else {
      await settings.update({ preferences: defaultPreferences });
    }

    res.json({
      message: 'Settings reset to default successfully',
      preferences: settings.preferences
    });
  } catch (error) {
    console.error('Failed to reset settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
};