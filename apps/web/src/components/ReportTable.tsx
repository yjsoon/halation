import { useCallback, type ReactNode } from "react";

/** Keep the comparison scrollable, and fade only an edge with more columns beyond it. */
export function ReportTable({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const measure = () => {
      element.toggleAttribute("data-scrollable", element.scrollWidth - element.clientWidth > 1);
      element.toggleAttribute("data-more-columns", element.scrollWidth - element.clientWidth - element.scrollLeft > 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  return <div ref={ref} className={`table-wrap report-table${wide ? " table-wrap-wide" : ""}`} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}
