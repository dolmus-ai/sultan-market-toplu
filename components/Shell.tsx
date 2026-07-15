"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

const NAV = [
  { href: "/", label: "Özet", icon: "🏠" },
  { href: "/cariler", label: "Cariler", icon: "📒" },
  { href: "/islem", label: "İşlem", icon: "＋" },
  { href: "/raporlar", label: "Raporlar", icon: "📊" },
  { href: "/kullanicilar", label: "Kişiler", icon: "👤" },
];

export default function Shell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { session, loading, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-stone-400">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-green-800 px-4 py-3 text-white shadow">
        <div>
          <div className="text-xs text-green-200">Sultan Market</div>
          <h1 className="text-lg font-bold leading-tight">
            {title ?? "Bakkal Defteri"}
          </h1>
        </div>
        <div className="text-right text-xs text-green-100">
          {profile?.full_name}
        </div>
      </header>

      <main className="flex-1 px-3 pb-24 pt-3">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg justify-around border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        {NAV.map((n) => {
          const active =
            n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const isMiddle = n.href === "/islem";
          return (
            <Link
              key={n.href}
              href={n.href}
              className={
                isMiddle
                  ? "-mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-2xl font-bold text-white shadow-lg"
                  : `flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] ${
                      active ? "font-bold text-green-700" : "text-stone-500"
                    }`
              }
            >
              <span className={isMiddle ? "" : "text-lg leading-none"}>
                {n.icon}
              </span>
              {!isMiddle && n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
