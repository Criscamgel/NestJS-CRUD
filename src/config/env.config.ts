export const EnvConfiguration = () => ({
    /** Lista separada por comas; ver `main.ts` CORS */
    corsOrigins: process.env.CORS_ORIGINS,
    /** URL pública de la SPA (correos de reset / bienvenida). */
    publicWebAppUrl: process.env.PUBLIC_WEB_APP_URL,
    frontendUrl: process.env.FRONTEND_URL,
    environment: process.env.NODE_ENV || 'dev',
    mongodb: process.env.MONGODB,
    port: process.env.PORT || 3002,
    defaultLimit: process.env.DEFAULT_LIMIT || 7,
    mailerService: process.env.MAILER_SERVICE,
    mailerHost: process.env.MAILER_HOST,
    mailerPort: process.env.MAILER_PORT ? parseInt(process.env.MAILER_PORT, 10) : undefined,
    mailerEmail: process.env.MAILER_EMAIL,
    mailerSecretKey: process.env.MAILER_SECRET_KEY,
    contactDemoInbox: process.env.CONTACT_DEMO_INBOX,
});