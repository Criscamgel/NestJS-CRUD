import * as Joi from 'joi';

export const JoiValidationSchema = Joi.object({
    MONGODB: Joi.required(),
    JWT_SECRET: Joi.string().required(),
    PORT: Joi.number().default(3005),
    DEFAULT_LIMIT: Joi.number().default(6),
    MAILER_SERVICE: Joi.string().optional(),
    MAILER_HOST: Joi.string().optional(),
    MAILER_PORT: Joi.number().optional(),
    MAILER_EMAIL: Joi.string().required(),
    MAILER_SECRET_KEY: Joi.string().required(),
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