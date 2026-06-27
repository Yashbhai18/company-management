import React from 'react';

const paths: Record<string, { path: React.ReactNode; viewBox?: string }> = {
  people: {
    // 24x24 outline people icon
    path: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.978 11.978 0 0112 20.25a11.978 11.978 0 01-3-1.013V19.13c0-1.112-.285-2.16-.786-3.07M12 15.75a6.002 6.002 0 00-4-2.25 4.125 4.125 0 00-7.533 2.493 9.337 9.337 0 004.121.952 9.38 9.38 0 002.625-.372m3-8.25a3 3 0 11-6 0 3 3 0 016 0zm9-1.5a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
    viewBox: '0 0 24 24',
  },
  organization: {
    // 24x24 outline building icon
    path: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75H21m-3.75 3.75H21" />
      </>
    ),
    viewBox: '0 0 24 24',
  },
  settings: {
    // 24x24 outline settings gear icon
    path: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </>
    ),
    viewBox: '0 0 24 24',
  },
  check: {
    // 24x24 outline checkmark
    path: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </>
    ),
    viewBox: '0 0 24 24',
  },
  'arrow-right': {
    // 24x24 outline arrow right
    path: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
      </>
    ),
    viewBox: '0 0 24 24',
  }
};

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: 'people' | 'organization' | 'settings' | 'check' | 'arrow-right' | string;
  size?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 16, className, ...props }) => {
  const iconData = paths[name];
  if (!iconData) {
    console.warn(`Icon "${name}" not found in custom Icon registry.`);
    return null;
  }

  const { path, viewBox = '0 0 24 24' } = iconData;

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={className}
      {...props}
    >
      {path}
    </svg>
  );
};

export default Icon;
