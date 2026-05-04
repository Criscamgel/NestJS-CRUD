import * as Joi from 'joi';

export const JoiValidationSchema = Joi.object({
    CORS_ORIGINS: Joi.string().optional(),
    /** WebApp (SPA): enlaces en correos de bienvenida y recuperación de contraseña. */
    PUBLIC_WEB_APP_URL: Joi.string().uri().optional(),
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
    BOLD_SECRET_KEY: Joi.string().optional().allow(''),
    BOLD_API_KEY: Joi.string().optional().allow(''),
    BOLD_API_LINK_URL: Joi.string().uri().optional().allow(''),
    /** URL absoluta de la landing (retorno ?pagoBold=1) */
    PUBLIC_LANDING_URL: Joi.string().uri().optional().allow(''),
    LANDING_URL: Joi.string().uri().optional().allow(''),
    DEBUG_BOLD_WEBHOOK: Joi.string().valid('true', 'false').optional(),
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