import Link from "next/link";

export default function TripNotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-8">
      <p className="colhead">404</p>
      <h1 className="plate mt-2 text-[clamp(1.75rem,5vw,2.75rem)]">No trip at this link</h1>
      <p className="mt-4 max-w-prose text-[1rem] leading-snug">
        That trip id is not in the store. A trip lives in the shared state store, not in the URL, so
        a companion link only works while the trip it points at exists.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-control bg-accent px-5 py-2.5 text-[0.9375rem] font-semibold text-paper transition-transform duration-150 hover:bg-accent-ink active:scale-[0.97]"
      >
        Plan a Trip
      </Link>
    </main>
  );
}
