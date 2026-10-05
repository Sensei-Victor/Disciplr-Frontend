import { Link, useLocation } from 'react-router-dom';
import type { Path, To } from 'react-router-dom';

interface NavLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  ariaLabel?: string;
}

function isPathObject(target: To): target is Partial<Path> {
  return typeof target === 'object' && target !== null;
}

/**
 * Navigation link component with route-aware active styling and accessibility attributes.
 */
export default function NavLink({ to, className = '', children, ariaLabel, ...props }: NavLinkProps) {
  const location = useLocation();
  const toStr = typeof to === 'string' ? to : isPathObject(to) ? to.pathname ?? '' : '';
  const isActive = toStr === '/'
    ? location.pathname === '/'
    : Boolean(toStr && location.pathname.startsWith(toStr));
  const combinedClass = `${className} ${isActive ? 'active' : ''}`.trim();
  return (
    <Link
      to={to}
      className={combinedClass}
      aria-label={ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}

