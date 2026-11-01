export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Đang tải danh sách" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index} aria-hidden="true">
          <span className="skeleton" style={{ width: "65%" }} />
          <span className="skeleton" style={{ width: "90%" }} />
        </div>
      ))}
    </div>
  );
}
