# Configurar SMTP do Supabase com Resend

## No painel do Supabase:
1. Acessa Authentication → Settings → SMTP Settings
2. Habilita "Enable Custom SMTP"
3. Preenche:
   - Host: smtp.resend.com
   - Port: 465
   - Username: resend
   - Password: (sua RESEND_API_KEY)
   - Sender email: noreply@taime.tech
   - Sender name: TAIME

## Template do email de magic link:
Em Authentication → Email Templates → Magic Link,
substitui o conteúdo por:

Subject: "Your TAIME access link"

Body HTML:
```html
<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; background: #0F172A; color: white; padding: 48px; max-width: 600px; margin: 0 auto;">
  <div style="margin-bottom: 32px;">
    <span style="font-size: 20px; font-weight: bold; letter-spacing: 4px;">TAIME</span>
  </div>
  <h1 style="font-size: 24px; margin-bottom: 16px;">
    Your access link
  </h1>
  <p style="color: rgba(255,255,255,0.7); line-height: 1.7;">
    Click the button below to access TAIME.
    This link expires in 1 hour and can only be used once.
  </p>
  <a href="{{ .ConfirmationURL }}"
    style="display: inline-block; margin: 24px 0;
      background: #2563EB; color: white; padding: 14px 28px;
      border-radius: 8px; text-decoration: none;
      font-weight: bold; letter-spacing: 1px;">
    Access TAIME →
  </a>
  <p style="color: rgba(255,255,255,0.4); font-size: 12px;">
    If you didn't request this link, you can safely ignore
    this email.
  </p>
  <div style="margin-top: 32px; padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4); font-size: 12px;">
    TAIME · Strategic Technology Intelligence<br/>
    contact@taime.tech · taime.tech
  </div>
</body>
</html>
```
