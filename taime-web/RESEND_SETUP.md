# Configuração de Email — Resend + Supabase

Instruções para envio de magic links via `noreply@taime.tech` usando o Resend.

---

## 1. Verificar o domínio no Resend

1. Acesse **resend.com/domains**
2. Clique em **Add Domain** → insira `taime.tech`
3. Adicione os registros DNS gerados (SPF, DKIM, DMARC) no seu provedor
4. Aguarde a propagação (5–30 min) e clique em **Verify**

---

## 2. SMTP customizado no Supabase

No **Supabase Dashboard → Authentication → SMTP Settings**, ative "Custom SMTP" e preencha:

| Campo       | Valor                        |
|-------------|------------------------------|
| Host        | `smtp.resend.com`            |
| Port        | `465`                        |
| User        | `resend`                     |
| Password    | `re_xxxxxxxxx` (RESEND_API_KEY) |
| Sender name | `TAIME`                      |
| Sender email| `noreply@taime.tech`         |

> **Atenção:** use a API Key do Resend como senha SMTP. Não é necessário configurar nada no `.env.local` do Next.js — o SMTP é gerenciado pelo Supabase.

---

## 3. URL Configuration

No **Supabase Dashboard → Authentication → URL Configuration**:

| Campo         | Desenvolvimento                        | Produção                               |
|---------------|----------------------------------------|----------------------------------------|
| Site URL      | `http://localhost:3000`                | `https://taime.tech`                   |
| Redirect URLs | `http://localhost:3000/auth/callback`  | `https://taime.tech/auth/callback`     |

---

## 4. Template do magic link

No **Supabase Dashboard → Authentication → Email Templates → Magic Link**:

**Subject:**
```
Seu acesso ao TAIME
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f4ff;
      padding: 40px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper { max-width: 480px; margin: 0 auto; }
    .card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .header {
      background: #0f1a3d;
      padding: 28px 36px;
    }
    .logo {
      color: white;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .body { padding: 36px; }
    .body h2 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 10px;
    }
    .body p {
      font-size: 14px;
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn {
      display: block;
      text-align: center;
      background: #1D4ED8;
      color: white !important;
      text-decoration: none;
      padding: 14px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 24px;
    }
    .note {
      font-size: 12px !important;
      color: #9ca3af !important;
      margin-bottom: 0 !important;
    }
    .footer {
      padding: 20px 36px;
      border-top: 1px solid #f3f4f6;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.5;
    }
    .footer a { color: #1D4ED8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">TAIME</div>
      </div>
      <div class="body">
        <h2>Seu link de acesso</h2>
        <p>
          Clique no botão abaixo para acessar os relatórios de inteligência estratégica do TAIME.
          O link expira em <strong>1 hora</strong>.
        </p>
        <a href="{{ .ConfirmationURL }}" class="btn">Acessar TAIME →</a>
        <p class="note">
          Se você não solicitou este acesso, ignore este email com segurança.
        </p>
      </div>
      <div class="footer">
        TAIME · Inteligência estratégica em tecnologia para PMEs<br>
        <a href="https://taime.tech">taime.tech</a>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## 5. Testar

1. Acesse `http://localhost:3000/login`
2. Insira um email válido e clique em **Enviar link de acesso**
3. Verifique a caixa de entrada — o email deve chegar de `noreply@taime.tech`
4. Clique no botão → deve redirecionar para `/dashboard`

---

## 6. Rate limits do Resend

| Plano  | Emails/mês | Emails/s |
|--------|-----------|----------|
| Free   | 3.000     | 2/s      |
| Pro    | ilimitado | 10/s     |

Para um produto com poucos usuários (MVP), o plano Free é suficiente.
