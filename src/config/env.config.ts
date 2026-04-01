export const EnvConfiguration = () => ({
    environment: process.env.NODE_ENV || 'dev',
    mongodb: process.env.MONGODB,
    port: process.env.PORT || 3002,
    defaultLimit: process.env.DEFAULT_LIMIT || 7,
    mailerService: process.env.MAILER_SERVICE,
    mailerEmail: process.env.MAILER_EMAIL,
    mailerSecretKey: process.env.MAILER_SECRET_KEY,
});