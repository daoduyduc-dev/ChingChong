import Swal from "sweetalert2";
import { toast } from "sonner";
import "sweetalert2/dist/sweetalert2.min.css";

const dialog = Swal.mixin({
  heightAuto: false,
  buttonsStyling: false,
  showCancelButton: true,
  confirmButtonText: "Xác nhận",
  cancelButtonText: "Hủy",
  focusCancel: true,
  keydownListenerCapture: true,
  customClass: {
    popup: "kv-dialog",
    title: "kv-dialog-title",
    htmlContainer: "kv-dialog-text",
    confirmButton: "kv-dialog-confirm",
    cancelButton: "kv-dialog-cancel",
    input: "kv-dialog-input",
  },
});

export function notify(
  text: string,
  tone: "success" | "error" | "warning" | "info" = "info",
) {
  toast[tone](text, {
    id: "app-notice",
    duration: tone === "error" ? 9000 : 6500,
  });
}

export async function confirmAction(text: string) {
  const result = await dialog.fire({
    title: "Xác nhận thao tác",
    text,
    icon: "question",
  });
  return result.isConfirmed;
}

export async function requestReport(text: string) {
  const result = await dialog.fire<string>({
    title: "Báo cáo người chơi",
    text,
    icon: "info",
    input: "textarea",
    inputPlaceholder: "Mô tả sự việc để quản trị viên xem xét…",
    inputAttributes: { maxlength: "1000", "aria-label": "Nội dung báo cáo" },
    confirmButtonText: "Gửi báo cáo",
    focusCancel: false,
    inputValidator: (value) =>
      value.trim().length < 5 ? "Vui lòng nhập ít nhất 5 ký tự." : undefined,
  });
  return result.isConfirmed ? (result.value?.trim() ?? null) : null;
}
