export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cold-calling',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY || '',
});
