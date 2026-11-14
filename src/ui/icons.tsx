import type { ReactNode, SVGProps } from 'react'

const base = (children: ReactNode) => (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
)

export const IconField = base(<><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M12 5v14M3 9h3v6H3M21 9h-3v6h3" /><circle cx="12" cy="12" r="2.2" /></>)
export const IconVersus = base(<><path d="M4 6l4 12 4-12" /><path d="M20 8.2c-.6-1.4-1.9-2.2-3.4-2.2-1.9 0-3.3 1.1-3.3 2.8 0 4 7 2.1 7 6.2 0 1.8-1.5 3-3.6 3-1.8 0-3.2-.9-3.8-2.4" /></>)
export const IconCalendar = base(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>)
export const IconCoins = base(<><ellipse cx="9" cy="8" rx="5.5" ry="2.8" /><path d="M3.5 8v4c0 1.5 2.5 2.8 5.5 2.8M3.5 12v4c0 1.5 2.5 2.8 5.5 2.8" /><ellipse cx="15.5" cy="14" rx="5" ry="2.6" /><path d="M10.5 14v3.4c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6V14" /></>)
export const IconPulse = base(<path d="M3 12h4l2-5 4 10 2.5-7 1.5 2h4" />)
export const IconNews = base(<><rect x="3.5" y="5" width="14" height="14" rx="1.5" /><path d="M17.5 9h3v8.5a1.5 1.5 0 0 1-3 0M7 9h7M7 12.5h7M7 16h4" /></>)
export const IconInfo = base(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></>)
export const IconSearch = base(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>)
export const IconSpark = base(<><path d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" /><path d="M19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>)
export const IconClose = base(<path d="M6 6l12 12M18 6L6 18" />)
export const IconChevronLeft = base(<path d="M14.5 5.5L8 12l6.5 6.5" />)
export const IconChevronRight = base(<path d="M9.5 5.5L16 12l-6.5 6.5" />)
export const IconExternal = base(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>)
export const IconShare = base(<><circle cx="6" cy="12" r="2.4" /><circle cx="17.5" cy="6" r="2.4" /><circle cx="17.5" cy="18" r="2.4" /><path d="M8.1 10.9l7.3-3.8M8.1 13.1l7.3 3.8" /></>)
export const IconSend = base(<path d="M4 12l16-7-6 16-2.5-6.5z" />)
export const IconTarget = base(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>)
