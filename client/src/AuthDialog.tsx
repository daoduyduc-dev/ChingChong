import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, X } from "lucide-react";
export type AuthMode = "login" | "register" | "forgot" | "reset";
export function AuthDialog({
  mode,
  busy,
  error,
  identifier,
  oauth,
  onMode,
  onClose,
  onSubmit,
}: {
  mode: AuthMode;
  busy: boolean;
  error: string;
  identifier: string;
  oauth: { google?: boolean };
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false),
    [password, setPassword] = useState(""),
    [invalid, setInvalid] = useState<Record<string, string>>({});
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    setVisible(false);
    setPassword("");
    setInvalid({});
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [mode]);
  const field = (name: string) => ({
    "aria-invalid": !!invalid[name],
    "aria-describedby": invalid[name] ? "auth-" + name + "-error" : undefined,
  });
  const note = (name: string) =>
    invalid[name] && (
      <small id={"auth-" + name + "-error"} className="field-error">
        {invalid[name]}
      </small>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const errors: Record<string, string> = {};
    for (const input of Array.from(
      form.querySelectorAll<HTMLInputElement>("input"),
    ))
      if (!input.validity.valid)
        errors[input.name] = input.validity.valueMissing
          ? "Vui lòng nhập trường này."
          : input.name === "email"
            ? "Email chưa đúng định dạng."
            : "Giá trị chưa đúng định dạng.";
    if (
      mode !== "login" &&
      mode !== "forgot" &&
      (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    )
      errors.password = "Mật khẩu cần ít nhất 8 ký tự, có chữ và số.";
    setInvalid(errors);
    if (Object.keys(errors).length) {
      form
        .querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)
        ?.focus();
      return;
    }
    await onSubmit(event);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal card"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Xác thực"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
            ),
          );
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="modal-close"
          disabled={busy}
          onClick={onClose}
          aria-label="Đóng"
        >
          <X aria-hidden="true" size={22} />
        </button>
        <span className="brand-mark" aria-hidden="true">
          將
        </span>
        <h2>
          {
            {
              login: "Chào mừng trở lại",
              register: "Gia nhập Kỳ Viện",
              forgot: "Quên mật khẩu",
              reset: "Đặt lại mật khẩu",
            }[mode]
          }
        </h2>
        {error && (
          <p role="alert" className="field-error" id="auth-server-error">
            {error}
          </p>
        )}
        <form
          key={mode}
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-describedby={error ? "auth-server-error" : undefined}
        >
          {mode === "register" && (
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                pattern="[a-zA-Z0-9_]{3,32}"
                required
                {...field("username")}
              />
              {note("username")}
            </label>
          )}
          {["register", "forgot"].includes(mode) && (
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                {...field("email")}
              />
              {note("email")}
            </label>
          )}
          {mode === "login" && (
            <label>
              Email hoặc username
              <input
                name="identifier"
                autoComplete="username"
                defaultValue={identifier}
                required
                {...field("identifier")}
              />
              {note("identifier")}
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Mật khẩu
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  minLength={mode === "login" ? 1 : 8}
                  maxLength={72}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  {...field("password")}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? (
                    <EyeOff aria-hidden="true" size={20} />
                  ) : (
                    <Eye aria-hidden="true" size={20} />
                  )}
                </button>
              </div>
              {note("password")}
              {mode !== "login" && (
                <small aria-live="polite">
                  {password.length >= 12 &&
                  /[a-zA-Z]/.test(password) &&
                  /\d/.test(password)
                    ? "Mật khẩu tốt."
                    : password.length >= 8 &&
                        /[a-zA-Z]/.test(password) &&
                        /\d/.test(password)
                      ? "Mật khẩu hợp lệ. Dùng 12 ký tự trở lên để tăng độ mạnh."
                      : "Ít nhất 8 ký tự, có chữ và số."}
                </small>
              )}
            </label>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Đang xử lý…"
              : {
                  login: "Đăng nhập",
                  register: "Tạo tài khoản",
                  forgot: "Gửi liên kết",
                  reset: "Đổi mật khẩu",
                }[mode]}
          </button>
        </form>
        {["login", "register"].includes(mode) && (
          <>
            <div className="actions">
              <button
                disabled={!oauth.google || busy}
                onClick={() => {
                  location.href = "/api/auth/oauth/google";
                }}
              >
                Google
              </button>
            </div>
            {!oauth.google && (
              <small>
                Đăng nhập Google chưa được cấu hình trên máy chủ này.
              </small>
            )}
            <button
              className="text-btn full"
              disabled={busy}
              onClick={() => onMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </button>
            <button
              className="text-btn full"
              disabled={busy}
              onClick={() => onMode("forgot")}
            >
              Quên mật khẩu
            </button>
          </>
        )}
      </section>
    </div>
  );
}
