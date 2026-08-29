export function MarkaIsareti({ boyut = 40 }: { boyut?: number }) {
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <rect width="48" height="48" rx="14" fill="#0e0e11" />
      <path
        d="M24 9c-5.8 0-10.5 4.5-10.5 10.1 0 7.4 8.6 16.3 10 17.7a.7.7 0 0 0 1 0c1.4-1.4 10-10.3 10-17.7C34.5 13.5 29.8 9 24 9Z"
        fill="#e30a17"
      />
      <path
        d="M19.6 17.6h8.8l-.8 7.2a2 2 0 0 1-2 1.8h-3.2a2 2 0 0 1-2-1.8l-.8-7.2Z"
        fill="#fff"
      />
      <path
        d="M21.4 17.6a2.6 2.6 0 0 1 5.2 0"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MarkaYazi({ ton = "koyu" }: { ton?: "koyu" | "acik" }) {
  const ana = ton === "koyu" ? "text-siyah" : "text-white";
  return (
    <span className={`font-extrabold tracking-tight ${ana}`}>
      SULTAN<span className="text-kirmizi">.</span>
      <span className="ml-1 text-[0.65em] font-bold uppercase tracking-[0.18em] text-gri">
        Kurye
      </span>
    </span>
  );
}
