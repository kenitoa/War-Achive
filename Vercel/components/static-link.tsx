import type { AnchorHTMLAttributes } from 'react';

// Each destination is a published HTML document. Native links also work without
// JavaScript and avoid requesting a live server-component endpoint on static hosts.
export default function StaticLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
