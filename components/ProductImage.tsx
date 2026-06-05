type Props = {
  category: string;
  brand?: string | null;
  size?: 'sm' | 'lg';
};

type CategoryStyle = {
  bg: string;
  accent: string;
  svgPath: string;
};

const categoryStyles: Record<string, CategoryStyle> = {
  cleanser: {
    bg: 'from-sky-100 to-blue-50',
    accent: '#60a5fa',
    svgPath: `
      <!-- pump bottle -->
      <rect x="85" y="110" width="70" height="110" rx="12" fill="currentColor" opacity="0.8"/>
      <rect x="100" y="80" width="40" height="35" rx="6" fill="currentColor" opacity="0.6"/>
      <rect x="113" y="60" width="14" height="25" rx="4" fill="currentColor" opacity="0.5"/>
      <rect x="105" y="58" width="30" height="8" rx="4" fill="currentColor" opacity="0.4"/>
      <rect x="135" y="62" width="18" height="6" rx="3" fill="currentColor" opacity="0.35"/>
      <rect x="95" y="145" width="50" height="3" rx="2" fill="white" opacity="0.4"/>
      <rect x="95" y="155" width="35" height="3" rx="2" fill="white" opacity="0.3"/>
    `,
  },
  moisturiser: {
    bg: 'from-rose-100 to-pink-50',
    accent: '#fb7185',
    svgPath: `
      <!-- wide cream jar -->
      <ellipse cx="120" cy="148" rx="68" ry="16" fill="currentColor" opacity="0.4"/>
      <rect x="52" y="148" width="136" height="82" rx="8" fill="currentColor" opacity="0.75"/>
      <ellipse cx="120" cy="230" rx="68" ry="14" fill="currentColor" opacity="0.5"/>
      <!-- lid -->
      <ellipse cx="120" cy="148" rx="68" ry="16" fill="currentColor" opacity="0.9"/>
      <ellipse cx="120" cy="144" rx="60" ry="12" fill="white" opacity="0.25"/>
      <rect x="95" y="162" width="50" height="3" rx="2" fill="white" opacity="0.4"/>
      <rect x="100" y="172" width="40" height="3" rx="2" fill="white" opacity="0.3"/>
    `,
  },
  spf: {
    bg: 'from-amber-100 to-yellow-50',
    accent: '#f59e0b',
    svgPath: `
      <!-- sunscreen tube -->
      <rect x="88" y="75" width="64" height="150" rx="32" fill="currentColor" opacity="0.8"/>
      <rect x="100" y="62" width="40" height="18" rx="6" fill="currentColor" opacity="0.6"/>
      <rect x="108" y="52" width="24" height="14" rx="5" fill="currentColor" opacity="0.5"/>
      <rect x="95" y="130" width="50" height="3" rx="2" fill="white" opacity="0.45"/>
      <rect x="98" y="140" width="44" height="3" rx="2" fill="white" opacity="0.3"/>
      <!-- sun rays -->
      <circle cx="168" cy="85" r="12" fill="currentColor" opacity="0.25"/>
      <line x1="168" y1="68" x2="168" y2="62" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
      <line x1="180" y1="73" x2="184" y2="69" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
      <line x1="180" y1="97" x2="184" y2="101" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
      <line x1="155" y1="97" x2="151" y2="101" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
      <line x1="155" y1="73" x2="151" y2="69" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
    `,
  },
  serum: {
    bg: 'from-purple-100 to-violet-50',
    accent: '#a78bfa',
    svgPath: `
      <!-- dropper bottle -->
      <rect x="98" y="120" width="44" height="110" rx="22" fill="currentColor" opacity="0.8"/>
      <rect x="104" y="88" width="32" height="36" rx="6" fill="currentColor" opacity="0.65"/>
      <!-- dropper bulb -->
      <ellipse cx="120" cy="82" rx="20" ry="14" fill="currentColor" opacity="0.5"/>
      <ellipse cx="120" cy="76" rx="16" ry="10" fill="currentColor" opacity="0.35"/>
      <!-- dropper tip -->
      <rect x="117" y="58" width="6" height="22" rx="3" fill="currentColor" opacity="0.4"/>
      <circle cx="120" cy="56" r="4" fill="currentColor" opacity="0.5"/>
      <rect x="106" y="150" width="28" height="3" rx="2" fill="white" opacity="0.45"/>
      <rect x="109" y="160" width="22" height="3" rx="2" fill="white" opacity="0.3"/>
    `,
  },
  toner: {
    bg: 'from-teal-100 to-emerald-50',
    accent: '#34d399',
    svgPath: `
      <!-- spray bottle -->
      <rect x="90" y="100" width="60" height="130" rx="14" fill="currentColor" opacity="0.8"/>
      <rect x="105" y="72" width="32" height="32" rx="6" fill="currentColor" opacity="0.65"/>
      <!-- spray head -->
      <rect x="130" y="68" width="28" height="14" rx="5" fill="currentColor" opacity="0.5"/>
      <rect x="154" y="74" width="14" height="6" rx="3" fill="currentColor" opacity="0.35"/>
      <!-- spray dots -->
      <circle cx="178" cy="72" r="3" fill="currentColor" opacity="0.25"/>
      <circle cx="183" cy="66" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="186" cy="78" r="2" fill="currentColor" opacity="0.2"/>
      <circle cx="180" cy="60" r="1.5" fill="currentColor" opacity="0.15"/>
      <rect x="97" y="148" width="46" height="3" rx="2" fill="white" opacity="0.4"/>
      <rect x="100" y="158" width="38" height="3" rx="2" fill="white" opacity="0.3"/>
    `,
  },
  'eye cream': {
    bg: 'from-indigo-100 to-blue-50',
    accent: '#818cf8',
    svgPath: `
      <!-- small luxury jar with lid -->
      <ellipse cx="120" cy="152" rx="56" ry="13" fill="currentColor" opacity="0.45"/>
      <rect x="64" y="152" width="112" height="72" rx="8" fill="currentColor" opacity="0.75"/>
      <ellipse cx="120" cy="224" rx="56" ry="11" fill="currentColor" opacity="0.5"/>
      <!-- lid -->
      <ellipse cx="120" cy="152" rx="56" ry="13" fill="currentColor" opacity="0.95"/>
      <ellipse cx="120" cy="149" rx="48" ry="10" fill="white" opacity="0.2"/>
      <!-- gold accent ring -->
      <ellipse cx="120" cy="152" rx="56" ry="13" fill="none" stroke="white" stroke-width="2" opacity="0.3"/>
      <rect x="92" y="168" width="56" height="3" rx="2" fill="white" opacity="0.4"/>
      <rect x="96" y="178" width="48" height="3" rx="2" fill="white" opacity="0.3"/>
      <rect x="100" y="188" width="40" height="3" rx="2" fill="white" opacity="0.2"/>
    `,
  },
};

const fallback: CategoryStyle = {
  bg: 'from-gray-100 to-slate-50',
  accent: '#94a3b8',
  svgPath: `
    <circle cx="120" cy="155" r="55" fill="currentColor" opacity="0.4"/>
    <circle cx="120" cy="155" r="38" fill="currentColor" opacity="0.3"/>
    <circle cx="120" cy="155" r="22" fill="currentColor" opacity="0.2"/>
  `,
};

export default function ProductImage({ category, brand, size = 'lg' }: Props) {
  const style = categoryStyles[category.toLowerCase()] ?? fallback;
  const initial = brand?.charAt(0).toUpperCase() ?? '?';
  const h = size === 'sm' ? 48 : 160;

  return (
    <div
      className={`w-full bg-gradient-to-br ${style.bg} flex items-center justify-center relative overflow-hidden`}
      style={{ height: h }}
    >
      <svg
        viewBox="0 0 240 300"
        className="absolute inset-0 w-full h-full"
        style={{ color: style.accent }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: style.svgPath }}
      />
      {size === 'sm' && (
        <span
          className="relative z-10 text-base font-bold"
          style={{ color: style.accent }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
