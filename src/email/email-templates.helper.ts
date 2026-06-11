import { existsSync } from 'fs';
import { join } from 'path';
import { formatMoneyAmount } from 'src/common/utils/money.util';

/** CID for inline logo attachment (must match nodemailer attachment.cid) */
export const EMAIL_LOGO_CID = 'cheky-logo@cheky';

// ─────────────────────────────────────────────
// Brand tokens
// ─────────────────────────────────────────────
const BRAND = {
  primary: '#157634',
  primaryDark: '#0e5226',
  primaryLight: '#1a9640',
  secondary: '#6F4E37',
  tertiary: '#A67B5B',
  neutral: '#2B2D2F',
  neutralLight: '#F4F4F4',
  white: '#FFFFFF',
  textMuted: '#6B7280',
  textBody: '#374151',
};

function escapeHtmlForEmail(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// Shared layout wrapper
// ─────────────────────────────────────────────
/** Horizontal wordmark, transparent background — avoids dark baked-in box from isotipo.png */
export function getEmailLogoPath(): string {
  return join(process.cwd(), 'public', 'assets', 'logo512.png');
}

const EMAIL_LOGO_MAX_WIDTH_PX = 200;

function emailLayout(content: string, showLogo: boolean): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cheky</title>
</head>
<body style="
  margin: 0;
  padding: 0;
  background-color: ${BRAND.neutralLight};
  font-family: 'Segoe UI', Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
">
  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color: ${BRAND.neutralLight}; padding: 40px 16px;">
    <tr>
      <td align="center">

        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
          style="
            max-width: 600px;
            width: 100%;
            background-color: ${BRAND.white};
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          ">

          <!-- ── HEADER ── (bgcolor: fallback when CSS gradient is stripped) -->
          <tr>
            <td bgcolor="${BRAND.primaryDark}" style="
              background-color: ${BRAND.primary};
              background: linear-gradient(135deg, ${BRAND.primaryDark} 0%, ${BRAND.primary} 60%, ${BRAND.primaryLight} 100%);
              padding: 28px 40px 14px 40px;
              text-align: center;
            ">
              ${showLogo
                ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
                style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="#ffffff" style="
                    background-color:#ffffff;
                    border-radius:10px;
                    padding:10px 16px;
                    line-height:0;
                    mso-line-height-rule:exactly;
                  ">
                    <img src="cid:${EMAIL_LOGO_CID}" alt="Cheky"
                      width="${EMAIL_LOGO_MAX_WIDTH_PX}"
                      style="
                        display:block;
                        border:0;
                        outline:none;
                        width:${EMAIL_LOGO_MAX_WIDTH_PX}px;
                        max-width:${EMAIL_LOGO_MAX_WIDTH_PX}px;
                        height:auto;
                        margin:0 auto;
                      " />
                  </td>
                </tr>
              </table>`
                : `
              <h1 style="
                margin: 0;
                color: ${BRAND.white};
                font-size: 26px;
                font-weight: 700;
                letter-spacing: -0.5px;
              ">Cheky</h1>
              <p style="
                margin: 6px 0 0;
                color: rgba(255,255,255,0.9);
                font-size: 14px;
                letter-spacing: 0.02em;
              ">Vende tranqui</p>`}
            </td>
          </tr>

          <!-- ── CONTENT ── (top padding kept tight vs header) -->
          <tr>
            <td style="padding: 18px 48px 32px;">
              ${content}
            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding: 0 48px;">
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 0;" />
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding: 24px 48px 32px; text-align: center;">
              <p style="
                margin: 0 0 8px;
                color: ${BRAND.textMuted};
                font-size: 12px;
                line-height: 1.6;
              ">
                © ${new Date().getFullYear()} Cheky · Todos los derechos reservados
              </p>
              <p style="
                margin: 0;
                color: #9CA3AF;
                font-size: 11px;
              ">
                Este correo fue generado automáticamente, por favor no respondas a este mensaje.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ─────────────────────────────────────────────
// CTA button helper
// ─────────────────────────────────────────────
function ctaButton(label: string, href: string): string {
  // Solid bgcolor on <td> — many clients strip gradients on <a>, leaving white bg + white text (invisible).
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:32px 0;">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:separate;">
        <tr>
          <td bgcolor="${BRAND.primary}" align="center" style="
            background-color:${BRAND.primary};
            border-radius:8px;
            box-shadow:0 4px 12px rgba(21,118,52,0.35);
          ">
            <a href="${href}"
              target="_blank"
              style="
                display:inline-block;
                padding:14px 36px;
                color:${BRAND.white};
                text-decoration:none;
                font-size:15px;
                font-weight:600;
                letter-spacing:0.3px;
                font-family:'Segoe UI',Arial,sans-serif;
              "
            >${label}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `.trim();
}

// ─────────────────────────────────────────────
// Alert box helper (inline notice inside body)
// ─────────────────────────────────────────────
function infoBox(text: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="margin-top: 24px;">
  <tr>
    <td style="
      background-color: #F0FBF4;
      border-left: 4px solid ${BRAND.primary};
      border-radius: 6px;
      padding: 14px 18px;
    ">
      <p style="
        margin: 0;
        color: ${BRAND.primaryDark};
        font-size: 13px;
        line-height: 1.6;
      ">${text}</p>
    </td>
  </tr>
</table>
  `.trim();
}

// ─────────────────────────────────────────────
// Template: Welcome / Set Password
// ─────────────────────────────────────────────
export function welcomeEmailTemplate(userName: string, recoveryLink: string): string {
  const showLogo = existsSync(getEmailLogoPath());
  const content = `
    <h2 style="
      margin: 0 0 8px;
      color: ${BRAND.neutral};
      font-size: 22px;
      font-weight: 700;
    ">¡Bienvenido a Cheky, ${userName}! 👋</h2>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.7;
    ">
      Tu cuenta ha sido creada exitosamente en la plataforma <strong>Cheky</strong>.
      Para comenzar a utilizar todos los servicios, necesitas establecer tu contraseña inicial haciendo clic en el botón a continuación.
    </p>

    ${ctaButton('Establecer Contraseña', recoveryLink)}

    <p style="
      margin: 0 0 6px;
      color: ${BRAND.textMuted};
      font-size: 13px;
      line-height: 1.6;
    ">
      Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
    </p>
    <p style="
      margin: 0 0 24px;
      word-break: break-all;
    ">
      <a href="${recoveryLink}"
        style="color: ${BRAND.primary}; font-size: 12px; text-decoration: underline;"
      >${recoveryLink}</a>
    </p>

    ${infoBox('⚠️ Este enlace es de un solo uso y expirará en breve por motivos de seguridad. Si no solicitaste la creación de esta cuenta, puedes ignorar este correo de manera segura.')}
  `;

  return emailLayout(content, showLogo);
}

// ─────────────────────────────────────────────
// Template: Password Recovery
// ─────────────────────────────────────────────
export function recoverPasswordEmailTemplate(recoveryLink: string): string {
  const showLogo = existsSync(getEmailLogoPath());
  const content = `
    <h2 style="
      margin: 0 0 8px;
      color: ${BRAND.neutral};
      font-size: 22px;
      font-weight: 700;
    ">Recuperación de contraseña 🔒</h2>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.7;
    ">
      Recibimos una solicitud para restablecer la contraseña asociada a tu cuenta en <strong>Cheky</strong>.
      Si fuiste tú, haz clic en el botón para continuar con el proceso:
    </p>

    ${ctaButton('Restablecer Contraseña', recoveryLink)}

    <p style="
      margin: 0 0 6px;
      color: ${BRAND.textMuted};
      font-size: 13px;
      line-height: 1.6;
    ">
      Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
    </p>
    <p style="
      margin: 0 0 24px;
      word-break: break-all;
    ">
      <a href="${recoveryLink}"
        style="color: ${BRAND.primary}; font-size: 12px; text-decoration: underline;"
      >${recoveryLink}</a>
    </p>

    ${infoBox('🔐 Por seguridad, este enlace expirará próximamente y solo puede usarse una vez. Si <strong>no</strong> solicitaste este cambio, ignora este correo — tu contraseña permanecerá sin cambios.')}
  `;

  return emailLayout(content, showLogo);
}

// ─────────────────────────────────────────────
// Template: Password changed (logged-in user)
// ─────────────────────────────────────────────
export function passwordChangedNotificationTemplate(
  displayName: string,
): string {
  const showLogo = existsSync(getEmailLogoPath());
  const safeName = escapeHtmlForEmail(displayName.trim() || 'Usuario');
  const content = `
    <h2 style="
      margin: 0 0 8px;
      color: ${BRAND.neutral};
      font-size: 22px;
      font-weight: 700;
    ">Contraseña actualizada ✅</h2>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.7;
    ">
      Hola <strong>${safeName}</strong>,
    </p>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.7;
    ">
      Te confirmamos que la contraseña de tu cuenta en <strong>Cheky</strong> se cambió correctamente.
      Si no fuiste tú, restablece tu acceso desde la opción de recuperación de contraseña o contacta a soporte de inmediato.
    </p>

    ${infoBox('🔐 Por seguridad, nunca compartas tu contraseña. Si recibes este correo sin haber hecho el cambio, alguien más podría tener acceso a tu cuenta.')}
  `;

  return emailLayout(content, showLogo);
}

/** Logo attachment for templates that use cid:${EMAIL_LOGO_CID} */
export function getEmailLogoAttachment():
  | { filename: string; path: string; cid: string }
  | undefined {
  const path = getEmailLogoPath();
  if (!existsSync(path)) {
    return undefined;
  }
  return { filename: 'logo512.png', path, cid: EMAIL_LOGO_CID };
}

// ─────────────────────────────────────────────
// Template: Landing — enlace seguro para crear admin tras pago Bold
// ─────────────────────────────────────────────
export function landingAdminOnboardingEmailTemplate(onboardingLink: string): string {
  const showLogo = existsSync(getEmailLogoPath());
  const content = `
    <h2 style="
      margin: 0 0 8px;
      color: ${BRAND.neutral};
      font-size: 22px;
      font-weight: 700;
    ">Completa el registro de tu empresa</h2>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.7;
    ">
      Confirmamos tu pago. Para crear tu cuenta de <strong>administrador</strong> y activar la membresía contratada,
      haz clic en el botón. Solo quien tenga acceso a este correo podrá usar el enlace.
    </p>

    ${ctaButton('Crear mi cuenta y empresa', onboardingLink)}

    <p style="
      margin: 0 0 6px;
      color: ${BRAND.textMuted};
      font-size: 13px;
      line-height: 1.6;
    ">
      Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
    </p>
    <p style="
      margin: 0 0 24px;
      word-break: break-all;
    ">
      <a href="${onboardingLink}"
        style="color: ${BRAND.primary}; font-size: 12px; text-decoration: underline;"
      >${onboardingLink}</a>
    </p>

    ${infoBox('Este enlace es personal, de un solo uso y caduca en unos días. Después de registrarte podrás iniciar sesión en la plataforma Cheky con el correo y la contraseña que elijas.')}
  `;

  return emailLayout(content, showLogo);
}

export type LandingPlanThankYouPayload = {
  planName: string;
  monthlyPrice: number;
  currency: string;
  durationMonths: number;
  maxUsers: number;
  maxChecksPerMonth: number;
  totalCharge: number;
};

// ─────────────────────────────────────────────
// Template: Landing — agradecimiento tras pago (detalle del plan)
// ─────────────────────────────────────────────
export function landingPlanThankYouEmailTemplate(
  payload: LandingPlanThankYouPayload,
): string {
  const showLogo = existsSync(getEmailLogoPath());
  const {
    planName,
    monthlyPrice,
    currency,
    durationMonths,
    maxUsers,
    maxChecksPerMonth,
    totalCharge,
  } = payload;
  const fmt = (n: number) => formatMoneyAmount(n, currency);
  const periodLabel =
    durationMonths === 1 ? '1 mes' : `${durationMonths} meses`;

  const row = (label: string, value: string) => `
<tr>
  <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB; font-size: 14px; color: ${BRAND.textMuted}; width: 42%;">${label}</td>
  <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB; font-size: 14px; color: ${BRAND.textBody}; font-weight: 600;">${escapeHtmlForEmail(value)}</td>
</tr>`;

  const content = `
    <h2 style="margin: 0 0 8px; color: ${BRAND.neutral}; font-size: 22px; font-weight: 700;">
      Gracias por elegir Cheky
    </h2>
    <p style="margin: 0 0 20px; color: ${BRAND.textBody}; font-size: 15px; line-height: 1.7;">
      Confirmamos tu pago. Somos un gran aliado en la <strong>seguridad de tus ventas</strong>.
      A continuación encontrarás el resumen del plan que adquiriste.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      ${row('Plan', planName)}
      ${row('Precio mensual', fmt(monthlyPrice))}
      ${row('Total pagado', fmt(totalCharge))}
      ${row('Vigencia', periodLabel)}
      ${row('Usuarios (rol usuario)', `Hasta ${maxUsers}`)}
      ${row('Checks por mes', `Hasta ${maxChecksPerMonth}`)}
    </table>
    ${infoBox(
      `<strong>¿Necesitas ayuda?</strong><br/>Escríbenos a <a href="mailto:ventas@cheky.co" style="color:${BRAND.primary};">ventas@cheky.co</a>. Te responderemos lo antes posible.`,
    )}
    <p style="margin: 0; color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.6;">
      En un correo aparte recibirás el enlace para completar el registro de tu empresa y tu usuario administrador.
    </p>
  `;

  return emailLayout(content, showLogo);
}

// ─────────────────────────────────────────────
// Template: Landing — solicitud de demo (contacto)
// ─────────────────────────────────────────────
export function contactDemoEmailTemplate(payload: {
  name: string;
  email: string;
  company: string;
  volumeLabel: string;
}): string {
  const showLogo = existsSync(getEmailLogoPath());
  const { name, email, company, volumeLabel } = payload;

  const row = (label: string, value: string) => `
<tr>
  <td style="
    padding: 12px 0;
    border-bottom: 1px solid #E5E7EB;
    font-size: 14px;
    color: ${BRAND.textBody};
  ">
    <strong style="display:block; color: ${BRAND.neutral}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">${label}</strong>
    <span style="word-break: break-word;">${escapeHtml(value)}</span>
  </td>
</tr>`;

  const content = `
    <h2 style="
      margin: 0 0 12px;
      color: ${BRAND.neutral};
      font-size: 22px;
      font-weight: 700;
    ">Nueva solicitud de demo — Landing</h2>

    <p style="
      margin: 0 0 20px;
      color: ${BRAND.textBody};
      font-size: 15px;
      line-height: 1.65;
    ">
      Alguien envió el formulario <strong>Habla con un experto</strong> desde la web pública.
      Estos son los datos para que el equipo comercial haga seguimiento:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 16px;">
      <tbody>
        ${row('Nombre', name)}
        ${row('Email', email)}
        ${row('Empresa', company)}
        ${row('Checks al mes (rango)', volumeLabel)}
      </tbody>
    </table>

    ${infoBox('Responde desde <strong>hola@cheky.co</strong> o tu CRM usando el email del lead. No respondas automáticamente a esta bandeja si es solo notificación interna.')}
  `;

  return emailLayout(content, showLogo);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
