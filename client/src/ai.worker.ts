import { choose } from "../../shared/ai";
self.onmessage = (e) => {
  try {
    self.postMessage({
      id: e.data.id,
      ...choose(e.data.position, e.data.level),
    });
  } catch {
    self.postMessage({
      id: e.data.id,
      error: "Không thể tính nước. Thử mức Dễ.",
    });
  }
};
