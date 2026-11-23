const nodemailer = require("nodemailer");

const hasMailConfiguration = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

const escapeHtml = (value = "") =>
  value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

const emailCopy = {
  sv: {
    subject: "Din registrering hos Swedish For All är klar",
    heading: "Tack för din registrering!",
    body: "Ditt konto har skapats. När en administratör har aktiverat ditt premiumkonto får du tillgång till tester, videor, forum och meddelanden.",
  },
  en: {
    subject: "Your Swedish For All registration is complete",
    heading: "Thank you for registering!",
    body: "Your account has been created. When an administrator activates your premium account, you will have access to tests, videos, the forum and messages.",
  },
  fa: {
    subject: "ثبت‌نام شما در Swedish For All انجام شد",
    heading: "از ثبت‌نام شما سپاسگزاریم!",
    body: "حساب کاربری شما ایجاد شد. پس از فعال‌سازی حساب پریمیوم توسط مدیر، به آزمون‌ها، ویدئوها، انجمن و پیام‌ها دسترسی خواهید داشت.",
  },
};

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

exports.sendRegistrationConfirmation = async ({ name, email, language = "sv" }) => {
  if (!hasMailConfiguration()) {
    console.warn("Registration email was skipped: SMTP settings are missing.");
    return false;
  }

  const copy = emailCopy[language] || emailCopy.sv;
  const safeName = escapeHtml(name);
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: copy.subject,
    text: `${copy.heading}\n\nHej ${name}!\n\n${copy.body}`,
    html: `
      <main style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#00296b;padding:32px">
        <h1 style="margin:0 0 20px">${copy.heading}</h1>
        <p>Hej ${safeName}!</p>
        <p>${copy.body}</p>
        <p style="margin-top:28px">Swedish For All</p>
      </main>
    `,
  });

  return true;
};
