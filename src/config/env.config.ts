export const EnvConfiguration = () => ({
    /** Lista separada por comas; ver `main.ts` CORS */
    corsOrigins: process.env.CORS_ORIGINS,
    /** URL pública de la SPA (correos de reset / bienvenida). */
    publicWebAppUrl: process.env.PUBLIC_WEB_APP_URL,
    /** URL pública de la landing (retorno Bold tras checkout público). */
    publicLandingUrl:
        process.env.PUBLIC_LANDING_URL?.trim() ||
        process.env.LANDING_URL?.trim() ||
        process.env.FRONTEND_PATH?.trim(),
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
    /**
     * Host Bold Integrations (`https://integrations.api.bold.co`) o URL que ya incluya
     * `/online/link/v1`. El servicio usa ese path según documentación de API Link.
     */
    boldApiLinkBaseUrl:
        process.env.BOLD_API_LINK_URL?.trim() ||
        process.env.BOLD_API_LINK_URI?.trim() ||
        '',
    boldApiKey: process.env.BOLD_API_KEY,
    boldSecretKey: process.env.BOLD_SECRET_KEY,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY?.trim() ?? '',
    turnstileEnabled: process.env.TURNSTILE_ENABLED?.trim() ?? '',
});