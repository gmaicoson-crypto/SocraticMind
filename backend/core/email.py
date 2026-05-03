import sys
import smtplib
import logging
import secrets
from email.message import EmailMessage
from email.utils import formataddr
from .config import settings

log = logging.getLogger(__name__)


def _print_code_to_console(to: str, code: str, purpose: str) -> None:
    """开发环境用：用 stderr + flush 打印，绕开 stdout 块缓冲，确保 uvicorn 控制台立刻可见。"""
    banner = (
        "\n"
        "============================================================\n"
        f"  [DEV-EMAIL] 验证码（开发模式 / 未配置 SMTP）\n"
        f"  收件人 : {to}\n"
        f"  用途   : {purpose}\n"
        f"  验证码 : {code}\n"
        "============================================================\n"
    )
    # stderr 默认行缓冲，且 uvicorn 会原样转发到控制台
    sys.stderr.write(banner)
    sys.stderr.flush()
    # 同时走 stdout，部分日志收集器只读 stdout
    sys.stdout.write(banner)
    sys.stdout.flush()


def generate_code() -> str:
    """secrets 而非 random：避免可预测序列被脚本批量爆破。"""
    return f"{secrets.randbelow(1_000_000):06d}"


def _build_message(to: str, code: str, purpose: str) -> EmailMessage:
    action = "注册" if purpose == "register" else "重置密码"
    msg = EmailMessage()
    msg["Subject"] = f"【{settings.app_name}】{action}验证码：{code}"
    msg["From"] = formataddr((settings.app_name, settings.smtp_from or settings.smtp_user))
    msg["To"] = to
    msg.set_content(
        f"您正在{action} {settings.app_name}。\n\n"
        f"验证码：{code}\n"
        f"有效期 10 分钟，请勿泄露给他人。\n\n"
        f"若非本人操作，请忽略此邮件。"
    )
    msg.add_alternative(
        f"""<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f8fb;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #e7ebf1;">
    <h2 style="margin:0 0 8px;color:#1a3b66;">{settings.app_name}</h2>
    <div style="color:#6b7c93;font-size:13px;margin-bottom:24px;">{action}验证码</div>
    <div style="font-size:30px;letter-spacing:.32em;font-weight:700;color:#1f6feb;
                background:#eef4ff;border:1px dashed #b9d0f7;border-radius:10px;
                padding:18px;text-align:center;font-family:monospace;">{code}</div>
    <p style="color:#475569;font-size:13.5px;line-height:1.7;margin-top:24px;">
      请在 10 分钟内填入验证码完成{action}。<br>
      若非本人操作，请忽略本邮件，您的账号是安全的。
    </p>
    <hr style="border:none;border-top:1px solid #eef2f7;margin:24px 0;">
    <div style="color:#94a3b8;font-size:11.5px;">本邮件由系统自动发送，请勿直接回复。</div>
  </div>
</body></html>""",
        subtype="html",
    )
    return msg


def send_verification_email(to: str, code: str, purpose: str) -> None:
    """未配置 smtp_host 时只打印控制台，避免本地启动卡在 SMTP 连接超时。
       配置了 SMTP 仍会同步打印一份到控制台，便于开发期排错。"""
    if not settings.smtp_host:
        _print_code_to_console(to, code, purpose)
        return

    # 配 SMTP 也先打印一份：万一 SMTP 抽风，控制台仍能拿到码继续测试
    _print_code_to_console(to, code, purpose)

    msg = _build_message(to, code, purpose)
    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
    except Exception as e:
        log.error("发送验证码邮件失败 to=%s err=%s", to, e)
        raise
