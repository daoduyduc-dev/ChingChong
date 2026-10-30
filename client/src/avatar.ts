export async function compressAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Chọn ảnh PNG, JPEG hoặc WebP.");
  if (file.size > 10000000) throw Error("Ảnh gốc tối đa 10MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Không thể xử lý ảnh trên trình duyệt này.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const value = canvas.toDataURL("image/webp", 0.85);
    if (value.length > 533000)
      throw Error("Ảnh sau xử lý vẫn quá lớn. Hãy chọn ảnh nhỏ hơn.");
    return value;
  } finally {
    image.close();
  }
}
