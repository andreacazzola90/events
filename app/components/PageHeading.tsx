import type { ReactNode } from "react";

type PageHeadingProps = {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function PageHeading({
  kicker,
  title,
  description,
  action,
  className = "",
}: PageHeadingProps) {
  const headingClassName = `page-heading ${className}`.trim();
  const displayTitle = typeof title === "string" ? title.replace(/\.+$/, "") : title;

  return (
    <header className={headingClassName}>
      <div className="page-heading-copy">
        <div className="section-kicker page-heading-kicker">
          {kicker ?? <span aria-hidden="true">&nbsp;</span>}
        </div>
        <h1 className="page-heading-title">
          {displayTitle}<span className="page-heading-dot" aria-hidden="true">.</span>
        </h1>
        {description && <p className="page-heading-description">{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  );
}