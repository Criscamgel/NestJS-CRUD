import * as Joi from 'joi';

export const JoiValidationSchema = Joi.object({
    CORS_ORIGINS: Joi.string().optional(),
    /** WebApp (SPA): enlaces en correos de bienvenida y recuperación de contraseña. */
    PUBLIC_WEB_APP_URL: Joi.string().uri().optional(),
    /** Landing pública (Vite): URL absoluta; retorno tras pago Bold (p. ej. ?pagoBold=1). */
    PUBLIC_LANDING_URL: Joi.string().uri().optional().allow(''),
    FRONTEND_URL: Joi.string().uri().optional(),
    MONGODB: Joi.required(),
    JWT_SECRET: Joi.string().required(),
    PORT: Joi.number().default(3005),
    DEFAULT_LIMIT: Joi.number().default(6),
    MAILER_SERVICE: Joi.string().optional(),
    MAILER_HOST: Joi.string().optional(),
    MAILER_PORT: Joi.number().optional(),
    MAILER_EMAIL: Joi.string().required(),
    MAILER_SECRET_KEY: Joi.string().required(),
    /** Destino del formulario landing (por defecto hola@cheky.co en código) */
    CONTACT_DEMO_INBOX: Joi.string().email().optional(),
    /** Bold Pagos — opcionales para no bloquear entornos sin pasarela */
    /** Base URL Bold (API Link), sin barra final. Nombre que usa el API en producción y el demo oficial. */
    BOLD_API_LINK_URL: Joi.string().uri().optional().allow(''),
    /** Alias opcional del mismo valor (documentación previa). */
    BOLD_API_LINK_URI: Joi.string().uri().optional(),
    BOLD_API_KEY: Joi.string().optional().allow(''),
    /** Bold Pagos — opcionales para no bloquear entornos sin pasarela */
    BOLD_SECRET_KEY: Joi.string().optional().allow(''),
    /** Alias opcional de la misma URL de landing. */
    LANDING_URL: Joi.string().uri().optional().allow(''),
    DEBUG_BOLD_WEBHOOK: Joi.string().valid('true', 'false').optional(),
    TURNSTILE_SECRET_KEY: Joi.string().optional().allow(''),
    TURNSTILE_ENABLED: Joi.string().valid('true', 'false', '1', '0').optional(),
    CALDAV_ENABLED: Joi.string().valid('true', 'false', '1', '0').optional(),
    CALDAV_SERVER_URL: Joi.string().uri().optional(),
    CALDAV_USERNAME: Joi.string().email().optional().allow(''),
    CALDAV_PASSWORD: Joi.string().optional().allow(''),
    CALDAV_CALENDAR_URL: Joi.string().uri().optional().allow(''),
    CALDAV_CALENDAR_NAME: Joi.string().optional().allow(''),
    APPOINTMENT_START_HOUR: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
    APPOINTMENT_END_HOUR: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
    APPOINTMENT_INBOX: Joi.string().email().optional(),
    // Seed - SuperAdmins (opcionales para no bloquear el arranque)
    SEED_ADMIN1_EMAIL: Joi.string().email().optional(),
    SEED_ADMIN1_DOCUMENT: Joi.string().optional(),
    SEED_ADMIN1_PASSWORD: Joi.string().optional(),
    SEED_ADMIN1_NAME: Joi.string().optional(),
    SEED_ADMIN1_LASTNAME: Joi.string().optional(),
    SEED_ADMIN2_EMAIL: Joi.string().email().optional(),
    SEED_ADMIN2_DOCUMENT: Joi.string().optional(),
    SEED_ADMIN2_PASSWORD: Joi.string().optional(),
    SEED_ADMIN2_NAME: Joi.string().optional(),
    SEED_ADMIN2_LASTNAME: Joi.string().optional(),
})